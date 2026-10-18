import { test, expect, vi } from 'vitest';
import { query } from './supabase-mock.js';
const fixture = vi.hoisted(() => ({ rows: { families: [], memberships: [], posts: [], comments: [], reactions: [], people: [], events: [] }, error: null, invite: '', session: { user: { id: 'synthetic-owner' } } }));
const api = vi.hoisted(() => ({
  auth: {
    onAuthStateChange: vi.fn(), getSession: vi.fn(async()=>({data:{session:null}})),
    signInWithPassword: vi.fn(async()=>({data:{session:fixture.session}})),
    signOut: vi.fn(async()=>({data:{}})),
  },
  from: vi.fn(table=>query(()=>fixture.rows[table]||[])),
  rpc: vi.fn(async(name,args)=>{
    if(fixture.error)return {error:{message:fixture.error}};
    if(name==='create_family'){
      fixture.rows.families=[{id:'family-a',name:args.family_name}];
      fixture.rows.memberships=[{family_id:'family-a',user_id:'synthetic-owner',display_name:args.member_name,role:'owner'}];
      return {data:'family-a'};
    }
    if(name==='list_invitations')return {data:[]};
    if(name==='create_invitation'){fixture.invited=args;return {data:fixture.invite};}
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
  expect(document.body.classList.contains('network-member')).toBe(true);
  expect(document.querySelector('.member-branch')).toBeNull();
  expect(api.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  document.querySelector('#create-family [name=family_name]').value='Sample family';
  document.querySelector('#create-family [name=member_name]').value='Sample owner';
  document.querySelector('#create-family button').click();
  await vi.waitFor(()=>expect(document.querySelector('#post')).not.toBeNull());
  expect(document.querySelector('#post-privacy').textContent).toContain('Only members of this family');
  expect(document.querySelector('#post-count').textContent).toBe('0 / 2,000');
  fixture.error='Family access denied';
  document.querySelector('#post textarea').value='Keep this draft';
  document.querySelector('#post textarea').dispatchEvent(new Event('input',{bubbles:true}));
  expect(document.querySelector('#post-count').textContent).toBe('15 / 2,000');
  document.querySelector('#post button').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toBe('Family access denied'));
  expect(document.querySelector('#post textarea').value).toBe('Keep this draft');
  expect(document.querySelector('#post-count').textContent).toBe('15 / 2,000');
  fixture.error=null;
  document.querySelector('#post textarea').value='<img src=x onerror=alert(1)>Hello family';
  document.querySelector('#post button').click();
  await vi.waitFor(()=>expect(document.querySelector('.post-body')?.textContent).toContain('<img'));
  expect(document.querySelector('.post-body img')).toBeNull();
  expect(document.querySelector('#post-count').textContent).toBe('0 / 2,000');
  expect(api.rpc).toHaveBeenCalledWith('family_action',expect.objectContaining({fid:'family-a',action:'post'}));
  // An unsent reply survives another action that redraws the page.
  document.querySelector('.comment-form input').value='Half-written reply';
  document.querySelector('[data-react]').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toBe('Saved to your family space.'));
  expect(document.querySelector('.comment-form input').value).toBe('Half-written reply');
  // Repeated buttons have names that say who they are for.
  fixture.rows.people.push({id:'person-a',family_id:'family-a',name:'Grandma Example',story:'',parents:[],version:1});
  document.querySelector('#refresh').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toBe('Up to date.'));
  await vi.waitFor(()=>{document.querySelector('[data-view=tree]').click();expect(document.querySelector('[data-edit]')).not.toBeNull();});
  expect(document.querySelector('[data-edit]').getAttribute('aria-label')).toBe('Edit Grandma Example');
  // An invitation names an address and a place in the tree, and opens in the inviter's email app.
  fixture.invite='cd'.repeat(32);
  document.querySelector('[data-view=members]').click();
  document.querySelector('#invite-form [name=email]').value=' relative@example.invalid ';
  document.querySelector('#invite-form [name=person]').value='person-a';
  document.querySelector('#invite-form button').click();
  await vi.waitFor(()=>expect(document.querySelector('#invite-code input')?.value).toBe(`${location.origin}/?invite=${fixture.invite}`));
  expect(fixture.invited).toEqual({fid:'family-a',invite_email:'relative@example.invalid',invite_person:'person-a'});
  const mail=document.querySelector('#invite-code a').getAttribute('href');
  expect(mail).toMatch(/^mailto:relative%40example.invalid\?subject=/);
  expect(decodeURIComponent(mail)).toContain('as Grandma Example');
  expect(decodeURIComponent(mail)).toContain('only when you sign up or sign in with relative@example.invalid');
  // A pasted code with spaces and a line break is cleaned; an incomplete one is refused before any request.
  document.querySelector('details').open=true;
  const join=document.querySelector('#join-family');
  join.querySelector('[name=member_name]').value='Sample relative';
  join.querySelector('[name=code]').value=' abc ';
  join.querySelector('button').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toMatch(/looks incomplete/));
  expect(api.rpc).not.toHaveBeenCalledWith('accept_invitation',expect.anything());
  const code='ab'.repeat(32);
  join.querySelector('[name=code]').value=`  ${code.slice(0,30)}\n${code.slice(30).toUpperCase()} `;
  join.querySelector('button').click();
  await vi.waitFor(()=>expect(api.rpc).toHaveBeenCalledWith('accept_invitation',{code,member_name:'Sample relative'}));
  await vi.waitFor(()=>{document.querySelector('#logout')?.click();expect(document.querySelector('#auth-form')).not.toBeNull();});
  expect(document.body.textContent).not.toContain('Sample family');
  expect(document.body.textContent).not.toContain('Hello family');
  expect(document.body.classList.contains('network-welcome')).toBe(true);
  expect(document.querySelector('.member-branch')).toBeNull();
});
