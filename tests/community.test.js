import { test, expect, vi } from 'vitest';
const fixture = vi.hoisted(()=>({session:null,callback:null,error:null,me:null,posts:[],blocks:[]}));
const api = vi.hoisted(()=>({
  auth:{
    getSession:vi.fn(async()=>({data:{session:fixture.session}})),
    onAuthStateChange:vi.fn(fn=>{fixture.callback=fn;}),
    signOut:vi.fn(async()=>{fixture.session=null;fixture.callback('SIGNED_OUT',null);return {data:{}};}),
  },
  rpc:vi.fn(async(name,args)=>{
    if(fixture.error) return {error:{message:fixture.error}};
    if(name==='community_read') return {data:{posts:fixture.posts,me:fixture.session?fixture.me:null,blocks:fixture.session?fixture.blocks:[],profile:null}};
    const {action,payload}=args;
    if(action==='profile') fixture.me={id:'00000000-0000-0000-0000-000000000001',name:payload.name,bio:payload.bio,suspended:false};
    if(action==='post') fixture.posts=[{id:'00000000-0000-0000-0000-000000000002',author_id:fixture.me.id,name:fixture.me.name,body:payload.body,created_at:new Date().toISOString(),likes:0,liked:false,replies:0,parent_id:null}];
    if(action==='like') fixture.posts=fixture.posts.map(p=>({...p,likes:1,liked:true}));
    if(action==='block') {fixture.blocks=[{id:payload.id,name:'Fictional neighbor'}];fixture.posts=[];}
    if(action==='remove') fixture.posts=[];
    return {data:null};
  }),
}));
vi.mock('../supabase-client.js',()=>({configured:true,supabase:api}));
test('public browsing → adult opt-in → post/like/report/block → signout; drafts and escaping',async()=>{
  document.body.innerHTML='<div id="account"></div><main id="community"></main><p id="community-status"></p>';
  await import('../community.js');
  await vi.waitFor(()=>expect(document.body.textContent).toContain('A window into the community.'));
  expect(document.querySelector('#public-post')).toBeNull();
  expect(document.querySelector('#public-profile')).toBeNull();
  expect(api.rpc).toHaveBeenCalledWith('community_read',{request:{thread:null,profile:null}});
  fixture.session={user:{id:'synthetic-account'}};
  fixture.callback('SIGNED_IN',fixture.session);
  await vi.waitFor(()=>expect(document.querySelector('#public-profile')).not.toBeNull());
  expect(document.querySelector('#public-post')).toBeNull();
  const profile=document.querySelector('#public-profile');
  profile.elements.name.value='Fictional neighbor';
  profile.elements.bio.value='A public bio';
  expect(profile.checkValidity()).toBe(false);
  profile.elements.adult_confirmed.checked=true;
  profile.querySelector('button').click();
  await vi.waitFor(()=>expect(document.querySelector('#public-post')).not.toBeNull());
  expect(api.rpc).toHaveBeenCalledWith('community_action',{action:'profile',payload:{name:'Fictional neighbor',bio:'A public bio',adult_confirmed:true}});
  fixture.error='Posting limit reached';
  document.querySelector('#public-post textarea').value='Keep my draft';
  document.querySelector('#public-post button').click();
  await vi.waitFor(()=>expect(document.querySelector('#community-status').textContent).toBe('Posting limit reached'));
  expect(document.querySelector('#public-post textarea').value).toBe('Keep my draft');
  fixture.error=null;
  document.querySelector('#public-post textarea').value='<img src=x onerror=alert(1)> public text';
  document.querySelector('#public-post button').click();
  await vi.waitFor(()=>expect(document.querySelector('.post-body')?.textContent).toContain('<img'));
  expect(document.querySelector('.post-body img')).toBeNull();
  expect(document.querySelector('#public-post textarea').value).toBe('');
  document.querySelector('#public-post textarea').value='Another draft';
  document.querySelector('[data-action=like]').click();
  await vi.waitFor(()=>expect(document.querySelector('[data-action=like]').getAttribute('aria-pressed')).toBe('true'));
  expect(document.querySelector('#public-post textarea').value).toBe('Another draft');
  // Another person's post exposes reporting and blocking, never owner removal.
  fixture.posts=fixture.posts.map(p=>({...p,author_id:'00000000-0000-0000-0000-000000000003'}));
  document.querySelector('#community-refresh').click();
  await vi.waitFor(()=>expect(document.querySelector('form[data-report]')).not.toBeNull());
  expect(document.querySelector('[data-action=remove]')).toBeNull();
  document.querySelector('form[data-report] button').click();
  await vi.waitFor(()=>expect(document.querySelector('#community-status').textContent).toContain('Report received'));
  expect(api.rpc).toHaveBeenCalledWith('community_action',{action:'report',payload:{id:'00000000-0000-0000-0000-000000000002',reason:'privacy'}});
  vi.spyOn(window,'confirm').mockReturnValue(true);
  document.querySelector('[data-action=block]').click();
  await vi.waitFor(()=>expect(document.querySelector('#community-posts').textContent).toContain('Every conversation starts'));
  expect(document.querySelector('.community-profile').textContent).toContain('Unblock');
  document.querySelector('#community-logout').click();
  await vi.waitFor(()=>expect(document.querySelector('#public-post')).toBeNull());
  expect(document.querySelector('#public-profile')).toBeNull();
  expect(document.body.textContent).not.toContain('Another draft');
  expect(api.rpc.mock.calls.every(([name])=>name.startsWith('community_'))).toBe(true);
});
