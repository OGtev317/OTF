-- Historical records. A memorial whose immediate family in the tree could no longer be alive
-- (all deceased, or born more than 110 years ago) is kept by its nearest descendants with
-- linked, living accounts, or by family owners when there are none. Every other memorial keeps
-- the immediate-family rule. Additive: replaces private.may_apply; adds three helpers.
begin;
-- Whether any of `ids` could still be alive: not recorded as deceased and not born more than
-- 110 years ago (an unknown birth date counts as possibly alive).
create function private.possibly_living(fid uuid, ids uuid[]) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.people where family_id=fid and id=any(ids) and life_status<>'deceased'
    and (birth_date is null or birth_date>current_date-interval '110 years'));
$$;

-- Accounts linked to the nearest living descendants of `d` (through any parent link);
-- `extra_child` is a person about to become d's child.
create function private.historical_keepers(fid uuid, d uuid, extra_child uuid default null) returns uuid[]
language sql stable security definer set search_path='' as $$
  with recursive down(id,depth) as (
    select p.id,1 from public.people p where p.family_id=fid and d=any(p.parents)
    union select extra_child,1 where extra_child is not null
    union select p.id,down.depth+1 from public.people p join down on down.id=any(p.parents) where p.family_id=fid and down.depth<30
  ), linked as (
    select m.user_id,min(down.depth) depth from down
      join public.memberships m on m.family_id=fid and m.person_id=down.id
      join public.people p on p.id=down.id and p.life_status<>'deceased'
    group by m.user_id
  )
  select coalesce(array_agg(user_id),'{}') from linked where depth=(select min(depth) from linked);
$$;

-- Whether the caller keeps memorial `d`, whose immediate relatives are `near`.
create function private.may_keep(fid uuid, d uuid, near uuid[], extra_child uuid default null) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.my_person(fid); keepers uuid[];
begin
  -- Immediate family: a living relative whose account is linked to their place in the tree.
  if me is not null and me=any(near) and not exists(select 1 from public.people where id=me and life_status='deceased') then return true; end if;
  -- Otherwise only a historical record can be kept, by its nearest linked descendants or owners.
  if private.possibly_living(fid,near) then return false; end if;
  keepers:=private.historical_keepers(fid,d,extra_child);
  if cardinality(keepers)>0 then return (select auth.uid())=any(keepers); end if;
  return private.is_owner(fid);
end; $$;

create or replace function private.may_apply(fid uuid, target uuid, old public.people, record jsonb, extra_child uuid default null, consent uuid default null) returns boolean
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
  foreach t in array touched loop
    if t=target and old.id is null then
      -- A new memorial record: judge by the relationships it is being created with.
      if not private.may_keep(fid,t,private.relatives(fid,t,new_parents,new_partners,extra_child),extra_child) then return false; end if;
    else
      select * into d from public.people where id=t and family_id=fid;
      if not private.may_keep(fid,d.id,private.relatives(fid,d.id,d.parents,d.partners),null) then return false; end if;
    end if;
  end loop;
  if old.id is not null then
    select user_id into claimant from public.memberships where family_id=fid and person_id=old.id;
    if claimant is not null and claimant<>(select auth.uid()) and claimant is distinct from consent then return false; end if;
    if claimant is not null and cardinality(touched)=0 then return true; end if;
  end if;
  return cardinality(touched)>0 or old.id is null or private.is_owner(fid);
end; $$;

revoke all on function private.possibly_living(uuid,uuid[]),private.historical_keepers(uuid,uuid,uuid),private.may_keep(uuid,uuid,uuid[],uuid) from public,anon,authenticated;
revoke all on function private.may_apply(uuid,uuid,public.people,jsonb,uuid,uuid) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
