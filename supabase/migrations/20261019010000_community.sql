-- Separate opt-in public community. Never reads or modifies private-family tables.
begin;
create table private.community_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique not null references auth.users on delete cascade,
  display_name text not null check(char_length(trim(display_name)) between 1 and 60),
  bio text not null default '' check(char_length(bio)<=240),
  adult_confirmed_at timestamptz not null,
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);
create table private.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references private.community_profiles on delete cascade,
  parent_id uuid references private.community_posts on delete cascade,
  body text not null check(char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz
);
create index community_posts_feed on private.community_posts(created_at desc,id desc) where parent_id is null;
create index community_posts_author on private.community_posts(author_id,created_at);
create index community_posts_parent on private.community_posts(parent_id,created_at);
create table private.community_likes (
  post_id uuid references private.community_posts on delete cascade,
  profile_id uuid references private.community_profiles on delete cascade,
  primary key(post_id,profile_id)
);
create table private.community_blocks (
  blocker uuid references private.community_profiles on delete cascade,
  blocked uuid references private.community_profiles on delete cascade,
  primary key(blocker,blocked), check(blocker<>blocked)
);
create index community_blocks_reverse on private.community_blocks(blocked,blocker);
create table private.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references private.community_profiles on delete cascade,
  post_id uuid not null references private.community_posts on delete cascade,
  reason text not null check(reason in ('privacy','harassment','spam','other')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(reporter,post_id)
);
-- No client table access: allowlisted RPC output omits account IDs and reports.
alter table private.community_profiles enable row level security;
alter table private.community_posts enable row level security;
alter table private.community_likes enable row level security;
alter table private.community_blocks enable row level security;
alter table private.community_reports enable row level security;
revoke all on private.community_profiles,private.community_posts,private.community_likes,private.community_blocks,private.community_reports from public,anon,authenticated;

create function private.community_visible(target uuid, viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.community_posts p
    join private.community_profiles a on a.id=p.author_id
    where p.id=target and p.removed_at is null and not a.suspended
    and not exists(select 1 from private.community_blocks b where
      (b.blocker=viewer and b.blocked=a.id) or (b.blocker=a.id and b.blocked=viewer))
    and (p.parent_id is null or exists(select 1 from private.community_posts parent
      join private.community_profiles pa on pa.id=parent.author_id
      where parent.id=p.parent_id and parent.removed_at is null and not pa.suspended
      and not exists(select 1 from private.community_blocks b where
        (b.blocker=viewer and b.blocked=pa.id) or (b.blocker=pa.id and b.blocked=viewer)))));
$$;
revoke all on function private.community_visible(uuid,uuid) from public,anon,authenticated;

create function public.community_read(request jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me private.community_profiles; items jsonb; profile jsonb; blocks jsonb;
  thread uuid := nullif(request->>'thread','')::uuid;
  person uuid := nullif(request->>'profile','')::uuid;
  before_time timestamptz := coalesce((request->>'before_time')::timestamptz,'infinity');
  before_id uuid := coalesce((request->>'before_id')::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff');
begin
  select * into me from private.community_profiles where account_id=auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'author_id',a.id,'name',a.display_name,
    'body',p.body,'created_at',p.created_at,'parent_id',p.parent_id,
    'likes',(select count(*) from private.community_likes l where l.post_id=p.id),
    'liked',exists(select 1 from private.community_likes l where l.post_id=p.id and l.profile_id=me.id),
    'replies',(select count(*) from private.community_posts r where r.parent_id=p.id and private.community_visible(r.id,me.id)))
    order by p.created_at desc,p.id desc),'[]') into items
  from (select p.* from private.community_posts p
    where private.community_visible(p.id,me.id)
    and (case when thread is not null then p.id=thread or p.parent_id=thread
      when person is not null then p.author_id=person else p.parent_id is null end)
    and (p.created_at,p.id)<(before_time,before_id)
    order by p.created_at desc,p.id desc limit 20) p
  join private.community_profiles a on a.id=p.author_id;
  if person is not null then
    select jsonb_build_object('id',a.id,'name',a.display_name,'bio',a.bio) into profile
    from private.community_profiles a where a.id=person and not a.suspended
    and not exists(select 1 from private.community_blocks b where
      (b.blocker=me.id and b.blocked=a.id) or (b.blocker=a.id and b.blocked=me.id));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.display_name)),'[]') into blocks
    from private.community_blocks b join private.community_profiles a on a.id=b.blocked where b.blocker=me.id;
  return jsonb_build_object('posts',items,'profile',profile,'blocks',blocks,
    'me',case when me.id is null then null else jsonb_build_object('id',me.id,'name',me.display_name,'bio',me.bio,'suspended',me.suspended) end);
