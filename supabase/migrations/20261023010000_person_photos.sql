-- Photos of people in the family tree, kept in a private storage bucket per family.
-- Files live at "<family id>/<person id>/<random id>.jpg" and are readable only by members of
-- that family (through short-lived signed links). Who may set a photo follows who may edit the
-- record directly; a child's photo (under 18, no account of their own) comes only from a parent
-- or guardian linked in the tree. Owners may always remove a photo. Additive.
begin;
alter table public.people
  add column photo_path text check(photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  add column photo_updated_at timestamptz;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('family-photos','family-photos',false,524288,array['image/jpeg'])
  on conflict(id) do update set public=false,file_size_limit=524288,allowed_mime_types=array['image/jpeg'];

-- The family and person named by a storage path; null when the path is not of that shape.
create function private.photo_part(path text, part integer) returns uuid
language sql immutable set search_path='' as $$
  select case when path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then split_part(path,'/',part)::uuid end;
$$;

-- Whether the caller may set the photo of `person`.
create function private.may_set_photo(fid uuid, person uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare rec public.people; me uuid;
begin
  if fid is null or person is null or not private.is_member(fid) then return false; end if;
  select * into rec from public.people where id=person and family_id=fid;
  if rec.id is null then return false; end if;
  me:=private.my_person(fid);
  -- A living child without their own account: only a parent or guardian linked in the tree.
  if rec.life_status<>'deceased' and rec.birth_date>current_date-interval '18 years'
    and not exists(select 1 from public.memberships where family_id=fid and person_id=person) then
    return me is not null and me=any(rec.parents);
  end if;
  return private.may_apply(fid,person,rec,to_jsonb(rec),null,null);
end; $$;

create function private.may_remove_photo(fid uuid, person uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.may_set_photo(fid,person) or (fid is not null and private.is_owner(fid));
$$;

create policy family_photos_read on storage.objects for select to authenticated
  using(bucket_id='family-photos' and private.is_member(private.photo_part(name,1)));
create policy family_photos_upload on storage.objects for insert to authenticated
  with check(bucket_id='family-photos' and private.may_set_photo(private.photo_part(name,1),private.photo_part(name,2)));
create policy family_photos_delete on storage.objects for delete to authenticated
  using(bucket_id='family-photos' and private.may_remove_photo(private.photo_part(name,1),private.photo_part(name,2)));

-- Sets (path) or removes (null) a person's photo. Returns the previous path, so the app can
-- delete that file. The new file must already be uploaded to this family's and person's folder.
create function public.set_person_photo(fid uuid, person uuid, path text default null) returns text
language plpgsql security definer set search_path='' as $$
declare old text;
begin
  if not private.is_member(fid) then raise exception 'Family access denied'; end if;
  perform 1 from public.families where id=fid for update;
  select photo_path into old from public.people where id=person and family_id=fid;
  if not found then raise exception 'Person unavailable'; end if;
  if path is null then
    if not private.may_remove_photo(fid,person) then raise exception 'You cannot remove this photo'; end if;
  else
    if not private.may_set_photo(fid,person) then raise exception 'Only someone who can edit this record directly can set its photo. A child’s photo comes from a parent or guardian in the tree.'; end if;
    if private.photo_part(path,1) is distinct from fid or private.photo_part(path,2) is distinct from person then raise exception 'That photo does not belong to this person'; end if;
    if not exists(select 1 from storage.objects where bucket_id='family-photos' and name=path) then raise exception 'Upload the photo first'; end if;
  end if;
  update public.people set photo_path=path,photo_updated_at=case when path is null then null else now() end where id=person and family_id=fid;
  return old;
end; $$;

revoke all on function private.photo_part(text,integer),private.may_set_photo(uuid,uuid),private.may_remove_photo(uuid,uuid) from public,anon;
-- Storage checks these while evaluating the policies above as the signed-in user.
grant execute on function private.photo_part(text,integer),private.may_set_photo(uuid,uuid),private.may_remove_photo(uuid,uuid) to authenticated;
revoke all on function public.set_person_photo(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_person_photo(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
