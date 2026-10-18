begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000011'),('00000000-0000-0000-0000-000000000012'),('00000000-0000-0000-0000-000000000013');
create function public.test_assert(ok boolean, description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; end; $$;
create function public.test_denied(statement text) returns boolean language plpgsql security invoker as $$ begin execute statement; return false; exception when others then return true; end; $$;
grant execute on function public.test_assert(boolean,text),public.test_denied(text) to anon,authenticated;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.test_assert(public.community_read()->'posts'='[]','anonymous empty feed');
select public.test_assert(public.test_denied('select public.community_action(''profile'',''{"name":"Intruder","adult_confirmed":true}'')'),'anonymous cannot opt in');
select public.test_assert(public.test_denied('select * from private.community_profiles'),'no raw profile access');
select public.test_assert(public.test_denied('select * from private.community_reports'),'no report access');
select public.test_assert(public.test_denied('select * from public.posts'),'family posts remain private');
select public.test_assert(public.test_denied('select * from public.people'),'tree remains private');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select public.test_assert(public.test_denied('select public.community_action(''post'',''{"body":"No profile"}'')'),'no participation without opt in');
select public.test_assert(public.test_denied('select public.community_action(''profile'',''{"name":"No adult confirmation"}'')'),'adult confirmation required');
select set_config('test.a',public.community_action('profile','{"name":"Fictional A","bio":"Hello","adult_confirmed":true}')::text,true);
select set_config('test.post',public.community_action('post','{"body":"Public hello"}')::text,true);
select public.test_assert(public.test_denied('select public.community_action(''post'',''{"body":"   "}'')'),'blank posts rejected');
select public.test_assert(public.test_denied(format('select public.community_action(''post'',%L)',jsonb_build_object('body',repeat('a',501)))),'long posts rejected');
select public.test_assert(public.test_denied('insert into private.community_posts(author_id,body) values(gen_random_uuid(),''bypass'')'),'direct writes denied');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
select set_config('test.b',public.community_action('profile','{"name":"Fictional B","adult_confirmed":true}')::text,true);
select public.community_action('like',jsonb_build_object('id',current_setting('test.post'),'liked',true));
select public.community_action('like',jsonb_build_object('id',current_setting('test.post'),'liked',true));
select public.test_assert((public.community_read()->'posts'->0->>'likes')::int=1,'idempotent likes');
select set_config('test.reply',public.community_action('post',jsonb_build_object('body','Public reply','parent_id',current_setting('test.post')))::text,true);
select public.test_assert(jsonb_array_length(public.community_read(jsonb_build_object('thread',current_setting('test.post')))->'posts')=2,'thread has root and reply');
select public.test_assert(public.test_denied(format('select public.community_action(''remove'',%L)',jsonb_build_object('id',current_setting('test.post')))),'cannot remove someone else post');
select public.community_action('report',jsonb_build_object('id',current_setting('test.post'),'reason','privacy'));
select public.test_assert(public.test_denied('select * from private.community_reports'),'report remains private to reporter too');
select public.test_assert(not (public.community_read()::text like '%account_id%'),'account IDs never returned');

select public.community_action('block',jsonb_build_object('id',current_setting('test.a'),'blocked',true));
select public.test_assert(public.community_read()->'posts'='[]','blocker feed hides target');
select public.test_assert(public.community_read(jsonb_build_object('thread',current_setting('test.post')))->'posts'='[]','block hides thread and replies');
select public.test_assert(public.test_denied(format('select public.community_action(''like'',%L)',jsonb_build_object('id',current_setting('test.post'),'liked',true))),'blocker cannot like target');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select public.test_assert(public.test_denied(format('select public.community_action(''like'',%L)',jsonb_build_object('id',current_setting('test.reply'),'liked',true))),'blocked user cannot like blocker');
select public.test_assert(public.test_denied(format('select public.community_action(''post'',%L)',jsonb_build_object('body','intrusion','parent_id',current_setting('test.reply')))),'blocked reply denied');
select public.test_assert(public.community_read(jsonb_build_object('profile',current_setting('test.b')))->'profile'='null','blocked profile hidden');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.test_assert(jsonb_array_length(public.community_read()->'posts')=1,'public remains readable signed out');
select public.test_assert(public.community_read()->'me'='null','anonymous has no identity');
select public.test_assert(public.community_read()->'blocks'='[]','anonymous cannot read block lists');
select public.test_assert(not (public.community_read()::text like '%reporter%'),'reports never returned');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
select public.community_action('block',jsonb_build_object('id',current_setting('test.a'),'blocked',false));
select public.test_assert(jsonb_array_length(public.community_read()->'posts')=1,'unblock restores feed');
select public.test_assert(public.test_denied(format('select public.community_action(''post'',%L)',jsonb_build_object('body','nested','parent_id',current_setting('test.reply')))),'nested replies not accepted');
select public.test_assert(public.test_denied(format('select public.community_action(''report'',%L)',jsonb_build_object('id',current_setting('test.post'),'reason','invalid'))),'report reasons validated');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select public.community_action('remove',jsonb_build_object('id',current_setting('test.post')));
select public.test_assert(public.community_read(jsonb_build_object('thread',current_setting('test.post')))->'posts'='[]','removed root also hides replies');
-- Server-controlled suspension; clients cannot clear it with a forged payload.
reset role;
update private.community_profiles set suspended=true where id=current_setting('test.a')::uuid;
set local role authenticated;
select public.test_assert(public.test_denied('select public.community_action(''profile'',''{"name":"Evade","suspended":false,"adult_confirmed":true}'')'),'suspension cannot be bypassed');
select public.test_assert(public.test_denied('select public.community_action(''post'',''{"body":"Evade"}'')'),'suspended writes denied');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',true);
select set_config('test.c',public.community_action('profile','{"name":"Fictional C","adult_confirmed":true}')::text,true);
do $$ begin for i in 1..20 loop perform public.community_action('post',jsonb_build_object('body','Pagination '||i)); end loop; end $$;
select public.test_assert(public.test_denied('select public.community_action(''post'',''{"body":"Too many"}'')'),'posting rate limit enforced');
select public.test_assert(jsonb_array_length(public.community_read()->'posts')=20,'feed page bounded');
select public.test_assert(public.community_read(jsonb_build_object('before_time',(public.community_read()->'posts'->19->>'created_at'),'before_id',(public.community_read()->'posts'->19->>'id')))->'posts'='[]','cursor excludes already seen posts');
reset role;
select public.test_assert((select count(*)=1 from private.community_reports),'one report retained privately');
select public.test_assert((select count(*)=0 from public.posts),'no public-to-family copying');
rollback;
