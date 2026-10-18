-- Kinship: typed parent links and partners, accounts linked to tree people ("This is me"),
-- memorial records kept by immediate family, life profiles, and invitations bound to one
-- email address and one place in the tree. Additive; earlier migrations are not changed.
begin;
alter table public.people
  add column parent_kinds jsonb not null default '{}' check(jsonb_typeof(parent_kinds)='object'),
  add column partners uuid[] not null default '{}';
alter table public.memberships
  add column person_id uuid references public.people on delete set null,
  add column claim_person_id uuid references public.people on delete set null;
create unique index memberships_one_person on public.memberships(family_id,person_id) where person_id is not null;
-- A proposal can now also be a new relative waiting for an immediate relative's approval.
alter table public.tree_contributions alter column person_id drop not null;

create table public.life_profiles (
  family_id uuid not null,
  user_id uuid not null,
  about text not null default '' check(char_length(about)<=1000),
  work text not null default '' check(char_length(work)<=300),
  share text not null default '' check(char_length(share)<=1000),
  updated_at timestamptz not null default now(),
  primary key(family_id,user_id),
  foreign key(family_id,user_id) references public.memberships(family_id,user_id) on delete cascade
);
alter table public.life_profiles enable row level security;
revoke all on public.life_profiles from public,anon,authenticated;
grant select on public.life_profiles to authenticated;
create policy life_profile_read on public.life_profiles for select to authenticated using(private.is_member(family_id));

alter table private.invitations
  add column invited_by uuid references auth.users on delete set null,
  add column email text check(email is null or (char_length(email) between 3 and 254 and email=lower(email))),
  add column person_id uuid references public.people on delete set null;

