-- Additions are immediate; member changes to existing people require owner review.
begin;
alter table public.people
  add column branch text not null default '' check(char_length(branch)<=100),
  add column life_status text not null default 'unknown' check(life_status in ('unknown','living','deceased')),
  add column birth_date date,
  add column death_date date,
  add column source_note text not null default '' check(char_length(source_note)<=1000),
  add column added_by uuid references auth.users on delete set null,
  add column added_at timestamptz not null default now(),
  add constraint person_death_status check(death_date is null or life_status='deceased'),
  add constraint person_date_order check(birth_date is null or death_date is null or birth_date<=death_date);
create table public.tree_contributions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  person_id uuid not null references public.people on delete cascade,
  submitted_by uuid references auth.users on delete set null,
  base_version integer not null,
  before_record jsonb not null,
  proposed_record jsonb not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '' check(char_length(review_note)<=500)
);
create index tree_contributions_family on public.tree_contributions(family_id,submitted_at desc);
create unique index tree_one_pending on public.tree_contributions(person_id,submitted_by) where status='pending';
alter table public.tree_contributions enable row level security;
revoke all on public.tree_contributions from public,anon,authenticated;
grant select on public.tree_contributions to authenticated;
create policy tree_contributions_read on public.tree_contributions for select to authenticated
  using(private.is_member(family_id) and (submitted_by=auth.uid() or private.is_owner(family_id)));

