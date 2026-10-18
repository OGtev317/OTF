import { test,expect,vi } from 'vitest';
import { query } from './supabase-mock.js';
import { mayAdd, mayApply } from '../kinship.js';
// The owner is the child of a fictional ancestor, so they keep her memorial record; the member is not
// linked to the tree yet. The fake database follows the same rules as the real one (kinship.js mirrors it).
const fixture=vi.hoisted(()=>({
  user:'member',error:null,callback:null,next:0,
  rows:{families:[{id:'family-a',name:'Fictional extended family'}],
    memberships:[{user_id:'owner',display_name:'Owner',role:'owner',person_id:'owner-self',claim_person_id:null},{user_id:'member',display_name:'Member',role:'member',person_id:null,claim_person_id:null}],
    posts:[],comments:[],reactions:[],events:[],life_profiles:[{user_id:'owner',about:'Fictional gardener',work:'',share:''}],
    people:[{id:'parent-a',name:'Fictional ancestor',story:'Original story',parents:[],partners:[],parent_kinds:{},version:1,branch:'North household',life_status:'deceased',birth_date:'1930-01-01',death_date:'2000-01-01',source_note:'Fictional source'},
      {id:'owner-self',name:'Fictional owner',story:'',parents:['parent-a'],partners:[],parent_kinds:{},version:1,branch:'North household',life_status:'living'}],
    tree_contributions:[]},
}));
const api=vi.hoisted(()=>({
  auth:{getSession:vi.fn(async()=>({data:{session:{user:{id:fixture.user}}}})),onAuthStateChange:vi.fn(fn=>{fixture.callback=fn;})},
  from:vi.fn(),
  rpc:vi.fn(),
}));
vi.mock('../supabase-client.js',()=>({configured:true,demo:false,supabase:api}));
const rows=fixture.rows, owns=()=>fixture.user==='owner';
const visible=c=>owns()||c.submitted_by===fixture.user;
api.from.mockImplementation(table=>query(()=>table==='tree_contributions'?rows[table].filter(visible):rows[table]));
const link=(child,parent)=>{const kid=rows.people.find(p=>p.id===child);kid.parents=[...kid.parents,parent];kid.version+=1;};
api.rpc.mockImplementation(async(name,{action,payload}={})=>{
  if(fixture.error)return {error:{message:fixture.error}};
  if(name==='list_invitations')return {data:[]};
  const me=rows.memberships.find(m=>m.user_id===fixture.user);
  if(action==='save'){
    const old=rows.people.find(p=>p.id===payload.id), id=old?.id||`person-${++fixture.next}`, child=payload.parent_of||'';
    const {parent_of,my_parent,...fields}=payload;
    const record={parents:[],partners:[],parent_kinds:{},...old,...fields,id,version:(old?.version||0)+1};
    if(old?mayApply(rows,fixture.user,owns(),id,old,record):mayAdd(rows,fixture.user,owns(),id,record,child)){rows.people=[...rows.people.filter(p=>p.id!==id),record];if(child)link(child,id);return {data:id};}
    const proposal={id:`proposal-${++fixture.next}`,person_id:old?.id||null,submitted_by:fixture.user,base_version:old?.version||0,before_record:old||{},proposed_record:{...record,id,...(child?{child_of:child}:{})},status:'pending',submitted_at:'2026-10-18T00:00:00Z'};
    rows.tree_contributions.push(proposal);return {data:proposal.id};
  }
  if(action==='claim'){me.claim_person_id=payload.person_id;return {data:payload.person_id};}
  if(action==='approve_claim'){const m=rows.memberships.find(m=>m.user_id===payload.user_id);m.person_id=m.claim_person_id;m.claim_person_id=null;return {data:m.person_id};}
  const c=rows.tree_contributions.find(c=>c.id===payload.id);
  c.status=action==='approve'?'approved':action==='reject'?'rejected':'withdrawn';c.review_note=payload.note;
  if(action==='approve'){const {id,child_of,...record}=c.proposed_record;rows.people=[...rows.people.filter(p=>p.id!==id),{...record,id,version:(c.base_version||0)+1}];if(child_of)link(child_of,id);}
  return {data:c.id};
});
const status=()=>document.querySelector('#status').textContent;
const node=name=>[...document.querySelectorAll('.tree-canvas .tree-node')].find(n=>n.querySelector('strong').textContent===name);
const panel=()=>document.querySelector('#tree-panel');
const click=el=>{el.click();};
async function as(user){fixture.user=user;fixture.callback('SIGNED_IN',{user:{id:user}});document.querySelector('#refresh').click();await vi.waitFor(()=>expect(status()).toBe('Up to date.'));}
test('connected tree: select, add a child, parent and relative, approvals in place, drafts survive',async()=>{
  Element.prototype.scrollIntoView=vi.fn();
  globalThis.confirm=()=>true;
  document.body.innerHTML='<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
  await vi.waitFor(()=>expect(document.querySelector('[data-view=tree]')).not.toBeNull());
  document.querySelector('[data-view=tree]').click();
  expect([...document.querySelectorAll('.tree-gen-label')].map(h=>h.textContent)).toEqual(['Eldest recorded generation','Generation 2']);
  expect(document.querySelectorAll('.tree-lines .tree-line').length).toBe(1);
  expect(document.querySelector('#person')).toBeNull();

  // Selecting the ancestor opens her panel; as a member who is not immediate family, changes go to her keeper.
  click(node('Fictional ancestor'));
  expect(node('Fictional ancestor').classList.contains('selected')).toBe(true);
  expect(node('Fictional owner').classList.contains('near')).toBe(true);
  expect(panel().textContent).toContain('Kept by immediate family: Owner');
  expect(panel().textContent).toContain('Born January 1, 1930');
  expect(panel().querySelector('[data-edit]').textContent).toBe('Suggest an edit');
  click(panel().querySelector('[data-add=child]'));
  let form=document.querySelector('#person');
  expect(form.querySelector('h3').textContent).toBe('Add a child of Fictional ancestor');
  expect(form.querySelector('[name=parents][value=parent-a]').checked).toBe(true);
  expect(document.querySelector('#person-approval').textContent).toBe('This will be sent to Owner for approval. The tree stays as it is until then.');
  form.elements.name.value='Fictional memorial';form.elements.branch.value='South household';
  form.elements.life_status.value='deceased';form.elements.birth_date.value='1950-01-01';form.elements.death_date.value='2020-01-01';
  form.elements.story.value='<img src=x> A remembered story';form.elements.source_note.value='Fictional notes';
  form.querySelector('[name="kind:parent-a"]').value='adoptive';
  fixture.error='Family access denied';form.querySelector('button').click();
  await vi.waitFor(()=>expect(status()).toBe('Family access denied'));
  fixture.error=null;
  document.querySelector('#refresh').click();
  await vi.waitFor(()=>expect(status()).toBe('Up to date.'));
  form=document.querySelector('#person');
  expect(form.elements.name.value).toBe('Fictional memorial');expect(form.elements.life_status.value).toBe('deceased');
  expect(form.querySelector('[name="kind:parent-a"]').value).toBe('adoptive');
  form.querySelector('button').click();
  await vi.waitFor(()=>expect(status()).toContain('Sent for approval'));
  expect(api.rpc).toHaveBeenCalledWith('tree_action',expect.objectContaining({action:'save',payload:expect.objectContaining({name:'Fictional memorial',parents:['parent-a'],parent_kinds:{'parent-a':'adoptive'},life_status:'deceased'})}));
  expect(node('Fictional memorial').classList.contains('ghost')).toBe(true);
  expect(node('Fictional memorial').textContent).toContain('Awaiting approval');
  expect(node('Fictional memorial').querySelector('img')).toBeNull();
  expect(document.querySelectorAll('.tree-line.pending').length).toBe(1);

  // A living relative is added straight away and selected; editing them is a proposal for the owner.
  click(document.querySelector('.tree-toolbar [data-add=free]'));
  form=document.querySelector('#person');form.elements.name.value='Fictional cousin';form.elements.life_status.value='living';
  form.dispatchEvent(new Event('change',{bubbles:true}));
  expect(document.querySelector('#person-approval').textContent).toBe('This will be added to the tree straight away.');
  form.querySelector('button').click();
  await vi.waitFor(()=>expect(status()).toBe('Relative saved to your family tree.'));
  expect(node('Fictional cousin').classList.contains('selected')).toBe(true);
  click(panel().querySelector('[data-edit]'));
  form=document.querySelector('#person');
  expect(form.querySelector('h3').textContent).toBe('Suggest changes to Fictional cousin');
  expect(form.querySelector('button').textContent).toBe('Submit edit for approval');
  form.elements.story.value='Corrected story';
  document.querySelector('#refresh').click();
  await vi.waitFor(()=>expect(status()).toBe('Up to date.'));
  expect(document.querySelector('#person [name=story]').value).toBe('Corrected story');
  document.querySelector('#person button').click();
  await vi.waitFor(()=>expect(status()).toContain('Edit submitted for approval'));
  expect(node('Fictional cousin').textContent).toContain('Edit awaiting approval');
  expect(document.querySelector('#tree-attention').textContent).toContain('Your proposals waiting for others (2)');

  // The member says which person they are; it waits for an owner.
  click(panel().querySelector('[data-claim]'));
  await vi.waitFor(()=>expect(status()).toBe('Sent to a family owner to confirm.'));
  expect(document.querySelector('#you').textContent).toContain('Waiting for a family owner to confirm that you are Fictional cousin');

  // Search dims everyone else; Enter selects the match.
  const search=document.querySelector('#tree-search');search.value='ances';search.dispatchEvent(new Event('input',{bubbles:true}));
  expect(node('Fictional owner').classList.contains('dimmed')).toBe(true);
  document.querySelector('#tree-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  expect(node('Fictional ancestor').classList.contains('selected')).toBe(true);
  const clear=document.querySelector('#tree-search');clear.value='';clear.dispatchEvent(new Event('input',{bubbles:true}));

  // The owner sees what is waiting, reviews in place, and confirms who the member is.
  await as('owner');
  expect(document.querySelector('#tree-attention h3').textContent).toBe('Waiting for you (3)');
  expect([...document.querySelectorAll('.tree-gen-label')].map(h=>h.textContent)).toEqual(['Your parents’ generation','Your generation']);
  click([...document.querySelectorAll('#tree-attention [data-select]')].find(b=>b.closest('.member').textContent.includes('Fictional memorial')));
  expect(panel().textContent).toContain('AWAITING APPROVAL');
  panel().querySelector('[name=note]').value='Checked the source';
  panel().querySelector('button[value=approve]').click();
  await vi.waitFor(()=>expect(status()).toContain('Edit approved'));
  expect(node('Fictional memorial').classList.contains('ghost')).toBe(false);
  expect(node('Fictional memorial').textContent).toContain('Your brother or sister');
  click(node('Fictional cousin'));
  panel().querySelector('button[value=approve]').click();
  await vi.waitFor(()=>expect(node('Fictional cousin').textContent).not.toContain('Edit awaiting approval'));
  expect(panel().textContent).toContain('Corrected story');
  document.querySelector('[data-approve-claim]').click();
  await vi.waitFor(()=>expect(status()).toBe('Link confirmed.'));
  click(node('Fictional cousin'));
  expect(panel().textContent).toContain('Linked to Member’s account');
  expect(document.querySelector('.tree-contributions').textContent).toContain('Checked the source');

  // Adding a parent of yourself applies at once and links you to them.
  click(node('Fictional owner'));
  expect(panel().textContent).toContain('About Fictional owner');
  click(panel().querySelector('[data-add=parent]'));
  form=document.querySelector('#person');
  expect(document.querySelector('#person-approval').textContent).toBe('This will be added to the tree straight away.');
  form.elements.name.value='Fictional second parent';form.elements.life_status.value='living';
  form.querySelector('button').click();
  await vi.waitFor(()=>expect(status()).toBe('Relative saved to your family tree.'));
  expect(api.rpc).toHaveBeenCalledWith('tree_action',expect.objectContaining({payload:expect.objectContaining({name:'Fictional second parent',parent_of:'owner-self'})}));
  expect(rows.people.find(p=>p.id==='owner-self').parents).toHaveLength(2);
  const filter=document.querySelector('#tree-branch');filter.value='South household';filter.dispatchEvent(new Event('change',{bubbles:true}));
  expect([...document.querySelectorAll('.tree-canvas .tree-node:not(.dimmed)')].map(n=>n.querySelector('strong').textContent)).toEqual(['Fictional memorial']);
});