end; $$;

create function public.community_action(action text, payload jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare me private.community_profiles; target uuid; parent uuid; item private.community_posts; answer uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to participate'; end if;
  -- Serialize each account's writes, including first-time opt-in and rate checks.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,715));
  select * into me from private.community_profiles where account_id=auth.uid();
  if me.suspended then raise exception 'Community participation is suspended'; end if;
  if action='profile' then
    if me.id is null and coalesce((payload->>'adult_confirmed')::boolean,false) is not true then
      raise exception 'Community participation is limited to adults 18 and older';
    end if;
    insert into private.community_profiles(account_id,display_name,bio,adult_confirmed_at)
      values(auth.uid(),trim(payload->>'name'),coalesce(payload->>'bio',''),now())
      on conflict(account_id) do update set display_name=excluded.display_name,bio=excluded.bio
      returning id into answer;
    return answer;
  end if;
  if me.id is null then raise exception 'Create an adult public profile first'; end if;
  target := nullif(payload->>'id','')::uuid;
  case action
  when 'post' then
    if (select count(*) from private.community_posts where author_id=me.id and created_at>now()-interval '1 hour')>=20 then
      raise exception 'Posting limit reached. Try again in an hour.'; end if;
    parent := nullif(payload->>'parent_id','')::uuid;
    if parent is not null then
      select * into item from private.community_posts where id=parent;
      if not private.community_visible(parent,me.id) or item.parent_id is not null then raise exception 'Conversation unavailable'; end if;
    end if;
    insert into private.community_posts(author_id,parent_id,body) values(me.id,parent,trim(payload->>'body')) returning id into answer;
  when 'remove' then
    update private.community_posts set removed_at=now() where id=target and author_id=me.id and removed_at is null returning id into answer;
    if answer is null then raise exception 'Post unavailable'; end if;
  when 'like' then
    if not private.community_visible(target,me.id) then raise exception 'Post unavailable'; end if;
    if coalesce((payload->>'liked')::boolean,false) then
      insert into private.community_likes values(target,me.id) on conflict do nothing;
    else delete from private.community_likes where post_id=target and profile_id=me.id; end if;
  when 'block' then
    if target=me.id or not exists(select 1 from private.community_profiles where id=target) then raise exception 'Profile unavailable'; end if;
    if coalesce((payload->>'blocked')::boolean,false) then
      insert into private.community_blocks values(me.id,target) on conflict do nothing;
    else delete from private.community_blocks where blocker=me.id and blocked=target; end if;
  when 'report' then
    if not private.community_visible(target,me.id) then raise exception 'Post unavailable'; end if;
    if (select count(*) from private.community_reports where reporter=me.id and created_at>now()-interval '1 day')>=20 then raise exception 'Report limit reached. Try again tomorrow.'; end if;
    insert into private.community_reports(reporter,post_id,reason) values(me.id,target,payload->>'reason') on conflict(reporter,post_id) do nothing;
  else raise exception 'Unknown community action';
  end case;
  return answer;
end; $$;
revoke all on function public.community_read(jsonb),public.community_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.community_read(jsonb) to anon,authenticated;
grant execute on function public.community_action(text,jsonb) to authenticated;
commit;
