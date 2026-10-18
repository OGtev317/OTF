-- OTF: database authorization is mandatory; clients never receive a service key.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.memberships (
  family_id uuid not null references public.families on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  role text not null check (role in ('owner','member')),
  primary key (family_id,user_id)
);
create index memberships_user on public.memberships(user_id);
create table private.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  revoked_at timestamptz
);
create table public.posts (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families on delete cascade,
  author_id uuid not null references auth.users, body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(), unique(family_id,id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(), family_id uuid not null, post_id uuid not null,
  author_id uuid not null references auth.users, body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(), foreign key(family_id,post_id) references public.posts(family_id,id) on delete cascade
);
create table public.reactions (
  family_id uuid not null, post_id uuid not null, user_id uuid not null references auth.users,
  primary key(post_id,user_id), foreign key(family_id,post_id) references public.posts(family_id,id) on delete cascade
);
create table public.people (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  story text not null default '' check (char_length(story)<=2000),
  parents uuid[] not null default '{}', version integer not null default 1
);
create table private.person_history (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families on delete cascade,
  person_id uuid not null, prior_record jsonb not null, edited_by uuid not null, edited_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families on delete cascade,
  author_id uuid not null references auth.users, title text not null check (char_length(trim(title)) between 1 and 100),
  event_date date not null, detail text not null default '' check (char_length(detail)<=500)
);
create index posts_family on public.posts(family_id,created_at);
create index comments_family on public.comments(family_id,post_id);
create index reactions_family on public.reactions(family_id);
create index people_family on public.people(family_id);
create index events_family on public.events(family_id);

create function private.is_member(fid uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships where family_id=fid and user_id=(select auth.uid()));
$$;
create function private.is_owner(fid uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships where family_id=fid and user_id=(select auth.uid()) and role='owner');
$$;
revoke all on function private.is_member(uuid), private.is_owner(uuid) from public,anon;
grant execute on function private.is_member(uuid), private.is_owner(uuid) to authenticated;

alter table public.families enable row level security;
alter table public.memberships enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.people enable row level security;
alter table public.events enable row level security;
alter table private.invitations enable row level security;
alter table private.person_history enable row level security;
revoke all on public.families,public.memberships,public.posts,public.comments,public.reactions,public.people,public.events from anon,authenticated;
revoke all on private.invitations,private.person_history from public,anon,authenticated;
grant select on public.families,public.memberships,public.posts,public.comments,public.reactions,public.people,public.events to authenticated;
create policy family_read on public.families for select to authenticated using(private.is_member(id));
create policy membership_read on public.memberships for select to authenticated using(private.is_member(family_id));
create policy post_read on public.posts for select to authenticated using(private.is_member(family_id));
create policy comment_read on public.comments for select to authenticated using(private.is_member(family_id));
create policy reaction_read on public.reactions for select to authenticated using(private.is_member(family_id));
create policy people_read on public.people for select to authenticated using(private.is_member(family_id));
create policy event_read on public.events for select to authenticated using(private.is_member(family_id));

-- All mutations use explicit RPC authorization and a family lock. No blanket client write grants.
create function public.create_family(family_name text, member_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select count(*) from public.memberships where user_id=auth.uid() and role='owner') >= 5 then raise exception 'Family limit reached'; end if;
  insert into public.families(name) values(trim(family_name)) returning id into fid;
  insert into public.memberships values(fid,auth.uid(),trim(member_name),'owner');
  return fid;
end; $$;

create function public.create_invitation(fid uuid) returns text
language plpgsql security definer set search_path='' as $$
declare code text;
begin
  perform 1 from public.families where id=fid for update;
  if not private.is_owner(fid) then raise exception 'Only the family owner can invite'; end if;
  if (select count(*) from private.invitations where family_id=fid and used_at is null and revoked_at is null and expires_at>now()) >= 20 then raise exception 'Revoke an unused invitation first'; end if;
  code := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into private.invitations(family_id,token_hash) values(fid,encode(sha256(convert_to(code,'UTF8')),'hex'));
  return code;
end; $$;

create function public.accept_invitation(code text, member_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv private.invitations; fid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select family_id into fid from private.invitations where token_hash=encode(sha256(convert_to(code,'UTF8')),'hex');
  perform 1 from public.families where id=fid for update;
  select * into inv from private.invitations where family_id=fid and token_hash=encode(sha256(convert_to(code,'UTF8')),'hex') for update;
  if inv.id is null or inv.used_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'Invitation is invalid or expired'; end if;
  if private.is_member(fid) then raise exception 'You already belong to this family'; end if;
  insert into public.memberships values(fid,auth.uid(),trim(member_name),'member');
  update private.invitations set used_at=now() where id=inv.id;
  return fid;
end; $$;

create function public.list_invitations(fid uuid) returns table(id uuid, expires_at timestamptz, used_at timestamptz, revoked_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner(fid) then raise exception 'Only the family owner can view invitations'; end if;
  return query select i.id,i.expires_at,i.used_at,i.revoked_at from private.invitations i where i.family_id=fid order by i.expires_at desc limit 100;
end; $$;

create function public.family_action(fid uuid, action text, payload jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid; item public.people; parent_ids uuid[]; target uuid;
begin
  perform 1 from public.families where id=fid for update;
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  case action
  when 'post' then
    insert into public.posts(family_id,author_id,body) values(fid,auth.uid(),trim(payload->>'body')) returning id into result_id;
  when 'comment' then
    insert into public.comments(family_id,post_id,author_id,body) values(fid,(payload->>'post_id')::uuid,auth.uid(),trim(payload->>'body')) returning id into result_id;
  when 'react' then
    target := (payload->>'post_id')::uuid;
    if not exists(select 1 from public.posts where family_id=fid and id=target) then raise exception 'Post unavailable'; end if;
    if coalesce((payload->>'liked')::boolean,false) then
      insert into public.reactions values(fid,target,auth.uid()) on conflict do nothing;
    else delete from public.reactions where family_id=fid and post_id=target and user_id=auth.uid(); end if;
  when 'event' then
    insert into public.events(family_id,author_id,title,event_date,detail) values(fid,auth.uid(),trim(payload->>'title'),(payload->>'event_date')::date,coalesce(payload->>'detail','')) returning id into result_id;
  when 'person' then
    if not private.is_owner(fid) then raise exception 'Only the family owner can edit the tree during the pilot'; end if;
    target := coalesce((payload->>'id')::uuid,gen_random_uuid());
    select * into item from public.people where id=target;
    if item.id is not null and item.family_id<>fid then raise exception 'Person unavailable'; end if;
    if item.id is not null and item.version<>coalesce((payload->>'version')::integer,0) then raise exception 'This person changed. Refresh before editing.'; end if;
    select coalesce(array_agg(value::uuid),'{}') into parent_ids from jsonb_array_elements_text(coalesce(payload->'parents','[]'));
    if cardinality(parent_ids)>8 or cardinality(parent_ids)<>(select count(distinct x) from unnest(parent_ids) x) then raise exception 'Invalid or duplicate parents'; end if;
    if exists(select 1 from unnest(parent_ids) x where x is null or x=target or not exists(select 1 from public.people where id=x and family_id=fid)) then raise exception 'Parent must be another person in this family'; end if;
    if exists(with recursive ancestors(id) as (select unnest(parent_ids) union select unnest(p.parents) from public.people p join ancestors a on p.id=a.id where p.family_id=fid) select 1 from ancestors where id=target) then raise exception 'This relationship would create an ancestry loop'; end if;
    if item.id is not null then insert into private.person_history(family_id,person_id,prior_record,edited_by) values(fid,target,to_jsonb(item),auth.uid()); end if;
    insert into public.people(id,family_id,name,story,parents) values(target,fid,trim(payload->>'name'),coalesce(payload->>'story',''),parent_ids)
      on conflict(id) do update set name=excluded.name,story=excluded.story,parents=excluded.parents,version=public.people.version+1;
    result_id:=target;
  when 'remove_member' then
    if not private.is_owner(fid) then raise exception 'Only the family owner can remove members'; end if;
    delete from public.memberships where family_id=fid and user_id=(payload->>'user_id')::uuid and role<>'owner';
  when 'revoke_invitation' then
    if not private.is_owner(fid) then raise exception 'Only the family owner can revoke invitations'; end if;
    update private.invitations set revoked_at=now() where family_id=fid and id=(payload->>'id')::uuid;
  else raise exception 'Unknown action';
  end case;
  return result_id;
end; $$;

revoke all on function public.create_family(text,text),public.create_invitation(uuid),public.accept_invitation(text,text),public.list_invitations(uuid),public.family_action(uuid,text,jsonb) from public,anon;
grant execute on function public.create_family(text,text),public.create_invitation(uuid),public.accept_invitation(text,text),public.list_invitations(uuid),public.family_action(uuid,text,jsonb) to authenticated;
commit;
