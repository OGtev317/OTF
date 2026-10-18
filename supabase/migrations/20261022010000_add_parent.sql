-- Add a new person as the parent of anyone in the tree ("parent_of"), not only of the caller
-- ("my_parent"). The addition applies directly only when the caller may add the new person
-- and may change the child's record; otherwise it waits for someone who may do both.
-- Additive: replaces tree_action and contribution_visible, adds private.may_add.
begin;
create function private.may_add(fid uuid, target uuid, old public.people, record jsonb, child uuid, consent uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare kid public.people;
begin
  if not private.may_apply(fid,target,old,record,child,consent) then return false; end if;
  if child is null then return true; end if;
  select * into kid from public.people where id=child and family_id=fid;
  return kid.id is not null and private.may_apply(fid,child,kid,to_jsonb(kid)||jsonb_build_object('parents',to_jsonb(kid.parents||target)),null,consent);
end; $$;

create or replace function public.tree_action(fid uuid, action text, payload jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; item public.people; proposed jsonb; contribution public.tree_contributions; answer uuid; me uuid; extra uuid; who uuid; kid public.people;
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
    -- A new person can be added as the parent of someone already in the tree: "my_parent"
    -- for the caller's own place, or "parent_of" for anyone. Both records must be allowed.
    if coalesce((payload->>'my_parent')::boolean,false) then
      if me is null then raise exception 'Link your account to your place in the tree first'; end if;
      extra:=me;
    elsif nullif(payload->>'parent_of','') is not null then
      extra:=(payload->>'parent_of')::uuid;
    end if;
    if extra is not null then
      if item.id is not null then raise exception 'A new parent is added as a new person. To link someone already in the tree as a parent, edit the child’s record.'; end if;
      select * into kid from public.people where id=extra and family_id=fid;
      if kid.id is null then raise exception 'Person unavailable'; end if;
      if cardinality(kid.parents)>=8 then raise exception 'Invalid or duplicate parents'; end if;
      if extra=any(array(select (value)::uuid from jsonb_array_elements_text(proposed->'partners')))
        or exists(with recursive ancestors(id) as (select (value)::uuid from jsonb_array_elements_text(proposed->'parents') union select unnest(p.parents) from public.people p join ancestors a on p.id=a.id where p.family_id=fid) select 1 from ancestors where id=extra)
        then raise exception 'This relationship would create an ancestry loop'; end if;
    end if;
    if proposed->>'life_status'='deceased' and exists(select 1 from public.memberships where family_id=fid and person_id=target) then
      raise exception 'This person’s account is linked to the tree. The link must be removed before they can be recorded as deceased.';
    end if;
    if private.may_add(fid,target,item,proposed,extra,null) then
      perform private.apply_person(fid,target,proposed,auth.uid());
      if extra is not null then perform private.add_parent(fid,extra,target); end if;
      return target;
    end if;
    if item.id is not null and exists(select 1 from public.tree_contributions where person_id=target and submitted_by=auth.uid() and status='pending') then raise exception 'You already have a pending edit for this relative. Withdraw it before submitting another.'; end if;
    if (select count(*) from public.tree_contributions where family_id=fid and submitted_by=auth.uid() and status='pending')>=20 then raise exception 'You have 20 pending edits. Wait for review or withdraw one.'; end if;
    insert into public.tree_contributions(family_id,person_id,submitted_by,base_version,before_record,proposed_record)
      values(fid,item.id,auth.uid(),coalesce(item.version,0),coalesce(to_jsonb(item),'{}'),
        proposed||jsonb_build_object('id',target)||case when extra is null then '{}'::jsonb else jsonb_build_object('child_of',extra) end)
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
        -- A proposed parent is linked to the child named in the proposal, if they are still in the tree.
        extra:=coalesce(contribution.proposed_record->>'child_of',contribution.proposed_record->>'child_of_submitter')::uuid;
        if extra is not null and not exists(select 1 from public.people where id=extra and family_id=fid) then extra:=null; end if;
      end if;
      if action='approve' then
        if contribution.submitted_by=auth.uid() then raise exception 'Someone else needs to approve your edit'; end if;
        if not exists(select 1 from public.memberships where family_id=fid and user_id=contribution.submitted_by) then raise exception 'The contributor is no longer a family member. Reject this edit.'; end if;
        if contribution.person_id is not null and (item.id is null or item.version<>contribution.base_version) then raise exception 'This record changed after the edit was submitted. Reject it and request a fresh edit.'; end if;
        if contribution.person_id is null and exists(select 1 from public.people where id=target) then raise exception 'This relative was already added'; end if;
        if extra is null and coalesce(contribution.proposed_record->>'child_of',contribution.proposed_record->>'child_of_submitter') is not null then raise exception 'The person this parent was proposed for is no longer in the tree. Decline this proposal.'; end if;
        -- Recheck current family links, cycles and who may approve, not just the submitted snapshot.
        proposed:=private.tree_record(fid,target,contribution.proposed_record);
        if not private.may_add(fid,target,item,proposed,extra,contribution.submitted_by) then raise exception 'Only an immediate relative with a linked account, the person themselves, or a family owner for other records can approve this edit.'; end if;
        perform private.apply_person(fid,target,proposed,contribution.submitted_by);
        if extra is not null then perform private.add_parent(fid,extra,target); end if;
      elsif not private.is_owner(fid) and not private.may_add(fid,target,item,contribution.proposed_record,extra,contribution.submitted_by) then
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

create or replace function private.contribution_visible(fid uuid, target uuid, submitter uuid, reviewer uuid, state text, proposed jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare old public.people; extra uuid;
begin
  if not private.is_member(fid) then return false; end if;
  if submitter=auth.uid() or reviewer=auth.uid() or private.is_owner(fid) then return true; end if;
  if state<>'pending' then return false; end if;
  select * into old from public.people where id=target and family_id=fid;
  if target is null then
    extra:=coalesce(proposed->>'child_of',proposed->>'child_of_submitter')::uuid;
  end if;
  return private.may_add(fid,coalesce(target,(proposed->>'id')::uuid),old,proposed,extra,submitter);
exception when others then return false;
end; $$;

revoke all on function private.may_add(uuid,uuid,public.people,jsonb,uuid,uuid) from public,anon,authenticated;
revoke all on function public.tree_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tree_action(uuid,text,jsonb) to authenticated;
revoke all on function private.contribution_visible(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function private.contribution_visible(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
