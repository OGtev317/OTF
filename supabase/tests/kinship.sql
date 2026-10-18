-- Fictional people only. Synthetic UUIDs are records, not accounts or credentials.
begin;
insert into auth.users(id,email,email_confirmed_at) select ('00000000-0000-0000-0000-0000000000'||n)::uuid,'kin'||n||'@example.test',now() from unnest(array['31','32','33','34','35']) n;
create function public.test_assert(ok boolean, description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; end; $$;
create function public.test_denied(statement text) returns boolean language plpgsql security invoker as $$ begin execute statement; return false; exception when others then return true; end; $$;
create function public.test_as(n text) returns void language sql as $$ select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000'||n,true); $$;
create function public.v(name text) returns uuid language sql stable as $$ select current_setting('test.'||name)::uuid; $$;
create function public.keep(name text, value uuid) returns void language sql as $$ select set_config('test.'||name,value::text,true); $$;
create function public.save(payload jsonb) returns uuid language sql as $$ select public.tree_action(public.v('fam'),'save',payload); $$;
create function public.story(person text) returns text language sql stable as $$ select story from public.people where id=public.v(person); $$;
grant execute on function public.test_assert(boolean,text),public.test_denied(text),public.test_as(text),public.v(text),public.keep(text,uuid),public.save(jsonb),public.story(text) to anon,authenticated;
set local role authenticated;

-- 31 owns the family. Owners are not memorial stewards by default.
select public.test_as('31');
select public.keep('fam',public.create_family('Fictional kin','Owner'));
select public.keep('owner',public.save('{"name":"Fictional owner","life_status":"living"}'));
select public.tree_action(public.v('fam'),'claim',jsonb_build_object('person_id',public.v('owner')));
select public.test_assert((select person_id=public.v('owner') from public.memberships where user_id=auth.uid()),'owner links to their own place directly');
select public.keep('early',public.save('{"name":"Fictional grandmother","life_status":"deceased","source_note":"Owner recollection"}'));
select public.test_assert((select count(*)=1 from public.people),'owner who is not immediate family cannot add a memorial record directly');
select public.test_assert((select person_id is null and proposed_record->>'name'='Fictional grandmother' from public.tree_contributions where id=public.v('early')),'it waits as a proposed new relative');
select public.keep('mom',public.save('{"name":"Fictional mother","life_status":"living"}'));
select public.keep('child',public.save(jsonb_build_object('name','Fictional grandchild','life_status','living','parents',jsonb_build_array(public.v('mom')))));

-- Invitations name one address and one place in the tree.
select public.test_assert(public.test_denied(format('select public.create_invitation(%L)',public.v('fam'))),'invitation needs an email address');
select public.test_assert(public.test_denied(format('select public.create_invitation(%L,''not-an-email'')',public.v('fam'))),'invitation needs a valid email address');
do $$ begin perform set_config('test.momcode',public.create_invitation(public.v('fam'),' KIN32@Example.TEST ',public.v('mom')),true); end $$;
select public.test_assert(public.test_denied(format('select public.create_invitation(%L,''kin32@example.test'')',public.v('fam'))),'one open invitation per address');
select public.test_assert((select email='kin32@example.test' and person_id=public.v('mom') and invited_by=auth.uid() from public.list_invitations(public.v('fam'))),'owner sees address and place');
select public.test_as('33');
select public.test_assert(public.test_denied(format('select public.accept_invitation(%L,''Wrong person'')',current_setting('test.momcode'))),'a different account cannot use the invitation');
select public.test_as('32');
select public.accept_invitation(current_setting('test.momcode'),'Mom');
select public.test_assert((select person_id=public.v('mom') from public.memberships where user_id=auth.uid()),'accepting links the account to the named person');
select public.test_assert((select count(*)=0 from public.tree_contributions),'a proposal the mother cannot approve is not shown to her');

-- An immediate relative adds and keeps the memorial record.
select public.test_assert(public.test_denied('select public.save(''{"name":"No source","life_status":"deceased","my_parent":true}'')'),'memorial record needs a source');
select public.keep('grandma',public.save('{"name":"Fictional grandmother","life_status":"deceased","death_date":"2001-02-03","source_note":"Funeral program (fictional)","my_parent":true}'));
select public.test_assert((select public.v('grandma')=any(parents) and version=2 from public.people where id=public.v('mom')),'“they are my parent” links the new person to the mother');
select public.test_assert((select added_by=auth.uid() from public.people where id=public.v('grandma')),'memorial added directly by her child');
select public.save(jsonb_build_object('id',public.v('grandma'),'version',1,'story','Kept a garden','source_note','Funeral program (fictional)'));
select public.test_assert(public.story('grandma')='Kept a garden','child edits the memorial directly');

select public.test_as('31');
select public.test_assert((select count(*)=1 from public.tree_contributions where status='pending'),'owner still sees the early proposal');
select public.tree_action(public.v('fam'),'reject',jsonb_build_object('id',public.v('early'),'note','Already added by her daughter'));
select public.keep('ownerEdit',public.save(jsonb_build_object('id',public.v('grandma'),'version',2,'story','Owner version','source_note','Funeral program (fictional)')));
select public.test_assert(public.story('grandma')='Kept a garden','owner edit to a memorial becomes a proposal');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''approve'',%L)',public.v('fam'),jsonb_build_object('id',public.v('ownerEdit')))),'owner cannot approve memorial edits');
select public.keep('momEdit',public.save(jsonb_build_object('id',public.v('mom'),'version',2,'story','Owner wrote this')));
select public.test_assert(public.story('mom')='','owner edit to a linked person becomes a proposal');

