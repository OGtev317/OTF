-- Synthetic UUIDs are records, not accounts, passwords, or access credentials.
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
create function public.test_assert(ok boolean, description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; end; $$;
create function public.test_denied(statement text) returns boolean language plpgsql security invoker as $$ begin execute statement; return false; exception when others then return true; end; $$;
grant execute on function public.test_assert(boolean,text),public.test_denied(text) to anon,authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('test.family_a',public.create_family('Test family A','Owner A')::text,true);
select set_config('test.post',public.family_action(current_setting('test.family_a')::uuid,'post','{"body":"Family A only"}')::text,true);
select set_config('test.parent',public.family_action(current_setting('test.family_a')::uuid,'person','{"name":"Parent"}')::text,true);
select set_config('test.child',public.family_action(current_setting('test.family_a')::uuid,'person',jsonb_build_object('name','Child','parents',jsonb_build_array(current_setting('test.parent'))))::text,true);
select public.family_action(current_setting('test.family_a')::uuid,'event','{"title":"Gathering","event_date":"2027-01-01"}');
select public.test_assert((select count(*)=1 from public.families),'owner reads own family');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''person'',%L::jsonb)',current_setting('test.family_a'),jsonb_build_object('id',current_setting('test.parent'),'version',1,'name','Parent','parents',jsonb_build_array(current_setting('test.child'))))),'reject ancestry cycle');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''person'',%L::jsonb)',current_setting('test.family_a'),jsonb_build_object('id',current_setting('test.parent'),'version',0,'name','Stale'))),'reject stale edit');
-- Store invitation only in transaction-local memory; do not print it.
do $$ begin perform set_config('test.invite',public.create_invitation(current_setting('test.family_a')::uuid),true); end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('test.family_b',public.create_family('Test family B','Owner B')::text,true);
select public.test_assert((select count(*)=1 from public.families),'family B only sees itself');
select public.test_assert((select count(*)=0 from public.posts),'no cross-family posts');
select public.test_assert((select count(*)=0 from public.people),'no cross-family tree');
select public.test_assert((select count(*)=0 from public.events),'no cross-family events');
select public.test_assert((select count(*)=1 from public.memberships),'no cross-family membership roster');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''post'',''{"body":"intrusion"}'')',current_setting('test.family_a'))),'cannot write family A');
select public.test_assert(public.test_denied(format('select public.create_invitation(%L::uuid)',current_setting('test.family_a'))),'cannot invite into family A');
select public.test_assert(public.test_denied(format('select public.list_invitations(%L::uuid)',current_setting('test.family_a'))),'cannot list family A invitations');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''comment'',%L::jsonb)',current_setting('test.family_b'),jsonb_build_object('post_id',current_setting('test.post'),'body','intrusion'))),'cross-family comment foreign key');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''react'',%L::jsonb)',current_setting('test.family_b'),jsonb_build_object('post_id',current_setting('test.post'),'liked',true))),'cross-family reaction rejected');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''person'',%L::jsonb)',current_setting('test.family_b'),jsonb_build_object('name','Intrusion','parents',jsonb_build_array(current_setting('test.parent'))))),'cross-family parent rejected');
select public.test_assert(public.test_denied('insert into public.memberships values (gen_random_uuid(),auth.uid(),''Intruder'',''owner'')'),'direct membership escalation denied');
select public.test_assert(public.test_denied('update public.posts set body=''changed'''),'direct content write denied');
select public.test_assert(public.test_denied('select * from private.invitations'),'invite hashes inaccessible');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ begin perform public.accept_invitation(current_setting('test.invite'),'Relative C'); end $$;
select public.test_assert((select count(*)=1 from public.posts),'invited member can read posts');
select public.family_action(current_setting('test.family_a')::uuid,'comment',jsonb_build_object('post_id',current_setting('test.post'),'body','Hello family'));
select public.family_action(current_setting('test.family_a')::uuid,'react',jsonb_build_object('post_id',current_setting('test.post'),'liked',true));
select public.test_assert((select count(*)=1 from public.comments),'member can comment');
select public.test_assert((select count(*)=1 from public.reactions),'member can react');
select public.test_assert(public.test_denied(format('select public.create_invitation(%L::uuid)',current_setting('test.family_a'))),'member cannot invite');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''person'',''{"name":"Unauthorized"}'')',current_setting('test.family_a'))),'member cannot edit tree');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''remove_member'',''{"user_id":"00000000-0000-0000-0000-000000000001"}'')',current_setting('test.family_a'))),'member cannot remove owner');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.family_action(current_setting('test.family_a')::uuid,'remove_member','{"user_id":"00000000-0000-0000-0000-000000000003"}');
do $$ begin perform set_config('test.revoked',public.create_invitation(current_setting('test.family_a')::uuid),true); perform set_config('test.expired',public.create_invitation(current_setting('test.family_a')::uuid),true); end $$;
reset role;
update private.invitations set expires_at=now()-interval '1 day' where token_hash=encode(sha256(convert_to(current_setting('test.expired'),'UTF8')),'hex');
update private.invitations set revoked_at=now() where token_hash=encode(sha256(convert_to(current_setting('test.revoked'),'UTF8')),'hex');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select public.test_assert((select count(*)=0 from public.posts),'removed member loses read access');
select public.test_assert((select count(*)=0 from public.comments),'removed member loses comments');
select public.test_assert((select count(*)=0 from public.reactions),'removed member loses reactions');
select public.test_assert(public.test_denied(format('select public.family_action(%L::uuid,''post'',''{"body":"blocked"}'')',current_setting('test.family_a'))),'removed member loses write access');
do $$ begin
  if not public.test_denied(format('select public.accept_invitation(%L,''C'')',current_setting('test.invite'))) then raise exception 'Used invite accepted'; end if;
  if not public.test_denied(format('select public.accept_invitation(%L,''C'')',current_setting('test.revoked'))) then raise exception 'Revoked invite accepted'; end if;
  if not public.test_denied(format('select public.accept_invitation(%L,''C'')',current_setting('test.expired'))) then raise exception 'Expired invite accepted'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.test_assert(public.test_denied('select * from public.posts'),'anonymous read denied');
select public.test_assert(public.test_denied('select public.create_family(''No'',''No'')'),'anonymous family creation denied');
select public.test_assert(public.test_denied('select public.accept_invitation(''invalid'',''No'')'),'anonymous invite acceptance denied');
rollback;
