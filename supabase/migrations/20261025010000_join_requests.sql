-- Join links and requests to join. An owner shares one link per family; anyone signed in who
-- opens it sees only the family's name and may ask to join. Owners approve (linking the
-- newcomer to a person in the tree, adding them as someone new, or neither) or decline.
-- A link grants no access by itself, so its code is kept readable for owners to copy again.
-- Additive.
begin;
create table private.join_links (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  code text unique not null check(code ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table private.join_links enable row level security;
revoke all on private.join_links from public,anon,authenticated;

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  -- The family's name when they asked, so the person asking can see it before they are a member.
  family_name text not null default '',
  display_name text not null check(char_length(trim(display_name)) between 1 and 100),
  note text not null default '' check(char_length(note)<=500),
  birth_year integer check(birth_year between 1900 and 2100),
  status text not null default 'pending' check(status in ('pending','approved','declined','withdrawn')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  person_id uuid references public.people on delete set null
);
create unique index join_requests_one_pending on public.join_requests(family_id,user_id) where status='pending';
create index join_requests_family on public.join_requests(family_id,created_at desc);
alter table public.join_requests enable row level security;
revoke all on public.join_requests from public,anon,authenticated;
grant select on public.join_requests to authenticated;
-- The person asking sees their own requests; owners see their family's.
create policy join_requests_read on public.join_requests for select to authenticated
  using(user_id=(select auth.uid()) or private.is_owner(family_id));

-- The family's active link, if any.
create function private.active_link(code_in text) returns private.join_links
language sql stable security definer set search_path='' as $$
  select * from private.join_links where code=lower(trim(code_in)) and revoked_at is null and expires_at>now();
$$;

create function public.join_link(fid uuid) returns table(code text, created_at timestamptz, expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner(fid) then raise exception 'Only a family owner can see the join link'; end if;
  return query select l.code,l.created_at,l.expires_at from private.join_links l
    where l.family_id=fid and l.revoked_at is null and l.expires_at>now() order by l.created_at desc limit 1;
end; $$;

-- Creates a new link (turning off any earlier one) that expires after `days`.
create function public.create_join_link(fid uuid, days integer default 30) returns text
language plpgsql security definer set search_path='' as $$
declare code text;
begin
  if not private.is_owner(fid) then raise exception 'Only a family owner can create a join link'; end if;
  if days not between 1 and 365 then raise exception 'Choose between 1 and 365 days'; end if;
  perform 1 from public.families where id=fid for update;
  update private.join_links set revoked_at=now() where family_id=fid and revoked_at is null;
  code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.join_links(family_id,code,created_by,expires_at) values(fid,code,auth.uid(),now()+make_interval(days=>days));
  return code;
end; $$;

create function public.revoke_join_link(fid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner(fid) then raise exception 'Only a family owner can turn off the join link'; end if;
  update private.join_links set revoked_at=now() where family_id=fid and revoked_at is null;
end; $$;

-- What someone signed in learns from a link: the family's name and their own standing. Nothing else.
create function public.preview_join_link(code text) returns table(family_id uuid, family_name text, member boolean, pending boolean)
language plpgsql security definer set search_path='' as $$
declare link private.join_links;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  link:=private.active_link(code);
  if link.id is null then raise exception 'This join link has expired or been turned off. Ask the family for a new one.'; end if;
  return query select f.id,f.name,private.is_member(f.id),
    exists(select 1 from public.join_requests r where r.family_id=f.id and r.user_id=auth.uid() and r.status='pending')
    from public.families f where f.id=link.family_id;
end; $$;

create function public.request_to_join(code text, display_name text, note text default '', birth_year integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare link private.join_links; answer uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  link:=private.active_link(code);
  if link.id is null then raise exception 'This join link has expired or been turned off. Ask the family for a new one.'; end if;
  perform 1 from public.families where id=link.family_id for update;
  if private.is_member(link.family_id) then raise exception 'You already belong to this family'; end if;
  if exists(select 1 from public.join_requests where family_id=link.family_id and user_id=auth.uid() and status='pending') then raise exception 'You have already asked to join this family. An owner will review it.'; end if;
  if (select count(*) from public.join_requests where user_id=auth.uid() and status='pending')>=3 then raise exception 'You have 3 requests waiting. Withdraw one or wait for an answer.'; end if;
  if (select count(*) from public.join_requests where family_id=link.family_id and status='pending')>=20 then raise exception 'This family has many requests waiting. Please try again later.'; end if;
  if birth_year is not null and birth_year not between 1900 and extract(year from current_date)::integer then raise exception 'Check the birth year'; end if;
  insert into public.join_requests(family_id,user_id,family_name,display_name,note,birth_year)
    values(link.family_id,auth.uid(),(select name from public.families where id=link.family_id),trim(display_name),coalesce(trim(note),''),birth_year) returning id into answer;
  return answer;
end; $$;

create function public.withdraw_join_request(request uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.join_requests set status='withdrawn',decided_at=now() where id=request and user_id=auth.uid() and status='pending';
  if not found then raise exception 'Request unavailable'; end if;
end; $$;

-- An owner's decision. To approve, give the person in the tree they are (`person`), or
-- `add_person` to add them as a new living relative, or neither to let them join without a place yet.
create function public.decide_join_request(fid uuid, request uuid, decision text, person uuid default null, add_person boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.join_requests; target uuid:=person;
begin
  if not private.is_owner(fid) then raise exception 'Only a family owner can decide requests to join'; end if;
  perform 1 from public.families where id=fid for update;
  select * into r from public.join_requests where id=request and family_id=fid for update;
  if r.id is null then raise exception 'Request unavailable'; end if;
  if r.status<>'pending' then raise exception 'This request has already been answered or withdrawn'; end if;
  if decision='decline' then
    update public.join_requests set status='declined',decided_by=auth.uid(),decided_at=now() where id=r.id;
    return null;
  elsif decision<>'approve' then raise exception 'Choose approve or decline';
  end if;
  if private.is_member_user(fid,r.user_id) then raise exception 'They already belong to this family'; end if;
  if add_person and target is not null then raise exception 'Choose an existing person or a new one, not both'; end if;
  if add_person then
    target:=gen_random_uuid();
    perform private.apply_person(fid,target,private.tree_record(fid,target,jsonb_build_object('name',r.display_name,'life_status','living')),auth.uid());
  elsif target is not null then
    if not exists(select 1 from public.people where id=target and family_id=fid) then raise exception 'Person unavailable'; end if;
    if exists(select 1 from public.people where id=target and life_status='deceased') then raise exception 'A memorial record cannot be linked to an account'; end if;
    if exists(select 1 from public.memberships where family_id=fid and person_id=target) then raise exception 'Someone has already linked their account to this person'; end if;
  end if;
  insert into public.memberships(family_id,user_id,display_name,role,person_id) values(fid,r.user_id,r.display_name,'member',target);
  update public.join_requests set status='approved',decided_by=auth.uid(),decided_at=now(),person_id=target where id=r.id;
  return target;
end; $$;

create function private.is_member_user(fid uuid, who uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships where family_id=fid and user_id=who);
$$;

revoke all on function private.active_link(text),private.is_member_user(uuid,uuid) from public,anon,authenticated;
revoke all on function public.join_link(uuid),public.create_join_link(uuid,integer),public.revoke_join_link(uuid),public.preview_join_link(text),
  public.request_to_join(text,text,text,integer),public.withdraw_join_request(uuid),public.decide_join_request(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.join_link(uuid),public.create_join_link(uuid,integer),public.revoke_join_link(uuid),public.preview_join_link(text),
  public.request_to_join(text,text,text,integer),public.withdraw_join_request(uuid),public.decide_join_request(uuid,uuid,text,uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