select public.test_as('32');
select public.test_assert((select count(*)=2 from public.tree_contributions where status='pending'),'the steward and the person see proposals they can approve');
select public.tree_action(public.v('fam'),'approve',jsonb_build_object('id',public.v('ownerEdit')));
select public.tree_action(public.v('fam'),'reject',jsonb_build_object('id',public.v('momEdit'),'note','I will write my own'));
select public.test_assert(public.story('grandma')='Owner version','steward approves');
select public.test_assert(public.test_denied(format('select public.save(%L)',jsonb_build_object('id',public.v('mom'),'version',2,'life_status','deceased','source_note','x'))),'a linked person cannot be recorded as deceased');
select public.save(jsonb_build_object('id',public.v('mom'),'version',2,'story','My own words'));
select public.test_assert(public.story('mom')='My own words','a linked person edits their own record');
-- Members invite only to a place in the tree.
select public.test_assert(public.test_denied(format('select public.create_invitation(%L,''kin34@example.test'')',public.v('fam'))),'member must name the place');
select public.keep('aunt',public.save(jsonb_build_object('name','Fictional aunt','life_status','living','parents',jsonb_build_array(public.v('grandma')))));
select public.test_assert((select count(*)=0 from public.tree_contributions where status='pending'),'a child of the deceased adds her sibling directly');
do $$ begin perform set_config('test.auntcode',public.create_invitation(public.v('fam'),'kin34@example.test',public.v('aunt')),true); end $$;
select public.test_assert((select count(*)=1 from public.list_invitations(public.v('fam'))),'member sees only the invitations they sent');
select public.tree_action(public.v('fam'),'profile','{"about":"Fictional teacher","work":"School library","share":"Call on Sundays"}');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''profile'',%L)',public.v('fam'),jsonb_build_object('about',repeat('x',1001)))),'profile length limited');

-- The grandchild is not immediate family of the grandmother.
select public.test_as('31');
do $$ begin perform set_config('test.childcode',public.create_invitation(public.v('fam'),'kin33@example.test',public.v('child')),true); end $$;
select public.test_as('33');
select public.accept_invitation(current_setting('test.childcode'),'Grandchild');
select public.test_assert((select about='Fictional teacher' from public.life_profiles where user_id='00000000-0000-0000-0000-000000000032'),'family reads life profiles');
select public.keep('gcEdit',public.save(jsonb_build_object('id',public.v('grandma'),'version',3,'story','Grandchild version','source_note','Funeral program (fictional)')));
select public.test_assert(public.story('grandma')='Owner version','grandchild edit to a memorial is a proposal');
select public.keep('uncle',public.save(jsonb_build_object('name','Fictional uncle','parents',jsonb_build_array(public.v('grandma')))));
select public.test_assert((select count(*)=0 from public.people where name='Fictional uncle'),'grandchild cannot attach a new child to the memorial directly');
select public.keep('selfLink',public.save(jsonb_build_object('id',public.v('child'),'version',1,'parents',jsonb_build_array(public.v('mom'),public.v('grandma')))));
select public.test_assert((select not public.v('grandma')=any(parents) from public.people where id=public.v('child')),'linking yourself to a memorial is a proposal too');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''claim'',%L)',public.v('fam'),jsonb_build_object('person_id',public.v('mom')))),'already-linked account cannot claim another person');
select public.test_as('31');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''approve'',%L)',public.v('fam'),jsonb_build_object('id',public.v('uncle')))),'owner cannot approve additions to a memorial');
select public.test_as('32');
select public.tree_action(public.v('fam'),'approve',jsonb_build_object('id',public.v('uncle')));
select public.test_assert((select added_by='00000000-0000-0000-0000-000000000033' from public.people where name='Fictional uncle'),'approved addition credits the contributor');
select public.tree_action(public.v('fam'),'reject',jsonb_build_object('id',public.v('selfLink')));
select public.tree_action(public.v('fam'),'approve',jsonb_build_object('id',public.v('gcEdit')));

