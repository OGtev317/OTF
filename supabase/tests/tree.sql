begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000021'),('00000000-0000-0000-0000-000000000022'),('00000000-0000-0000-0000-000000000023'),('00000000-0000-0000-0000-000000000024');
create function public.test_assert(ok boolean, description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; end; $$;
create function public.test_denied(statement text) returns boolean language plpgsql security invoker as $$ begin execute statement; return false; exception when others then return true; end; $$;
grant execute on function public.test_assert(boolean,text),public.test_denied(text) to anon,authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
select set_config('test.family',public.create_family('Fictional extended family','Owner')::text,true);
select set_config('test.parent',public.tree_action(current_setting('test.family')::uuid,'save','{"name":"Fictional parent","branch":"North household","life_status":"deceased","birth_date":"1930-01-01","death_date":"2000-01-01","source_note":"Fictional family recollection"}')::text,true);
do $$ begin perform set_config('test.invite',public.create_invitation(current_setting('test.family')::uuid),true); end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
do $$ begin perform public.accept_invitation(current_setting('test.invite'),'Member'); end $$;
select set_config('test.child',public.tree_action(current_setting('test.family')::uuid,'save',jsonb_build_object('name','Fictional child','branch','South household','parents',jsonb_build_array(current_setting('test.parent'))))::text,true);
select public.test_assert((select count(*)=2 from public.people),'new relative visible immediately');
select public.test_assert((select life_status='unknown' and birth_date is null from public.people where id=current_setting('test.child')::uuid),'unknown life details allowed');
select public.test_assert((select added_by=auth.uid() from public.people where id=current_setting('test.child')::uuid),'server records actual contributor');
select public.test_assert((select count(*)=0 from public.tree_contributions),'new relative needs no approval');
select set_config('test.edit',public.tree_action(current_setting('test.family')::uuid,'save',jsonb_build_object('id',current_setting('test.parent'),'version',1,'story','A proposed story'))::text,true);
select public.test_assert((select story='' and version=1 from public.people where id=current_setting('test.parent')::uuid),'member edit does not change canonical record');
select public.test_assert((select proposed_record->>'branch'='North household' from public.tree_contributions where id=current_setting('test.edit')::uuid),'partial edits preserve memorial fields');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''approve'',%L)',current_setting('test.family'),jsonb_build_object('id',current_setting('test.edit')))),'member cannot approve own proposal');
select public.test_assert(public.test_denied('update public.people set story=''bypass'''),'direct person update denied');
select public.test_assert(public.test_denied('update public.tree_contributions set status=''approved'''),'direct approval denied');
select public.test_assert(public.test_denied(format('select private.family_action_legacy(%L,''person'',%L)',current_setting('test.family'),jsonb_build_object('id',current_setting('test.parent'),'version',1,'name','bypass'))),'legacy tree bypass denied');
select public.test_assert(public.test_denied(format('select private.apply_tree_record(%L,%L,%L)',current_setting('test.family'),current_setting('test.parent'),'{}')),'private write helper denied');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',%L)',current_setting('test.family'),jsonb_build_object('id',current_setting('test.parent'),'version',1,'story','second'))),'duplicate pending proposal denied');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',''{"name":"Bad dates","life_status":"deceased","birth_date":"2001-01-01","death_date":"2000-01-01"}'')',current_setting('test.family'))),'reversed dates denied');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',''{"name":"Bad status","life_status":"living","death_date":"2000-01-01"}'')',current_setting('test.family'))),'death date requires deceased status');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',''{"name":"Future","birth_date":"2999-01-01"}'')',current_setting('test.family'))),'future birth denied');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
select public.test_assert((select count(*)=1 from public.tree_contributions),'owner sees proposal');
select public.tree_action(current_setting('test.family')::uuid,'approve',jsonb_build_object('id',current_setting('test.edit'),'note','Reviewed fictional source'));
select public.test_assert((select story='A proposed story' and version=2 and death_date='2000-01-01' from public.people where id=current_setting('test.parent')::uuid),'approval applies proposed fields once');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''approve'',%L)',current_setting('test.family'),jsonb_build_object('id',current_setting('test.edit')))),'repeat approval denied');
-- Another member cannot read or review another member's proposals.
do $$ begin perform set_config('test.invite',public.create_invitation(current_setting('test.family')::uuid),true); end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000024',true);
do $$ begin perform public.accept_invitation(current_setting('test.invite'),'Another member'); end $$;
select public.test_assert((select count(*)=0 from public.tree_contributions),'other member cannot read proposals');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''withdraw'',%L)',current_setting('test.family'),jsonb_build_object('id',current_setting('test.edit')))),'other member cannot withdraw');

