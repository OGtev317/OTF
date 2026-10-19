-- Join links and requests to join. Fictional records only.
begin;
insert into auth.users(id,email,email_confirmed_at) select ('00000000-0000-0000-0000-0000000000'||n)::uuid,'join'||n||'@example.test',now() from unnest(array['61','62','63','64','65']) n;
create function public.test_assert(ok boolean, description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; end; $$;
create function public.test_denied(statement text) returns boolean language plpgsql security invoker as $$ begin execute statement; return false; exception when others then return true; end; $$;
create function public.test_as(n text) returns void language sql as $$ select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000'||n,true); $$;
create function public.v(name text) returns uuid language sql stable as $$ select current_setting('test.'||name)::uuid; $$;
create function public.keep(name text, value uuid) returns void language sql as $$ select set_config('test.'||name,value::text,true); $$;
create function public.save(payload jsonb) returns uuid language sql as $$ select public.tree_action(public.v('fam'),'save',payload); $$;
grant execute on function public.test_assert(boolean,text),public.test_denied(text),public.test_as(text),public.v(text),public.keep(text,uuid),public.save(jsonb) to anon,authenticated;
set local role authenticated;

-- 61 owns the family; 62 is a member; 63, 64 and 65 have accounts but no family.
select public.test_as('61');
select public.keep('fam',public.create_family('Fictional join family','Owner'));
select public.keep('jordan',public.save('{"name":"Fictional Jordan Example","life_status":"living","birth_date":"1995-04-04"}'));
select public.keep('gran',public.save('{"name":"Fictional Gran","life_status":"deceased","source_note":"Fictional"}'));
do $$ begin perform set_config('test.code',public.create_join_link(public.v('fam')),true); perform set_config('test.member',public.create_invitation(public.v('fam'),'join62@example.test'),true); end $$;
select public.test_assert((select code=current_setting('test.code') from public.join_link(public.v('fam'))),'owner can copy the link again');
select public.test_as('62');
select public.accept_invitation(current_setting('test.member'),'Member');
select public.test_assert(public.test_denied(format('select public.join_link(%L)',public.v('fam'))),'members cannot see the link');
select public.test_assert(public.test_denied(format('select public.create_join_link(%L)',public.v('fam'))),'members cannot create a link');

-- A newcomer learns only the family's name, then asks to join.
select public.test_as('63');
select public.test_assert((select family_name='Fictional join family' and not member and not pending from public.preview_join_link(' '||upper(current_setting('test.code'))||' ')),'preview shows only the name; pasted spaces and case are ignored');
select public.test_assert((select count(*)=0 from public.people),'a newcomer cannot read the tree');
select public.keep('req',public.request_to_join(current_setting('test.code'),'Jordan Example','I am Maya''s child',1995));
select public.test_assert((select pending from public.preview_join_link(current_setting('test.code'))),'the newcomer sees their request is pending');
select public.test_assert(public.test_denied(format('select public.request_to_join(%L,''Jordan again'')',current_setting('test.code'))),'one pending request per family');
select public.test_assert((select count(*)=1 and min(family_name)='Fictional join family' from public.join_requests),'the newcomer sees their own request, with the family''s name');
select public.test_assert(public.test_denied(format('select public.decide_join_request(%L,%L,''approve'')',public.v('fam'),public.v('req'))),'a newcomer cannot approve themselves');
select public.test_assert(public.test_denied(format('select public.request_to_join(%L,''x'')',repeat('ab',32))),'an unknown code is refused');

-- Another newcomer, and a member who is not an owner.
select public.test_as('64');
select public.keep('req2',public.request_to_join(current_setting('test.code'),'Casey Example'));
select public.test_assert((select count(*)=1 from public.join_requests),'newcomers see only their own requests');
select public.test_as('62');
select public.test_assert((select count(*)=0 from public.join_requests),'members who are not owners see no requests');
select public.test_assert(public.test_denied(format('select public.decide_join_request(%L,%L,''approve'')',public.v('fam'),public.v('req'))),'members cannot approve');

-- The owner links the first newcomer to their place in the tree.
select public.test_as('61');
select public.test_assert((select count(*)=2 from public.join_requests where status='pending'),'owner sees the requests');
select public.test_assert(public.test_denied(format('select public.decide_join_request(%L,%L,''approve'',%L)',public.v('fam'),public.v('req'),public.v('gran'))),'a memorial cannot be linked to an account');
select public.test_assert(public.decide_join_request(public.v('fam'),public.v('req'),'approve',public.v('jordan'))=public.v('jordan'),'approve with a person');
select public.test_assert((select person_id=public.v('jordan') and role='member' and display_name='Jordan Example' from public.memberships where user_id='00000000-0000-0000-0000-000000000063'),'the newcomer joins, linked to that person');
select public.test_assert(public.test_denied(format('select public.decide_join_request(%L,%L,''decline'')',public.v('fam'),public.v('req'))),'an answered request cannot be answered again');
-- The second newcomer is added as someone new.
select public.keep('casey',public.decide_join_request(public.v('fam'),public.v('req2'),'approve',null,true));
select public.test_assert((select name='Casey Example' and life_status='living' and added_by='00000000-0000-0000-0000-000000000061' from public.people where id=public.v('casey')),'approve as a new living relative');
select public.test_assert((select person_id=public.v('casey') from public.memberships where user_id='00000000-0000-0000-0000-000000000064'),'and linked to them');

-- Declining, withdrawing, turning the link off, and limits.
select public.test_as('65');
select public.keep('req3',public.request_to_join(current_setting('test.code'),'Pat Example'));
select public.withdraw_join_request(public.v('req3'));
select public.test_assert((select status='withdrawn' from public.join_requests where id=public.v('req3')),'a newcomer withdraws');
select public.keep('req4',public.request_to_join(current_setting('test.code'),'Pat Example'));
select public.test_as('61');
select public.decide_join_request(public.v('fam'),public.v('req4'),'decline');
select public.test_assert(not exists(select 1 from public.memberships where user_id='00000000-0000-0000-0000-000000000065'),'declined: no access');
select public.revoke_join_link(public.v('fam'));
select public.test_as('65');
select public.test_assert(public.test_denied(format('select public.preview_join_link(%L)',current_setting('test.code'))),'a link that was turned off stops working');
select public.test_assert((select count(*)=0 from public.people),'a declined newcomer still cannot read the tree');
select public.test_as('61');
do $$ begin perform set_config('test.code2',public.create_join_link(public.v('fam'),1),true); end $$;
reset role;
update private.join_links set expires_at=now()-interval '1 minute' where code=current_setting('test.code2');
set local role authenticated;
select public.test_as('65');
select public.test_assert(public.test_denied(format('select public.request_to_join(%L,''Pat'')',current_setting('test.code2'))),'an expired link is refused');
select public.test_as('61');
select public.test_assert(public.test_denied(format('select public.create_join_link(%L,0)',public.v('fam'))),'link lifetime limited');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.test_assert(public.test_denied(format('select public.preview_join_link(%L)',current_setting('test.code'))),'anonymous cannot preview');
select public.test_assert(public.test_denied('select * from public.join_requests'),'anonymous cannot read requests');
reset role;
select public.test_assert((select count(*)=0 from private.join_links where code=current_setting('test.code') and revoked_at is null),'the replaced link stays off');
rollback;
