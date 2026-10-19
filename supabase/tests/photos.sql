-- Person photos: who may upload, set, read and remove. Fictional records only.
begin;
insert into auth.users(id,email,email_confirmed_at) select ('00000000-0000-0000-0000-0000000000'||n)::uuid,'photo'||n||'@example.test',now() from unnest(array['41','42','43','44']) n;
create function public.test_assert(ok boolean, description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; end; $$;
create function public.test_denied(statement text) returns boolean language plpgsql security invoker as $$ begin execute statement; return false; exception when others then return true; end; $$;
create function public.test_as(n text) returns void language sql as $$ select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000'||n,true); $$;
create function public.v(name text) returns uuid language sql stable as $$ select current_setting('test.'||name)::uuid; $$;
create function public.keep(name text, value uuid) returns void language sql as $$ select set_config('test.'||name,value::text,true); $$;
create function public.save(payload jsonb) returns uuid language sql as $$ select public.tree_action(public.v('fam'),'save',payload); $$;
-- A path in the photo folder of `person`, and an "upload" of it (an insert checked by the storage policies).
create function public.photo_path(person text) returns text language sql as $$ select public.v('fam')||'/'||public.v(person)||'/'||gen_random_uuid()||'.jpg'; $$;
create function public.upload(path text) returns void language sql as $$ insert into storage.objects(bucket_id,name) values('family-photos',path); $$;
-- The app deletes files through the Storage API; hosted Supabase refuses direct SQL deletes from
-- its storage tables, so a test delete there is skipped (the file stays until the rollback).
create function public.drop_file(path text) returns void language plpgsql as $$ begin delete from storage.objects where name=path; exception when insufficient_privilege then null; end; $$;
create function public.photo_of(person text) returns text language sql stable as $$ select photo_path from public.people where id=public.v(person); $$;
grant execute on function public.test_assert(boolean,text),public.test_denied(text),public.test_as(text),public.v(text),public.keep(text,uuid),public.save(jsonb),public.photo_path(text),public.upload(text),public.drop_file(text),public.photo_of(text) to anon,authenticated;
set local role authenticated;

select public.test_as('41');
select public.keep('fam',public.create_family('Fictional photo family','Owner'));
select public.keep('owner',public.save('{"name":"Fictional owner","life_status":"living"}'));
select public.tree_action(public.v('fam'),'claim',jsonb_build_object('person_id',public.v('owner')));
select public.keep('grandma',public.save('{"name":"Fictional grandmother","life_status":"deceased","source_note":"Fictional","my_parent":true}'));
select public.keep('mom',public.save('{"name":"Fictional mother","life_status":"living"}'));
select public.keep('uncle',public.save('{"name":"Fictional uncle","life_status":"living"}'));
do $$ begin perform set_config('test.code',public.create_invitation(public.v('fam'),'photo42@example.test',public.v('mom')),true); perform set_config('test.code3',public.create_invitation(public.v('fam'),'photo43@example.test'),true); end $$;
select public.test_as('42');
select public.accept_invitation(current_setting('test.code'),'Mom');
select public.keep('kid',public.save(jsonb_build_object('name','Fictional child','life_status','living','birth_date',to_char(current_date-interval '8 years','YYYY-MM-DD'),'parents',jsonb_build_array(public.v('mom')))));
select public.test_as('43');
select public.accept_invitation(current_setting('test.code3'),'Cousin');

-- A member who cannot edit a record cannot upload or set its photo.
select public.test_assert(public.test_denied(format('select public.upload(%L)',public.photo_path('uncle'))),'member cannot upload for an owner-edited record');
select public.test_assert(public.test_denied(format('select public.upload(%L)',public.photo_path('grandma'))),'non-keeper cannot upload a memorial photo');
select public.test_assert(public.test_denied(format('select public.upload(%L)',public.photo_path('kid'))),'non-parent cannot upload a child''s photo');
select public.test_assert(public.test_denied(format('select public.upload(%L)',public.v('fam')||'/not-a-photo.png')),'malformed path refused');

-- The owner sets photos for records they edit and memorials they keep, not for a child.
select public.test_as('41');
select set_config('test.unclePhoto',public.photo_path('uncle'),true);
select public.upload(current_setting('test.unclePhoto'));
select public.test_assert(public.set_person_photo(public.v('fam'),public.v('uncle'),current_setting('test.unclePhoto')) is null,'first photo has no previous one');
select public.test_assert(public.photo_of('uncle')=current_setting('test.unclePhoto'),'photo set');
select public.test_assert((select version=1 from public.people where id=public.v('uncle')),'a photo does not change the record version');
select set_config('test.granPhoto',public.photo_path('grandma'),true);
select public.upload(current_setting('test.granPhoto'));
select public.set_person_photo(public.v('fam'),public.v('grandma'),current_setting('test.granPhoto'));
select public.test_assert(public.test_denied(format('select public.upload(%L)',public.photo_path('kid'))),'owner who is not a parent cannot upload a child''s photo');
select public.test_assert(public.test_denied(format('select public.set_person_photo(%L,%L,%L)',public.v('fam'),public.v('uncle'),public.photo_path('uncle'))),'a photo must be uploaded first');
select public.test_assert(public.test_denied(format('select public.set_person_photo(%L,%L,%L)',public.v('fam'),public.v('uncle'),current_setting('test.granPhoto'))),'a photo from another person''s folder is refused');
select public.test_assert(public.test_denied(format('select public.upload(%L)',public.photo_path('mom'))),'owner cannot set the photo of someone with their own account');

-- The parent sets the child's photo, and their own.
select public.test_as('42');
select set_config('test.kidPhoto',public.photo_path('kid'),true);
select public.upload(current_setting('test.kidPhoto'));
select public.set_person_photo(public.v('fam'),public.v('kid'),current_setting('test.kidPhoto'));
select public.test_assert(public.photo_of('kid')=current_setting('test.kidPhoto'),'parent sets a child''s photo');
select set_config('test.momPhoto',public.photo_path('mom'),true);
select public.upload(current_setting('test.momPhoto'));
select public.set_person_photo(public.v('fam'),public.v('mom'),current_setting('test.momPhoto'));
select public.test_assert(public.test_denied(format('select public.upload(%L)',public.photo_path('grandma'))),'someone not linked to the memorial cannot upload for it');
select set_config('test.momPhoto2',public.photo_path('mom'),true);
select public.upload(current_setting('test.momPhoto2'));
select public.test_assert(public.set_person_photo(public.v('fam'),public.v('mom'),current_setting('test.momPhoto2'))=current_setting('test.momPhoto'),'replacing returns the previous photo to delete');
select public.drop_file(current_setting('test.momPhoto'));

-- Family members see the family's photos; nobody else does.
select public.test_as('43');
select public.test_assert((select count(*)=4 from storage.objects where bucket_id='family-photos' and name in (current_setting('test.unclePhoto'),current_setting('test.granPhoto'),current_setting('test.kidPhoto'),current_setting('test.momPhoto2'))),'family members read the family''s photos');
select public.test_assert(public.test_denied(format('select public.set_person_photo(%L,%L,null)',public.v('fam'),public.v('uncle'))),'member cannot remove a photo they could not set');
select public.test_assert(public.test_denied(format('delete from storage.objects where name=%L returning 1',current_setting('test.unclePhoto'))) or (select count(*)=1 from storage.objects where name=current_setting('test.unclePhoto')),'member cannot delete the file');
select public.test_as('44');
select public.keep('other',public.create_family('Other fictional family','Other'));
select public.test_assert((select count(*)=0 from storage.objects where bucket_id='family-photos'),'another family sees no photos');
select public.test_assert(public.test_denied(format('select public.upload(%L)',public.photo_path('uncle'))),'another family cannot upload');
select public.test_assert(public.test_denied(format('select public.set_person_photo(%L,%L,null)',public.v('fam'),public.v('uncle'))),'another family cannot remove');

-- Owners can always remove a photo, even one they could not set.
select public.test_as('41');
select public.test_assert(public.set_person_photo(public.v('fam'),public.v('mom'),null)=current_setting('test.momPhoto2'),'owner removes a photo and gets its path');
select public.test_assert(public.photo_of('mom') is null and private.may_remove_photo(public.v('fam'),public.v('mom')),'photo cleared and its file may be deleted by the owner');
select public.drop_file(current_setting('test.momPhoto2'));
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.test_assert((select count(*)=0 from storage.objects),'anonymous sees no photos');
select public.test_assert(public.test_denied(format('select public.set_person_photo(%L,%L,null)',public.v('fam'),public.v('uncle'))),'anonymous cannot change photos');
rollback;