-- Public legacy API also queues edits, including edits to a member's own additions.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
select set_config('test.ownedit',public.family_action(current_setting('test.family')::uuid,'person',jsonb_build_object('id',current_setting('test.child'),'version',1,'name','Changed child'))::text,true);
select public.test_assert((select name='Fictional child' from public.people where id=current_setting('test.child')::uuid),'own addition edits require review via legacy API');
select public.tree_action(current_setting('test.family')::uuid,'withdraw',jsonb_build_object('id',current_setting('test.ownedit')));
select public.test_assert((select status='withdrawn' from public.tree_contributions where id=current_setting('test.ownedit')::uuid),'contributor can withdraw');
select set_config('test.stale',public.tree_action(current_setting('test.family')::uuid,'save',jsonb_build_object('id',current_setting('test.parent'),'version',2,'story','Stale story'))::text,true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
select public.tree_action(current_setting('test.family')::uuid,'save',jsonb_build_object('id',current_setting('test.parent'),'version',2,'story','Owner correction'));
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''approve'',%L)',current_setting('test.family'),jsonb_build_object('id',current_setting('test.stale')))),'stale approval denied');
select public.tree_action(current_setting('test.family')::uuid,'reject',jsonb_build_object('id',current_setting('test.stale'),'note','Please use current record'));
select public.test_assert((select story='Owner correction' and version=3 from public.people where id=current_setting('test.parent')::uuid),'rejection preserves current person');

-- Cross-family links, writes, and proposal access are rejected.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000023',true);
select set_config('test.other',public.create_family('Other fictional family','Other owner')::text,true);
select public.test_assert((select count(*)=0 from public.tree_contributions),'other family cannot read proposals');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',''{"name":"intrusion"}'')',current_setting('test.family'))),'other family cannot add relatives');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',%L)',current_setting('test.other'),jsonb_build_object('name','Cross link','parents',jsonb_build_array(current_setting('test.parent'))))),'cross-family parent denied');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',%L)',current_setting('test.other'),jsonb_build_object('id',current_setting('test.parent'),'version',3,'name','intrusion'))),'cross-family edit denied');

-- A proposal that was valid can become cyclic when another relative changes.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
select set_config('test.a',public.tree_action(current_setting('test.family')::uuid,'save','{"name":"Cycle A"}')::text,true);
select set_config('test.b',public.tree_action(current_setting('test.family')::uuid,'save','{"name":"Cycle B"}')::text,true);
select set_config('test.cycle',public.tree_action(current_setting('test.family')::uuid,'save',jsonb_build_object('id',current_setting('test.a'),'version',1,'parents',jsonb_build_array(current_setting('test.b'))))::text,true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
select public.tree_action(current_setting('test.family')::uuid,'save',jsonb_build_object('id',current_setting('test.b'),'version',1,'parents',jsonb_build_array(current_setting('test.a'))));
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''approve'',%L)',current_setting('test.family'),jsonb_build_object('id',current_setting('test.cycle')))),'approval revalidates current ancestry');
select public.tree_action(current_setting('test.family')::uuid,'reject',jsonb_build_object('id',current_setting('test.cycle')));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
select set_config('test.revoked',public.tree_action(current_setting('test.family')::uuid,'save',jsonb_build_object('id',current_setting('test.parent'),'version',3,'story','Former member edit'))::text,true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
select public.family_action(current_setting('test.family')::uuid,'remove_member','{"user_id":"00000000-0000-0000-0000-000000000022"}');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''approve'',%L)',current_setting('test.family'),jsonb_build_object('id',current_setting('test.revoked')))),'removed member proposal cannot be approved');
select public.tree_action(current_setting('test.family')::uuid,'reject',jsonb_build_object('id',current_setting('test.revoked')));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
select public.test_assert((select count(*)=0 from public.tree_contributions),'removed member loses proposal reads');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',''{"name":"Removed member"}'')',current_setting('test.family'))),'removed member cannot add');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.test_assert(public.test_denied('select * from public.tree_contributions'),'anonymous cannot read proposals');
select public.test_assert(public.test_denied(format('select public.tree_action(%L,''save'',''{"name":"Anonymous"}'')',current_setting('test.family'))),'anonymous cannot add');
select public.test_assert(public.community_read()->'posts'='[]','tree data not exposed through Community');
reset role;
select public.test_assert((select count(*)=3 from private.person_history where family_id=current_setting('test.family')::uuid),'prior records retained only for applied edits');
rollback;