-- Normalize only editable fields, ignoring forged family/owner/version metadata.
create function private.tree_record(fid uuid, target uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare parents uuid[]; born date; died date; state text; person_name text;
begin
  person_name:=trim(payload->>'name');
  state:=coalesce(payload->>'life_status','unknown');
  born:=nullif(payload->>'birth_date','')::date;
  died:=nullif(payload->>'death_date','')::date;
  if person_name is null or char_length(person_name) not between 1 and 100 then raise exception 'Enter a name of 1–100 characters'; end if;
  if char_length(coalesce(payload->>'story',''))>2000 or char_length(coalesce(payload->>'branch',''))>100 or char_length(coalesce(payload->>'source_note',''))>1000 then raise exception 'A tree field is too long'; end if;
  if state not in ('unknown','living','deceased') then raise exception 'Choose a valid life status'; end if;
  if died is not null and state<>'deceased' then raise exception 'A death date requires deceased status'; end if;
  if born>current_date or died>current_date or born>died then raise exception 'Check the birth and death dates'; end if;
  select coalesce(array_agg(value::uuid),'{}') into parents from jsonb_array_elements_text(coalesce(payload->'parents','[]'));
  if cardinality(parents)>8 or cardinality(parents)<>(select count(distinct x) from unnest(parents) x) then raise exception 'Invalid or duplicate parents'; end if;
  if exists(select 1 from unnest(parents) x where x is null or x=target or not exists(select 1 from public.people where id=x and family_id=fid)) then raise exception 'Parent must be another person in this family'; end if;
  if exists(with recursive ancestors(id) as (select unnest(parents) union select unnest(p.parents) from public.people p join ancestors a on p.id=a.id where p.family_id=fid) select 1 from ancestors where id=target) then raise exception 'This relationship would create an ancestry loop'; end if;
  return jsonb_build_object('name',person_name,'story',coalesce(payload->>'story',''),'parents',to_jsonb(parents),
    'branch',trim(coalesce(payload->>'branch','')),'life_status',state,'birth_date',born,'death_date',died,'source_note',coalesce(payload->>'source_note',''));
end; $$;

create function private.apply_tree_record(fid uuid, target uuid, record jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare old public.people; parent_ids uuid[];
begin
  select * into old from public.people where id=target and family_id=fid;
  select coalesce(array_agg(value::uuid),'{}') into parent_ids from jsonb_array_elements_text(record->'parents');
  if old.id is not null then
    insert into private.person_history(family_id,person_id,prior_record,edited_by) values(fid,target,to_jsonb(old),auth.uid());
    update public.people set name=record->>'name',story=record->>'story',parents=parent_ids,
      branch=record->>'branch',life_status=record->>'life_status',birth_date=(record->>'birth_date')::date,
      death_date=(record->>'death_date')::date,source_note=record->>'source_note',version=version+1
      where id=target and family_id=fid;
  else
    insert into public.people(id,family_id,name,story,parents,branch,life_status,birth_date,death_date,source_note,added_by)
      values(target,fid,record->>'name',record->>'story',parent_ids,record->>'branch',record->>'life_status',
        (record->>'birth_date')::date,(record->>'death_date')::date,record->>'source_note',auth.uid());
  end if;
end; $$;

create function public.tree_action(fid uuid, action text, payload jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; item public.people; proposed jsonb; contribution public.tree_contributions; answer uuid;
begin
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  perform 1 from public.families where id=fid for update;
  -- Membership may have changed while waiting for the family lock.
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  if action='save' then
    target:=nullif(payload->>'id','')::uuid;
    if target is not null then
      select * into item from public.people where id=target and family_id=fid;
      if item.id is null then raise exception 'Person unavailable'; end if;
      if item.version<>coalesce((payload->>'version')::integer,0) then raise exception 'This person changed. Refresh and reopen the record before editing.'; end if;
    else target:=gen_random_uuid(); end if;
    -- Older clients omit the new fields. Preserve those fields during their edits.
    proposed:=private.tree_record(fid,target,(case when item.id is null then '{}'::jsonb else to_jsonb(item) end)||payload);
    if item.id is null or private.is_owner(fid) then
      perform private.apply_tree_record(fid,target,proposed);
      return target;
    end if;
    if exists(select 1 from public.tree_contributions where person_id=target and submitted_by=auth.uid() and status='pending') then raise exception 'You already have a pending edit for this relative. Withdraw it before submitting another.'; end if;
    if (select count(*) from public.tree_contributions where family_id=fid and submitted_by=auth.uid() and status='pending')>=20 then raise exception 'You have 20 pending edits. Wait for review or withdraw one.'; end if;
    insert into public.tree_contributions(family_id,person_id,submitted_by,base_version,before_record,proposed_record)
      values(fid,target,auth.uid(),item.version,to_jsonb(item),proposed) returning id into answer;
    return answer;
  elsif action in ('approve','reject','withdraw') then
    select * into contribution from public.tree_contributions where id=(payload->>'id')::uuid and family_id=fid for update;
    if contribution.id is null then raise exception 'Contribution unavailable'; end if;
    if contribution.status<>'pending' then raise exception 'This contribution has already been reviewed or withdrawn'; end if;
    if action='withdraw' then
      if contribution.submitted_by is distinct from auth.uid() then raise exception 'Only the contributor can withdraw this edit'; end if;
    elsif not private.is_owner(fid) then raise exception 'Only a family owner can review edits'; end if;
    if action='approve' then
      if not exists(select 1 from public.memberships where family_id=fid and user_id=contribution.submitted_by) then raise exception 'The contributor is no longer a family member. Reject this edit.'; end if;
      select * into item from public.people where id=contribution.person_id and family_id=fid;
      if item.id is null or item.version<>contribution.base_version then raise exception 'This record changed after the edit was submitted. Reject it and request a fresh edit.'; end if;
      -- Recheck current family links and cycles, not just the submitted snapshot.
      proposed:=private.tree_record(fid,item.id,contribution.proposed_record);
      perform private.apply_tree_record(fid,item.id,proposed);
    end if;
    update public.tree_contributions set status=case action when 'approve' then 'approved' when 'reject' then 'rejected' else 'withdrawn' end,
      reviewed_by=auth.uid(),reviewed_at=now(),review_note=coalesce(payload->>'note','') where id=contribution.id;
    return contribution.id;
  else raise exception 'Unknown tree action'; end if;
end; $$;

-- Keep the public family API compatible, but prevent its old tree branch bypassing review.
alter function public.family_action(uuid,text,jsonb) set schema private;
alter function private.family_action(uuid,text,jsonb) rename to family_action_legacy;
revoke all on function private.family_action_legacy(uuid,text,jsonb) from public,anon,authenticated;
create function public.family_action(fid uuid, action text, payload jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if action='person' then return public.tree_action(fid,'save',payload); end if;
  return private.family_action_legacy(fid,action,payload);
end; $$;
revoke all on function private.tree_record(uuid,uuid,jsonb),private.apply_tree_record(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.tree_action(uuid,text,jsonb),public.family_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tree_action(uuid,text,jsonb),public.family_action(uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