-- Brothers and sisters, and partners, are immediate family too.
select public.test_as('34');
select public.accept_invitation(current_setting('test.auntcode'),'Aunt');
select public.keep('brother',public.save(jsonb_build_object('name','Fictional late brother','life_status','deceased','source_note','Aunt recollection','parents',jsonb_build_array(public.v('grandma')))));
select public.test_assert((select count(*)=1 from public.people where id=public.v('brother')),'sibling of the deceased (via a shared parent) adds directly');
select public.tree_action(public.v('fam'),'profile','{"about":"Aunt profile"}');
do $$ begin perform set_config('test.auntsent',public.create_invitation(public.v('fam'),'cousin@example.test',(select id from public.people where name='Fictional uncle')),true); end $$;
select public.test_as('32');
select public.save(jsonb_build_object('id',public.v('brother'),'version',1,'story','Remembered by his sister','source_note','Aunt recollection'));
select public.test_assert(public.story('brother')='Remembered by his sister','another sibling edits directly');
select public.keep('partner',public.save(jsonb_build_object('name','Fictional late partner','life_status','deceased','source_note','Mother','partners',jsonb_build_array(public.v('mom')))));
select public.test_assert((select count(*)=1 from public.people where id=public.v('partner')),'partner of the deceased adds directly');
select public.test_assert(public.test_denied(format('select public.save(%L)',jsonb_build_object('name','Bad partner','partners',jsonb_build_array(public.v('mom'),public.v('mom'))))),'duplicate partners denied');
select public.test_assert(public.test_denied(format('select public.save(%L)',jsonb_build_object('name','Bad kind','parents',jsonb_build_array(public.v('mom')),'parent_kinds',jsonb_build_object(public.v('mom'),'cousin')))),'unknown parent type denied');
select public.keep('adopted',public.save(jsonb_build_object('name','Fictional adopted child','parents',jsonb_build_array(public.v('mom')),'parent_kinds',jsonb_build_object(public.v('mom'),'adoptive','00000000-0000-0000-0000-000000000099','step'))));
select public.test_assert((select parent_kinds=jsonb_build_object(public.v('mom'),'adoptive') from public.people where id=public.v('adopted')),'parent types kept only for recorded parents');
select public.test_as('33');
select public.keep('gcBrother',public.save(jsonb_build_object('id',public.v('brother'),'version',2,'story','Nephew version','source_note','Aunt recollection')));
select public.test_assert(public.story('brother')='Remembered by his sister','nephew edit to a memorial is a proposal');

-- Changing who someone is: unlink, request, owner confirms.
select public.tree_action(public.v('fam'),'unlink','{}');
select public.tree_action(public.v('fam'),'claim',jsonb_build_object('person_id',public.v('child')));
select public.test_assert((select person_id is null and claim_person_id=public.v('child') from public.memberships where user_id=auth.uid()),'member claim waits for an owner');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''approve_claim'',''{}'')',public.v('fam'))),'member cannot confirm their own claim');
select public.test_as('31');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''claim'',%L)',public.v('fam'),jsonb_build_object('person_id',public.v('grandma')))),'memorial record cannot be claimed');
select public.tree_action(public.v('fam'),'approve_claim',jsonb_build_object('user_id','00000000-0000-0000-0000-000000000033'));
select public.test_assert((select person_id=public.v('child') from public.memberships where user_id='00000000-0000-0000-0000-000000000033'),'owner confirms the claim');

