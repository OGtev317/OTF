import { test,expect,vi } from 'vitest';
import { query } from './supabase-mock.js';
import { mayApply } from '../kinship.js';
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
api.from.mockImplementation(table=>query(()=>table==='tree_contributions'&&!owns()?rows[table].filter(c=>c.submitted_by===fixture.user):rows[table]));
api.rpc.mockImplementation(async(name,{action,payload}={})=>{
  if(fixture.error)return {error:{message:fixture.error}};
  if(name==='list_invitations')return {data:[]};
  const me=rows.memberships.find(m=>m.user_id===fixture.user);
  if(action==='save'){
    const old=rows.people.find(p=>p.id===payload.id), id=old?.id||`person-${++fixture.next}`;
    const record={parents:[],partners:[],parent_kinds:{},...old,...payload,id,version:(old?.version||0)+1};
    if(mayApply(rows,fixture.user,owns(),id,old,record)){rows.people=[...rows.people.filter(p=>p.id!==id),record];return {data:id};}
    const proposal={id:`proposal-${++fixture.next}`,person_id:old?.id||null,submitted_by:fixture.user,base_version:old?.version||0,before_record:old||{},proposed_record:{...record,id},status:'pending',submitted_at:'2026-10-18T00:00:00Z'};
    rows.tree_contributions.push(proposal);return {data:proposal.id};
  }
  if(action==='claim'){me.claim_person_id=payload.person_id;return {data:payload.person_id};}
  if(action==='approve_claim'){const m=rows.memberships.find(m=>m.user_id===payload.user_id);m.person_id=m.claim_person_id;m.claim_person_id=null;return {data:m.person_id};}
  const c=rows.tree_contributions.find(c=>c.id===payload.id);
  c.status=action==='approve'?'approved':action==='reject'?'rejected':'withdrawn';c.review_note=payload.note;
  if(action==='approve'){const {id}=c.proposed_record;rows.people=[...rows.people.filter(p=>p.id!==id),{...c.proposed_record,version:(c.base_version||0)+1}];}
  return {data:c.id};
});
const status=()=>document.querySelector('#status').textContent;
const card=name=>[...document.querySelectorAll('.relative')].find(c=>c.querySelector('h2').textContent===name);
async function as(user){fixture.user=user;fixture.callback('SIGNED_IN',{user:{id:user}});document.querySelector('#refresh').click();await vi.waitFor(()=>expect(status()).toBe('Up to date.'));}
test('memorials are kept by immediate family; others propose; claims are confirmed; drafts survive failures and refresh',async()=>{
  Element.prototype.scrollIntoView=vi.fn();
  globalThis.confirm=()=>true;
  document.body.innerHTML='<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
  await vi.waitFor(()=>expect(document.querySelector('[data-view=tree]')).not.toBeNull());
  document.querySelector('[data-view=tree]').click();
  expect(card('Fictional ancestor').textContent).toContain('Kept by immediate family: Owner');
  expect(card('Fictional ancestor').querySelector('[data-edit]').textContent).toBe('Suggest an edit');
  expect(card('Fictional owner').textContent).toContain('Linked to Owner’s account');
  expect(card('Fictional owner').querySelector('[data-claim]')).toBeNull();
  expect(document.querySelector('#person [name=relation_to_me]')).toBeNull();

  // A member who is not immediate family adds a memorial child of the ancestor: it is sent for approval.
  let form=document.querySelector('#person');
  form.elements.name.value='Fictional memorial';form.elements.branch.value='South household';
  form.elements.life_status.value='deceased';form.elements.birth_date.value='1950-01-01';form.elements.death_date.value='2020-01-01';
  form.elements.story.value='<img src=x> A remembered story';form.elements.source_note.value='Fictional notes';
  form.querySelector('[name=parents][value=parent-a]').checked=true;form.querySelector('[name="kind:parent-a"]').value='adoptive';
  fixture.error='Family access denied';form.querySelector('button').click();
  await vi.waitFor(()=>expect(status()).toBe('Family access denied'));
  expect(form.elements.name.value).toBe('Fictional memorial');
  fixture.error=null;
  document.querySelector('#refresh').click();
  await vi.waitFor(()=>expect(status()).toBe('Up to date.'));
  form=document.querySelector('#person');
  expect(form.elements.life_status.value).toBe('deceased');expect(form.querySelector('[name=parents][value=parent-a]').checked).toBe(true);
  expect(form.querySelector('[name="kind:parent-a"]').value).toBe('adoptive');
  form.querySelector('button').click();
  await vi.waitFor(()=>expect(status()).toContain('Sent for approval'));
  expect(api.rpc).toHaveBeenCalledWith('tree_action',expect.objectContaining({action:'save',payload:expect.objectContaining({name:'Fictional memorial',parents:['parent-a'],parent_kinds:{'parent-a':'adoptive'},life_status:'deceased'})}));
  expect(document.querySelectorAll('.relative').length).toBe(2);
  expect(document.querySelector('.tree-review h3').textContent).toBe('New relative: Fictional memorial');
  expect(document.querySelector('.tree-review').textContent).toContain('Can be approved by Owner');
  expect(document.querySelector('#person [name=name]').value).toBe('');

  // A living relative is added straight away; editing them is a proposal for the owner.
  form=document.querySelector('#person');form.elements.name.value='Fictional cousin';form.elements.life_status.value='living';
  form.querySelector('button').click();
  await vi.waitFor(()=>expect(status()).toBe('Relative saved to your family tree.'));
  card('Fictional cousin').querySelector('[data-edit]').click();
  form=document.querySelector('#person');
  expect(form.querySelector('button').textContent).toBe('Submit edit for approval');
  form.elements.story.value='Corrected story';
  form.elements.source_note.value='Draft source';
  document.querySelector('#refresh').click();
  await vi.waitFor(()=>expect(status()).toBe('Up to date.'));
  expect(document.querySelector('#person [name=story]').value).toBe('Corrected story');
  document.querySelector('#person button').click();
  await vi.waitFor(()=>expect(status()).toContain('Edit submitted for approval'));
  expect(card('Fictional cousin').textContent).not.toContain('Corrected story');
  expect(document.querySelector('form[data-tree-review]')).toBeNull();
  expect(document.querySelectorAll('[data-withdraw]').length).toBe(2);

  // The member says which person they are; it waits for an owner.
  card('Fictional cousin').querySelector('[data-claim]').click();
  await vi.waitFor(()=>expect(status()).toBe('Sent to a family owner to confirm.'));
  expect(document.querySelector('#you').textContent).toContain('Waiting for a family owner to confirm that you are Fictional cousin');
  expect(document.querySelector('[data-claim]')).toBeNull();

  // The owner keeps the memorial, approves both proposals and confirms who the member is.
  await as('owner');
  expect(document.querySelector('#you').textContent).toContain('You are Fictional owner');
  expect(card('Fictional ancestor').textContent).toContain('Your parent');
  expect(card('Fictional ancestor').querySelector('[data-edit]').textContent).toBe('Edit record');
  expect(document.querySelector('.tree-comparison').textContent).toContain('Proposed');
  for(const review of document.querySelectorAll('form[data-tree-review]')) review.querySelector('[name=note]').value='Checked the source';
  document.querySelector('button[value=approve]').click();
  await vi.waitFor(()=>expect(status()).toContain('Edit approved'));
  document.querySelector('button[value=approve]').click();
  await vi.waitFor(()=>expect(document.querySelector('button[value=approve]')).toBeNull());
  expect(card('Fictional memorial').textContent).toContain('Child of Fictional ancestor (adoptive)');
  expect(card('Fictional memorial').textContent).toContain('Your brother or sister');
  expect(card('Fictional memorial').querySelector('img')).toBeNull();
  expect(card('Fictional cousin').textContent).toContain('Corrected story');
  expect(document.querySelector('.tree-contributions').textContent).toContain('Checked the source');
  expect(document.querySelector('[data-approve-claim]').getAttribute('aria-label')).toBe('Confirm Member is Fictional cousin');
  document.querySelector('[data-approve-claim]').click();
  await vi.waitFor(()=>expect(status()).toBe('Link confirmed.'));
  expect(card('Fictional cousin').textContent).toContain('Linked to Member’s account');
  expect(card('Fictional owner').textContent).toContain('About Fictional owner');
  const filter=document.querySelector('#tree-branch');filter.value='South household';filter.dispatchEvent(new Event('change',{bubbles:true}));
  expect(document.querySelectorAll('.relative').length).toBe(1);
  expect(document.querySelector('.relative h2').textContent).toBe('Fictional memorial');
});
