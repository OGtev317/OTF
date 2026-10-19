-- Historical records: memorials whose immediate family could no longer be alive. Fictional only.
begin;
insert into auth.users(id,email,email_confirmed_at) select ('00000000-0000-0000-0000-0000000000'||n)::uuid,'hist'||n||'@example.test',now() from unnest(array['51','52','53']) n;
create function public.test_assert(ok boolean, description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; end; $$;
create function public.test_denied(statement text) returns boolean language plpgsql security invoker as $$ begin execute statement; return false; exception when others then return true; end; $$;
create function public.test_as(n text) returns void language sql as $$ select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000'||n,true); $$;
create function public.v(name text) returns uuid language sql stable as $$ select current_setting('test.'||name)::uuid; $$;
create function public.keep(name text, value uuid) returns void language sql as $$ select set_config('test.'||name,value::text,true); $$;
create function public.save(payload jsonb) returns uuid language sql as $$ select public.tree_action(public.v('fam'),'save',payload); $$;
create function public.exists_named(n text) returns boolean language sql stable as $$ select exists(select 1 from public.people where name=n); $$;
grant execute on function public.test_assert(boolean,text),public.test_denied(text),public.test_as(text),public.v(text),public.keep(text,uuid),public.save(jsonb),public.exists_named(text) to anon,authenticated;
set local role authenticated;

-- 51 owns the family; 52 is the owner's child (linked); 53 is a member not linked to the tree.
select public.test_as('51');
select public.keep('fam',public.create_family('Fictional historic family','Owner'));
select public.keep('me',public.save('{"name":"Fictional owner","life_status":"living","birth_date":"1960-01-01"}'));
select public.tree_action(public.v('fam'),'claim',jsonb_build_object('person_id',public.v('me')));
select public.keep('kid',public.save(jsonb_build_object('name','Fictional grown child','life_status','living','parents',jsonb_build_array(public.v('me')))));
do $$ begin perform set_config('test.kidcode',public.create_invitation(public.v('fam'),'hist52@example.test',public.v('kid')),true); perform set_config('test.code3',public.create_invitation(public.v('fam'),'hist53@example.test'),true); end $$;
-- The owner's late father: the owner is his child, so this is the ordinary immediate-family rule.
select public.keep('dad',public.save('{"name":"Fictional late father","life_status":"deceased","birth_date":"1930-01-01","source_note":"Fictional","my_parent":true}'));
-- His father, born 1900: his only recorded child has died, so nobody in his immediate family can be alive.
select public.keep('gpa',public.save(jsonb_build_object('name','Fictional grandfather','life_status','deceased','birth_date','1900-01-01','source_note','Fictional census','parent_of',public.v('dad'))));
select public.test_assert(public.exists_named('Fictional grandfather'),'nearest living descendant adds a historical ancestor directly');
select public.test_assert((select public.v('gpa')=any(parents) from public.people where id=public.v('dad')),'and links him as the parent');
select public.test_as('52');
select public.accept_invitation(current_setting('test.kidcode'),'Child');
select public.keep('kidEdit',public.save(jsonb_build_object('id',public.v('gpa'),'version',1,'story','Child version','source_note','Fictional census')));
select public.test_assert((select story='' from public.people where id=public.v('gpa')),'a more distant descendant proposes; the nearest one keeps the record');
select public.test_as('53');
select public.accept_invitation(current_setting('test.code3'),'Unlinked');
select public.keep('strangerEdit',public.save(jsonb_build_object('id',public.v('gpa'),'version',1,'story','Stranger version','source_note','Fictional census')));
select public.test_assert((select count(*)=1 from public.tree_contributions where id=public.v('strangerEdit')),'an unlinked member proposes too');
select public.test_as('51');
select public.tree_action(public.v('fam'),'approve',jsonb_build_object('id',public.v('kidEdit')));
select public.test_assert((select story='Child version' from public.people where id=public.v('gpa')),'the nearest descendant approves');
select public.tree_action(public.v('fam'),'reject',jsonb_build_object('id',public.v('strangerEdit')));

-- A person born more than 110 years ago counts as no longer living, even without a death record.
select public.keep('ggm',public.save(jsonb_build_object('name','Fictional great-grandmother','life_status','deceased','source_note','Fictional','parent_of',public.v('gpa'))));
select public.keep('greataunt',public.save(jsonb_build_object('name','Fictional great-aunt','life_status','unknown','birth_date','1898-05-05','parents',jsonb_build_array(public.v('ggm')))));
select public.test_assert(public.exists_named('Fictional great-grandmother') and public.exists_named('Fictional great-aunt'),'older generations are added by the nearest descendant');

-- With no linked descendant at all, family owners keep a historical record; others propose.
select public.keep('lone',public.save('{"name":"Fictional distant cousin","life_status":"deceased","birth_date":"1850-01-01","source_note":"Fictional parish register"}'));
select public.test_assert(public.exists_named('Fictional distant cousin'),'owner keeps a historical record with no linked descendants');
select public.test_as('53');
select public.keep('lone2',public.save('{"name":"Fictional second cousin","life_status":"deceased","source_note":"Fictional"}'));
select public.test_assert(not public.exists_named('Fictional second cousin'),'a member''s addition waits for an owner');
select public.test_as('51');
select public.tree_action(public.v('fam'),'approve',jsonb_build_object('id',public.v('lone2')));
select public.test_assert(public.exists_named('Fictional second cousin'),'owner approves it');

-- Once a possibly living immediate relative is recorded, the record is no longer historical.
select public.save(jsonb_build_object('name','Fictional living child of the cousin','life_status','living','parents',jsonb_build_array(public.v('lone'))));
select public.keep('ownerEdit',public.save(jsonb_build_object('id',public.v('lone'),'version',1,'story','Owner story','source_note','Fictional parish register')));
select public.test_assert((select story='' from public.people where id=public.v('lone')),'with a possibly living child in the tree, the owner can no longer change it directly');
-- The ordinary rule still applies to the recently deceased father: only his child, the owner, keeps him.
select public.test_as('52');
select public.keep('dadEdit',public.save(jsonb_build_object('id',public.v('dad'),'version',2,'story','Grandchild version','source_note','Fictional')));
select public.test_assert((select story='' from public.people where id=public.v('dad')),'a grandchild still cannot change a recent memorial directly');
rollback;