-- Adding a new parent for someone already in the tree: both records must be allowed.
select public.keep('ownerParent',public.save(jsonb_build_object('name','Fictional owner parent','life_status','living','parent_of',public.v('owner'))));
select public.test_assert((select public.v('ownerParent')=any(parents) from public.people where id=public.v('owner')),'a parent for your own place applies directly');
select public.keep('momParent',public.save(jsonb_build_object('name','Fictional second parent','life_status','living','parent_of',public.v('mom'))));
select public.test_assert((select count(*)=0 from public.people where name='Fictional second parent'),'a parent for someone else''s linked record waits for them');
select public.test_assert((select proposed_record->>'child_of'=public.v('mom')::text from public.tree_contributions where id=public.v('momParent')),'the proposal names the child');
select public.test_assert(public.test_denied(format('select public.save(%L)',jsonb_build_object('name','Loop','parents',jsonb_build_array(public.v('mom')),'parent_of',public.v('grandma')))),'a new parent cannot descend from the child');
select public.test_assert(public.test_denied(format('select public.save(%L)',jsonb_build_object('id',public.v('mom'),'version',3,'name','Fictional mother','parent_of',public.v('grandma')))),'only a new person can be added as a parent');
select public.test_as('32');
select public.test_assert((select count(*)=1 from public.tree_contributions where id=public.v('momParent')),'the person whose record changes sees the proposal');
select public.tree_action(public.v('fam'),'approve',jsonb_build_object('id',public.v('momParent')));
select public.test_assert((select p.id=any(m.parents) and p.added_by='00000000-0000-0000-0000-000000000031' from public.people p, public.people m where p.name='Fictional second parent' and m.id=public.v('mom')),'approval adds the parent, credited to the contributor, and links them');
select public.keep('ggp',public.save(jsonb_build_object('name','Fictional great-grandparent','life_status','deceased','source_note','Fictional','parent_of',public.v('grandma'))));
select public.test_assert((select count(*)=0 from public.people where name='Fictional great-grandparent'),'a grandchild cannot add a memorial great-grandparent directly');
select public.test_as('31');

-- Removing a member ends their invitations and profile.
select public.family_action(public.v('fam'),'remove_member','{"user_id":"00000000-0000-0000-0000-000000000034"}');
select public.test_assert((select revoked_at is not null from public.list_invitations(public.v('fam')) where email='cousin@example.test'),'removed member''s invitation is revoked');
select public.test_assert((select count(*)=0 from public.life_profiles where user_id='00000000-0000-0000-0000-000000000034'),'removed member''s profile is deleted');
select public.test_as('32');
do $$ begin perform public.create_invitation(public.v('fam'),'adopted@example.test',public.v('adopted')); end $$;
select public.family_action(public.v('fam'),'revoke_invitation',jsonb_build_object('id',(select id from public.list_invitations(public.v('fam')) where email='adopted@example.test')));
select public.test_assert((select revoked_at is not null from public.list_invitations(public.v('fam')) where email='adopted@example.test'),'member revokes their own invitation');
select public.test_assert(public.test_denied('update public.memberships set person_id=null'),'direct link change denied');
select public.test_assert(public.test_denied('insert into public.life_profiles(family_id,user_id) values (public.v(''fam''),auth.uid())'),'direct profile write denied');
select public.test_assert(public.test_denied(format('select private.may_apply(%L,%L,null,''{}'')',public.v('fam'),public.v('mom'))),'private helpers not callable');
select public.test_assert(public.test_denied(format('select private.apply_person(%L,%L,''{}'',auth.uid())',public.v('fam'),public.v('mom'))),'private write helper not callable');

-- Another family sees none of it; legacy invitations without an address still work until they expire.
select public.test_as('35');
select public.keep('other',public.create_family('Other fictional family','Other owner'));
select public.test_assert((select count(*)=0 from public.life_profiles),'no cross-family profiles');
select public.test_assert((select count(*)=1 from public.memberships),'no cross-family links');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''claim'',%L)',public.v('fam'),jsonb_build_object('person_id',public.v('mom')))),'cannot claim in another family');
reset role;
insert into private.invitations(family_id,token_hash) values(public.v('fam'),encode(sha256(convert_to('legacy-fictional-code','UTF8')),'hex'));
set local role authenticated;
select public.accept_invitation('legacy-fictional-code','Legacy');
select public.test_assert((select count(*)=1 from public.families where id=public.v('fam')),'legacy invitation accepted');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.test_assert(public.test_denied('select * from public.life_profiles'),'anonymous cannot read profiles');
reset role;
select public.test_assert((select count(*)=1 from private.invitations where email is null),'only the legacy invitation has no address');
rollback;