-- The caller's own person in this family's tree, if their account is linked.
create function private.my_person(fid uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select person_id from public.memberships where family_id=fid and user_id=(select auth.uid());
$$;

-- Immediate relatives of `who`: parents, children, partners (recorded on either side) and
-- anyone sharing a parent. `who_parents`/`who_partners` let a proposed record be checked
-- before it is saved; `extra_child` is a person about to become `who`'s child.
create function private.relatives(fid uuid, who uuid, who_parents uuid[], who_partners uuid[], extra_child uuid default null) returns uuid[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(distinct x),'{}') from (
    select unnest(who_parents) x
    union select unnest(who_partners)
    union select extra_child
    union select id from public.people
      where family_id=fid and (who=any(parents) or who=any(partners) or parents && who_parents)
  ) r where x is not null and x<>who;
$$;

-- Whether the caller may apply `record` to `target` directly (`old` is null for a new person).
--  * A memorial (deceased) record, or a new link to one, needs a living immediate relative of
--    that person: a parent, child, brother or sister, or partner whose account is linked to
--    their place in the tree. Being a family owner does not count.
--  * A record linked to someone's account changes only with that person's agreement: they
--    make the change, or they proposed it (`consent`) and the other rules are met.
--  * Otherwise anyone may add a new person, and owners may change existing records.
create function private.may_apply(fid uuid, target uuid, old public.people, record jsonb, extra_child uuid default null, consent uuid default null) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare me uuid := private.my_person(fid); new_parents uuid[]; new_partners uuid[]; touched uuid[]; t uuid; d public.people; claimant uuid;
begin
  select coalesce(array_agg(value::uuid),'{}') into new_parents from jsonb_array_elements_text(coalesce(record->'parents','[]'));
  select coalesce(array_agg(value::uuid),'{}') into new_partners from jsonb_array_elements_text(coalesce(record->'partners','[]'));
  touched:=array(
    select target where record->>'life_status'='deceased' or old.life_status='deceased'
    union
    select p.id from public.people p where p.family_id=fid and p.life_status='deceased' and p.id<>target and (
      (p.id=any(new_parents) and not p.id=any(coalesce(old.parents,'{}')))
      or (p.id=any(new_partners) and not p.id=any(coalesce(old.partners,'{}')))
      or (p.parents && new_parents and not p.parents && coalesce(old.parents,'{}'))));
  if cardinality(touched)>0 then
    if me is null or exists(select 1 from public.people where id=me and life_status='deceased') then return false; end if;
    foreach t in array touched loop
      if t=target and old.id is null then
        -- A new memorial record: judge by the relationships it is being created with.
        if not me=any(private.relatives(fid,t,new_parents,new_partners,extra_child)) then return false; end if;
      else
        select * into d from public.people where id=t and family_id=fid;
        if not me=any(private.relatives(fid,d.id,d.parents,d.partners)) then return false; end if;
      end if;
    end loop;
  end if;
  if old.id is not null then
    select user_id into claimant from public.memberships where family_id=fid and person_id=old.id;
    if claimant is not null and claimant<>(select auth.uid()) and claimant is distinct from consent then return false; end if;
    if claimant is not null and cardinality(touched)=0 then return true; end if;
  end if;
  return cardinality(touched)>0 or old.id is null or private.is_owner(fid);
end; $$;

-- Normalize only editable fields, ignoring forged family/owner/version metadata.
create or replace function private.tree_record(fid uuid, target uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare parents uuid[]; partners uuid[]; kinds jsonb:='{}'; kind record; born date; died date; state text; person_name text;
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
  if state='deceased' and trim(coalesce(payload->>'source_note',''))='' then raise exception 'Add a source for this memorial record: who or what the details come from.'; end if;
  select coalesce(array_agg(value::uuid),'{}') into parents from jsonb_array_elements_text(coalesce(payload->'parents','[]'));
  select coalesce(array_agg(value::uuid),'{}') into partners from jsonb_array_elements_text(coalesce(payload->'partners','[]'));
  if cardinality(parents)>8 or cardinality(parents)<>(select count(distinct x) from unnest(parents) x) then raise exception 'Invalid or duplicate parents'; end if;
  if exists(select 1 from unnest(parents) x where x is null or x=target or not exists(select 1 from public.people where id=x and family_id=fid)) then raise exception 'Parent must be another person in this family'; end if;
  if cardinality(partners)>4 or cardinality(partners)<>(select count(distinct x) from unnest(partners) x) then raise exception 'Invalid or duplicate partners'; end if;
  if exists(select 1 from unnest(partners) x where x is null or x=target or x=any(parents) or not exists(select 1 from public.people where id=x and family_id=fid)) then raise exception 'A partner must be another person in this family, not also their parent'; end if;
  if exists(with recursive ancestors(id) as (select unnest(parents) union select unnest(p.parents) from public.people p join ancestors a on p.id=a.id where p.family_id=fid) select 1 from ancestors where id=target) then raise exception 'This relationship would create an ancestry loop'; end if;
  if jsonb_typeof(coalesce(payload->'parent_kinds','{}'))<>'object' then raise exception 'Invalid parent relationship'; end if;
  for kind in select key,value from jsonb_each_text(coalesce(payload->'parent_kinds','{}')) loop
    if kind.value not in ('biological','adoptive','step','guardian','unspecified') then raise exception 'Choose a valid parent relationship'; end if;
    -- Links to removed parents are dropped; unspecified is the default and is not stored.
    if kind.key::uuid=any(parents) and kind.value<>'unspecified' then kinds:=kinds||jsonb_build_object(kind.key,kind.value); end if;
  end loop;
  return jsonb_build_object('name',person_name,'story',coalesce(payload->>'story',''),'parents',to_jsonb(parents),'parent_kinds',kinds,'partners',to_jsonb(partners),
    'branch',trim(coalesce(payload->>'branch','')),'life_status',state,'birth_date',born,'death_date',died,'source_note',coalesce(payload->>'source_note',''));
end; $$;

create function private.apply_person(fid uuid, target uuid, record jsonb, author uuid) returns void
language plpgsql security definer set search_path='' as $$
declare old public.people; parent_ids uuid[]; partner_ids uuid[];
begin
  select * into old from public.people where id=target and family_id=fid;
  select coalesce(array_agg(value::uuid),'{}') into parent_ids from jsonb_array_elements_text(record->'parents');
  select coalesce(array_agg(value::uuid),'{}') into partner_ids from jsonb_array_elements_text(record->'partners');
  if old.id is not null then
    insert into private.person_history(family_id,person_id,prior_record,edited_by) values(fid,target,to_jsonb(old),auth.uid());
    update public.people set name=record->>'name',story=record->>'story',parents=parent_ids,parent_kinds=record->'parent_kinds',partners=partner_ids,
      branch=record->>'branch',life_status=record->>'life_status',birth_date=(record->>'birth_date')::date,
      death_date=(record->>'death_date')::date,source_note=record->>'source_note',version=version+1
      where id=target and family_id=fid;
  else
    insert into public.people(id,family_id,name,story,parents,parent_kinds,partners,branch,life_status,birth_date,death_date,source_note,added_by)
      values(target,fid,record->>'name',record->>'story',parent_ids,record->'parent_kinds',partner_ids,record->>'branch',record->>'life_status',
        (record->>'birth_date')::date,(record->>'death_date')::date,record->>'source_note',author);
  end if;
end; $$;

-- "They are my parent": add a newly created person to the caller's own record.
create function private.add_parent(fid uuid, child uuid, parent uuid) returns void
language plpgsql security definer set search_path='' as $$
declare old public.people;
begin
  select * into old from public.people where id=child and family_id=fid for update;
  if old.id is null then raise exception 'Your place in the tree is unavailable'; end if;
  if cardinality(old.parents)>=8 then raise exception 'Invalid or duplicate parents'; end if;
  insert into private.person_history(family_id,person_id,prior_record,edited_by) values(fid,child,to_jsonb(old),auth.uid());
  update public.people set parents=parents||parent,version=version+1 where id=child;
end; $$;

create or replace function public.tree_action(fid uuid, action text, payload jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; item public.people; proposed jsonb; contribution public.tree_contributions; answer uuid; me uuid; extra uuid; who uuid;
begin
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  perform 1 from public.families where id=fid for update;
  -- Membership may have changed while waiting for the family lock.
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  me:=private.my_person(fid);
  if action='save' then
    target:=nullif(payload->>'id','')::uuid;
    if target is not null then
      select * into item from public.people where id=target and family_id=fid;
      if item.id is null then raise exception 'Person unavailable'; end if;
      if item.version<>coalesce((payload->>'version')::integer,0) then raise exception 'This person changed. Refresh and reopen the record before editing.'; end if;
    else target:=gen_random_uuid(); end if;
    -- Older clients omit newer fields. Preserve those fields during their edits.
    proposed:=private.tree_record(fid,target,(case when item.id is null then '{}'::jsonb else to_jsonb(item) end)||payload);
    if coalesce((payload->>'my_parent')::boolean,false) then
      if item.id is not null then raise exception 'To add an existing relative as your parent, edit your own record'; end if;
      if me is null then raise exception 'Link your account to your place in the tree first'; end if;
      if exists(with recursive ancestors(id) as (select (value)::uuid from jsonb_array_elements_text(proposed->'parents') union select unnest(p.parents) from public.people p join ancestors a on p.id=a.id where p.family_id=fid) select 1 from ancestors where id=me) then raise exception 'This relationship would create an ancestry loop'; end if;
      extra:=me;
    end if;
    if proposed->>'life_status'='deceased' and exists(select 1 from public.memberships where family_id=fid and person_id=target) then
      raise exception 'This person’s account is linked to the tree. The link must be removed before they can be recorded as deceased.';
    end if;
    if private.may_apply(fid,target,item,proposed,extra) then
      perform private.apply_person(fid,target,proposed,auth.uid());
      if extra is not null then perform private.add_parent(fid,extra,target); end if;
      return target;
    end if;
    if item.id is not null and exists(select 1 from public.tree_contributions where person_id=target and submitted_by=auth.uid() and status='pending') then raise exception 'You already have a pending edit for this relative. Withdraw it before submitting another.'; end if;
    if (select count(*) from public.tree_contributions where family_id=fid and submitted_by=auth.uid() and status='pending')>=20 then raise exception 'You have 20 pending edits. Wait for review or withdraw one.'; end if;
    insert into public.tree_contributions(family_id,person_id,submitted_by,base_version,before_record,proposed_record)
      values(fid,item.id,auth.uid(),coalesce(item.version,0),coalesce(to_jsonb(item),'{}'),
        proposed||jsonb_build_object('id',target)||case when extra is null then '{}'::jsonb else jsonb_build_object('child_of_submitter',extra) end)
      returning id into answer;
    return answer;
  elsif action in ('approve','reject','withdraw') then
    select * into contribution from public.tree_contributions where id=(payload->>'id')::uuid and family_id=fid for update;
    if contribution.id is null then raise exception 'Contribution unavailable'; end if;
    if contribution.status<>'pending' then raise exception 'This contribution has already been reviewed or withdrawn'; end if;
    if action='withdraw' then
      if contribution.submitted_by is distinct from auth.uid() then raise exception 'Only the contributor can withdraw this edit'; end if;
    else
      if contribution.person_id is not null then
        select * into item from public.people where id=contribution.person_id and family_id=fid;
        target:=contribution.person_id;
      else
        target:=(contribution.proposed_record->>'id')::uuid;
        -- Link the new person to the contributor only if their account is still linked to the same place.
        select person_id into extra from public.memberships where family_id=fid and user_id=contribution.submitted_by
          and person_id=(contribution.proposed_record->>'child_of_submitter')::uuid;
      end if;
      if action='approve' then
        if contribution.submitted_by=auth.uid() then raise exception 'Someone else needs to approve your edit'; end if;
        if not exists(select 1 from public.memberships where family_id=fid and user_id=contribution.submitted_by) then raise exception 'The contributor is no longer a family member. Reject this edit.'; end if;
        if contribution.person_id is not null and (item.id is null or item.version<>contribution.base_version) then raise exception 'This record changed after the edit was submitted. Reject it and request a fresh edit.'; end if;
        if contribution.person_id is null and exists(select 1 from public.people where id=target) then raise exception 'This relative was already added'; end if;
        -- Recheck current family links, cycles and who may approve, not just the submitted snapshot.
        proposed:=private.tree_record(fid,target,contribution.proposed_record);
        if not private.may_apply(fid,target,item,proposed,extra,contribution.submitted_by) then raise exception 'Only an immediate relative with a linked account, the person themselves, or a family owner for other records can approve this edit.'; end if;
        perform private.apply_person(fid,target,proposed,contribution.submitted_by);
        if extra is not null then perform private.add_parent(fid,extra,target); end if;
      elsif not private.is_owner(fid) and not private.may_apply(fid,target,item,contribution.proposed_record,extra,contribution.submitted_by) then
        raise exception 'Only a family owner or someone who could approve this edit can reject it';
      end if;
    end if;
    update public.tree_contributions set status=case action when 'approve' then 'approved' when 'reject' then 'rejected' else 'withdrawn' end,
      reviewed_by=auth.uid(),reviewed_at=now(),review_note=coalesce(payload->>'note','') where id=contribution.id;
    return contribution.id;
  elsif action='claim' then
    target:=(payload->>'person_id')::uuid;
    select * into item from public.people where id=target and family_id=fid;
    if item.id is null then raise exception 'Person unavailable'; end if;
    if item.life_status='deceased' then raise exception 'A memorial record cannot be linked to an account'; end if;
    if me is not null then raise exception 'Your account is already linked to someone in this tree. Remove that link first.'; end if;
    if exists(select 1 from public.memberships where family_id=fid and person_id=target) then raise exception 'Someone has already linked their account to this person'; end if;
    -- Owners link themselves; anyone else waits for an owner to confirm who they are.
    if private.is_owner(fid) then update public.memberships set person_id=target,claim_person_id=null where family_id=fid and user_id=auth.uid();
    else update public.memberships set claim_person_id=target where family_id=fid and user_id=auth.uid(); end if;
    return target;
  elsif action in ('approve_claim','reject_claim','unlink') then
    who:=coalesce(nullif(payload->>'user_id','')::uuid,auth.uid());
    if who<>auth.uid() and not private.is_owner(fid) then raise exception 'Only a family owner can change someone else’s link'; end if;
    if action='unlink' then
      update public.memberships set person_id=null,claim_person_id=null where family_id=fid and user_id=who;
      return null;
    end if;
    select claim_person_id into target from public.memberships where family_id=fid and user_id=who;
    if target is null then raise exception 'There is no pending link for this member'; end if;
    if action='reject_claim' then
      update public.memberships set claim_person_id=null where family_id=fid and user_id=who;
      return target;
    end if;
    if not private.is_owner(fid) then raise exception 'Only a family owner can confirm who someone is'; end if;
    if exists(select 1 from public.memberships where family_id=fid and person_id=target) then raise exception 'Someone has already linked their account to this person'; end if;
    if exists(select 1 from public.people where id=target and life_status='deceased') then raise exception 'A memorial record cannot be linked to an account'; end if;
    update public.memberships set person_id=target,claim_person_id=null where family_id=fid and user_id=who;
    return target;
  elsif action='profile' then
    if char_length(coalesce(payload->>'about',''))>1000 or char_length(coalesce(payload->>'work',''))>300 or char_length(coalesce(payload->>'share',''))>1000 then raise exception 'A profile field is too long'; end if;
    insert into public.life_profiles(family_id,user_id,about,work,share) values(fid,auth.uid(),coalesce(payload->>'about',''),coalesce(payload->>'work',''),coalesce(payload->>'share',''))
      on conflict(family_id,user_id) do update set about=excluded.about,work=excluded.work,share=excluded.share,updated_at=now();
    return null;
  else raise exception 'Unknown tree action'; end if;
end; $$;

-- Proposals are visible to their contributor, family owners, and whoever could approve them.
create function private.contribution_visible(fid uuid, target uuid, submitter uuid, reviewer uuid, state text, proposed jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare old public.people; extra uuid;
begin
  if not private.is_member(fid) then return false; end if;
  if submitter=auth.uid() or reviewer=auth.uid() or private.is_owner(fid) then return true; end if;
  if state<>'pending' then return false; end if;
  select * into old from public.people where id=target and family_id=fid;
  if target is null then
    select person_id into extra from public.memberships where family_id=fid and user_id=submitter and person_id=(proposed->>'child_of_submitter')::uuid;
  end if;
  return private.may_apply(fid,coalesce(target,(proposed->>'id')::uuid),old,proposed,extra,submitter);
exception when others then return false;
end; $$;
drop policy tree_contributions_read on public.tree_contributions;
create policy tree_contributions_read on public.tree_contributions for select to authenticated
  using(private.contribution_visible(family_id,person_id,submitted_by,reviewed_by,status,proposed_record));

-- Invitations name one email address and, usually, the person they are in the tree.
drop function public.create_invitation(uuid);
create function public.create_invitation(fid uuid, invite_email text default null, invite_person uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare code text; who text:=lower(trim(invite_email)); target public.people;
begin
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  perform 1 from public.families where id=fid for update;
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  if who is null or char_length(who)>254 or who !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter the email address of the relative you are inviting'; end if;
  if invite_person is not null then
    select * into target from public.people where id=invite_person and family_id=fid;
    if target.id is null then raise exception 'Person unavailable'; end if;
    if target.life_status='deceased' then raise exception 'A memorial record cannot be linked to an account'; end if;
    if exists(select 1 from public.memberships where family_id=fid and person_id=invite_person) then raise exception 'Someone has already linked their account to this person'; end if;
  elsif not private.is_owner(fid) then raise exception 'Choose who they are in the family tree. If they are not there yet, add them as a relative first.'; end if;
  if exists(select 1 from private.invitations where family_id=fid and email=who and used_at is null and revoked_at is null and expires_at>now()) then raise exception 'This email already has an open invitation. Revoke it to send a new one.'; end if;
  if (select count(*) from private.invitations where family_id=fid and used_at is null and revoked_at is null and expires_at>now())>=20 then raise exception 'Revoke an unused invitation first'; end if;
  if not private.is_owner(fid) and (select count(*) from private.invitations where family_id=fid and invited_by=auth.uid() and used_at is null and revoked_at is null and expires_at>now())>=5 then raise exception 'You have 5 open invitations. Revoke one or wait for it to be used.'; end if;
  code:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.invitations(family_id,token_hash,invited_by,email,person_id) values(fid,encode(sha256(convert_to(code,'UTF8')),'hex'),auth.uid(),who,invite_person);
  return code;
end; $$;

create or replace function public.accept_invitation(code text, member_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv private.invitations; fid uuid; mine text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select family_id into fid from private.invitations where token_hash=encode(sha256(convert_to(code,'UTF8')),'hex');
  perform 1 from public.families where id=fid for update;
  select * into inv from private.invitations where family_id=fid and token_hash=encode(sha256(convert_to(code,'UTF8')),'hex') for update;
  if inv.id is null or inv.used_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'Invitation is invalid or expired'; end if;
  select lower(email) into mine from auth.users where id=auth.uid() and email_confirmed_at is not null;
  -- Invitations made before this migration name no address and still work until they expire.
  if inv.email is not null and inv.email is distinct from mine then raise exception 'This invitation was sent to a different email address. Sign in with the address it was sent to, or ask for a new invitation.'; end if;
  if private.is_member(fid) then raise exception 'You already belong to this family'; end if;
  insert into public.memberships(family_id,user_id,display_name,role) values(fid,auth.uid(),trim(member_name),'member');
  update private.invitations set used_at=now() where id=inv.id;
  if inv.person_id is not null and exists(select 1 from public.people where id=inv.person_id and family_id=fid and life_status<>'deceased')
    and not exists(select 1 from public.memberships where family_id=fid and person_id=inv.person_id) then
    update public.memberships set person_id=inv.person_id where family_id=fid and user_id=auth.uid();
  end if;
  return fid;
end; $$;

drop function public.list_invitations(uuid);
create function public.list_invitations(fid uuid) returns table(id uuid, expires_at timestamptz, used_at timestamptz, revoked_at timestamptz, email text, person_id uuid, invited_by uuid)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  -- Owners see every invitation; members see the ones they sent.
  return query select i.id,i.expires_at,i.used_at,i.revoked_at,i.email,i.person_id,i.invited_by from private.invitations i
    where i.family_id=fid and (private.is_owner(fid) or i.invited_by=auth.uid()) order by i.expires_at desc limit 100;
end; $$;

create or replace function public.family_action(fid uuid, action text, payload jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare answer uuid;
begin
  if action='person' then return public.tree_action(fid,'save',payload); end if;
  if action='revoke_invitation' then
    if not private.is_member(fid) then raise exception 'Family access denied'; end if;
    update private.invitations set revoked_at=now() where family_id=fid and id=(payload->>'id')::uuid and used_at is null and revoked_at is null
      and (private.is_owner(fid) or invited_by=auth.uid());
    if not found then raise exception 'Only the family owner or the person who sent it can revoke this invitation'; end if;
    return null;
  end if;
  answer:=private.family_action_legacy(fid,action,payload);
  -- A removed member's open invitations stop working too.
  if action='remove_member' then
    update private.invitations set revoked_at=now() where family_id=fid and invited_by=(payload->>'user_id')::uuid and used_at is null and revoked_at is null
      and not exists(select 1 from public.memberships where family_id=fid and user_id=(payload->>'user_id')::uuid);
  end if;
  return answer;
end; $$;

revoke all on function private.my_person(uuid),private.relatives(uuid,uuid,uuid[],uuid[],uuid),private.may_apply(uuid,uuid,public.people,jsonb,uuid,uuid),
  private.tree_record(uuid,uuid,jsonb),private.apply_person(uuid,uuid,jsonb,uuid),private.add_parent(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.contribution_visible(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function private.contribution_visible(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
revoke all on function public.tree_action(uuid,text,jsonb),public.family_action(uuid,text,jsonb),public.create_invitation(uuid,text,uuid),
  public.accept_invitation(text,text),public.list_invitations(uuid) from public,anon,authenticated;
grant execute on function public.tree_action(uuid,text,jsonb),public.family_action(uuid,text,jsonb),public.create_invitation(uuid,text,uuid),
  public.accept_invitation(text,text),public.list_invitations(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
