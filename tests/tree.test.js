import { test,expect,vi } from 'vitest';
const fixture=vi.hoisted(()=>({
  user:'member',error:null,callback:null,
  rows:{families:[{id:'family-a',name:'Fictional extended family'}],memberships:[{user_id:'owner',display_name:'Owner',role:'owner'},{user_id:'member',display_name:'Member',role:'member'}],posts:[],comments:[],reactions:[],events:[],people:[{id:'parent-a',name:'Fictional ancestor',story:'Original story',parents:[],version:1,branch:'North household',life_status:'deceased',birth_date:'1930-01-01',death_date:'2000-01-01',source_note:'Fictional source'}],tree_contributions:[]},
}));
const api=vi.hoisted(()=>({
  auth:{getSession:vi.fn(async()=>({data:{session:{user:{id:fixture.user}}}})),onAuthStateChange:vi.fn(fn=>{fixture.callback=fn;})},
  from:vi.fn(table=>({select:()=>({order:async()=>({data:fixture.rows[table]}),eq:async()=>({data:structuredClone(table==='tree_contributions'&&fixture.user!=='owner'?fixture.rows[table].filter(c=>c.submitted_by===fixture.user):fixture.rows[table])})})})),
  rpc:vi.fn(async(name,{action,payload}={})=>{
    if(fixture.error)return {error:{message:fixture.error}};
    if(name==='list_invitations')return {data:[]};
    if(name==='tree_action'){
      if(action==='save'&&!payload.id) fixture.rows.people.push({...payload,id:'new-relative',version:1});
      else if(action==='save'){
        const person=fixture.rows.people.find(p=>p.id===payload.id);
        fixture.rows.tree_contributions.push({id:'proposal-a',person_id:person.id,submitted_by:fixture.user,base_version:person.version,before_record:structuredClone(person),proposed_record:{...person,...payload},status:'pending',submitted_at:'2026-10-18T00:00:00Z'});
      }else{
        const c=fixture.rows.tree_contributions.find(c=>c.id===payload.id);
        c.status=action==='approve'?'approved':action==='reject'?'rejected':'withdrawn';c.review_note=payload.note;
        if(action==='approve')fixture.rows.people=fixture.rows.people.map(p=>p.id===c.person_id?{...p,...c.proposed_record,version:p.version+1}:p);
      }
    }
    return {data:'saved-id'};
  }),
}));
vi.mock('../supabase-client.js',()=>({configured:true,supabase:api}));
test('member adds memorial immediately, submits edit, owner compares and approves; drafts survive failures and refresh',async()=>{
  Element.prototype.scrollIntoView=vi.fn();
  document.body.innerHTML='<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
  await vi.waitFor(()=>expect(document.querySelector('[data-view=tree]')).not.toBeNull());
  document.querySelector('[data-view=tree]').click();
  expect(document.querySelector('#person')).not.toBeNull();
  expect(document.querySelector('[data-edit]')?.textContent).toBe('Suggest an edit');
  let form=document.querySelector('#person');
  form.elements.name.value='Fictional memorial';form.elements.branch.value='South household';
  form.elements.life_status.value='deceased';form.elements.birth_date.value='1950-01-01';form.elements.death_date.value='2020-01-01';
  form.elements.story.value='<img src=x> A remembered story';form.elements.source_note.value='Fictional notes';form.querySelector('[name=parents]').checked=true;
  fixture.error='Family access denied';form.querySelector('button').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toBe('Family access denied'));
  expect(form.elements.name.value).toBe('Fictional memorial');
  fixture.error=null;
  document.querySelector('#refresh').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toBe('Up to date.'));
  form=document.querySelector('#person');
  expect(form.elements.life_status.value).toBe('deceased');expect(form.querySelector('[name=parents]').checked).toBe(true);
  form.querySelector('button').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toBe('Relative saved to your family tree.'));
  expect(document.querySelectorAll('.relative').length).toBe(2);
  expect(document.querySelectorAll('.relative img').length).toBe(0);
  expect(document.querySelector('#person [name=name]').value).toBe('');
  expect(api.rpc).toHaveBeenCalledWith('tree_action',expect.objectContaining({action:'save',payload:expect.objectContaining({name:'Fictional memorial',parents:['parent-a'],life_status:'deceased'})}));
  document.querySelector('[data-edit="new-relative"]').click();
  form=document.querySelector('#person');
  expect(form.querySelector('button').textContent).toBe('Submit edit for approval');
  form.elements.story.value='Corrected story';
  // Clearing a field also survives a refresh, without replacing it with the stored value.
  form.elements.source_note.value='';
  document.querySelector('#refresh').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toBe('Up to date.'));
  expect(document.querySelector('#person [name=source_note]').value).toBe('');
  document.querySelector('#person button').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toContain('submitted for owner approval'));
  expect(document.querySelectorAll('.relative')[1].textContent).toContain('A remembered story');
  expect(document.querySelectorAll('.relative')[1].textContent).not.toContain('Corrected story');
  expect(document.querySelector('.tree-review').textContent).toContain('Corrected story');
  expect(document.querySelector('form[data-tree-review]')).toBeNull();
  expect(document.querySelector('[data-withdraw]')).not.toBeNull();
  fixture.user='owner';fixture.callback('SIGNED_IN',{user:{id:'owner'}});
  document.querySelector('#refresh').click();
  await vi.waitFor(()=>expect(document.querySelector('form[data-tree-review]')).not.toBeNull());
  expect(document.querySelector('.tree-comparison').textContent).toContain('Original');
  expect(document.querySelector('.tree-comparison').textContent).toContain('Proposed');
  document.querySelector('form[data-tree-review] [name=note]').value='Checked the source';
  document.querySelector('button[value=approve]').click();
  await vi.waitFor(()=>expect(document.querySelector('#status').textContent).toContain('Edit approved'));
  expect(document.querySelectorAll('.relative')[1].textContent).toContain('Corrected story');
  expect(document.querySelector('button[value=approve]')).toBeNull();
  expect(document.querySelector('.tree-contributions').textContent).toContain('Checked the source');
  const filter=document.querySelector('#tree-branch');filter.value='South household';filter.dispatchEvent(new Event('change',{bubbles:true}));
  expect(document.querySelectorAll('.relative').length).toBe(1);
  expect(document.querySelector('.relative').textContent).toContain('Fictional memorial');
});
