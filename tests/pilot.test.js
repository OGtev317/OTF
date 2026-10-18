import { test, expect, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ rows: { families: [], memberships: [], posts: [], comments: [], reactions: [], people: [], events: [] }, error: null, invite: '', session: { user: { id: 'synthetic-owner' } } }));
const api = vi.hoisted(() => ({
  auth: {
    onAuthStateChange: vi.fn(), getSession: vi.fn(async()=>({data:{session:null}})),
    signInWithPassword: vi.fn(async()=>({data:{session:fixture.session}})),
    signOut: vi.fn(async()=>({data:{}})),
  },
  from: vi.fn(table=>({select:()=>({order:async()=>({data:fixture.rows[table]}),eq:async()=>({data:fixture.rows[table]})})})),
  rpc: vi.fn(async(name,args)=>{
    if(fixture.error)return {error:{message:fixture.error}};
    if(name==='create_family'){
      fixture.rows.families=[{id:'family-a',name:args.family_name}];
      fixture.rows.memberships=[{family_id:'family-a',user_id:'synthetic-owner',display_name:args.member_name,role:'owner'}];
      return {data:'family-a'};
    }
    if(name==='list_invitations')return {data:[]};
    if(name==='create_invitation')return {data:fixture.invite};
    if(name==='family_action'&&args.action==='post')fixture.rows.posts.push({id:'post-a',author_id:'synthetic-owner',body:args.payload.body,created_at:new Date().toISOString()});
    return {data:null};
  }),
}));
vi.mock('../supabase-client.js',()=>({configured:true,supabase:api}));
test('account → family → shared post → invitation → sign out; failed writes preserve drafts',async()=>{
  document.body.innerHTML='<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
  await vi.waitFor(()=>expect(document.querySelector('#auth-form')).not.toBeNull());
  document.querySelector('[name=email]').value='fictional@example.invalid';
  document.querySelector('[name=password]').value=crypto.randomUUID();
  document.querySelector('#auth-form button').click();
  await vi.waitFor(()=>expect(document.querySelector('#create-family')).not.toBeNull());
  expect(api.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  document.querySelector('#create-family [name=family_name]').value='Sample family';
  document.querySelector('#create-family [name=member_name]').value='Sample owner';
  document.querySelector('#create-family button').click();
  await vi.waitFor(()=>expect(document.querySelector('#post')).not.toBeNull());
  fixture.error='Family access denied';
  document.querySelector('#post textarea').value='Keep this draft';
  document.querySelector('#post button').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toBe('Family access denied'));
  expect(document.querySelector('#post textarea').value).toBe('Keep this draft');
  fixture.error=null;
  document.querySelector('#post textarea').value='<img src=x onerror=alert(1)>Hello family';
  document.querySelector('#post button').click();
  await vi.waitFor(()=>expect(document.querySelector('.post-body')?.textContent).toContain('<img'));
  expect(document.querySelector('.post-body img')).toBeNull();
  expect(api.rpc).toHaveBeenCalledWith('family_action',expect.objectContaining({fid:'family-a',action:'post'}));
  fixture.invite=crypto.randomUUID();
  document.querySelector('[data-view=members]').click();
  document.querySelector('#invite').click();
  await vi.waitFor(()=>expect(document.querySelector('#invite-code input')?.value).toBe(fixture.invite));
  document.querySelector('#logout').click();
  await vi.waitFor(()=>expect(document.querySelector('#auth-form')).not.toBeNull());
  expect(document.body.textContent).not.toContain('Sample family');
  expect(document.body.textContent).not.toContain('Hello family');
});
