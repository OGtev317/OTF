import {test,expect} from 'vitest';
import {treeView,approvalNote} from '../tree-view.js';
import {generations,layoutRows} from '../tree-layout.js';
test('stale and removed-contributor approvals disabled; rejection remains available; unsafe text escaped',()=>{
  const p={id:'p',name:'<script>bad</script>',story:'',parents:[],version:2};
  const c={id:'c',person_id:'p',submitted_by:'gone',base_version:1,before_record:{...p,version:1},proposed_record:{...p,story:'<img src=x onerror=alert(1)>'},status:'pending',submitted_at:'2026-10-18T00:00:00Z'};
  document.body.innerHTML=treeView({people:[p],memberships:[],contributions:[c]},null,true,'owner');
  expect(document.querySelector('button[value=approve]').disabled).toBe(true);
  expect(document.querySelector('button[value=reject]').disabled).toBe(false);
  expect(document.body.textContent).toContain('This record has changed');
  expect(document.body.textContent).toContain('no longer belongs');
  expect(document.querySelector('.tree-node.has-pending')).not.toBeNull();
  expect(document.querySelector('script,img')).toBeNull();
  document.body.innerHTML=treeView({people:[p],memberships:[],contributions:[]},null,true,'owner','',{adding:{mode:'free'}});
  expect(document.querySelector('#person [name=life_status]').value).toBe('unknown');
});
// A fictional family: two grandparents, their children and a partner who married in, grandchildren.
const person=(id,parents=[],extra={})=>({id,name:id,parents,partners:[],parent_kinds:{},version:1,life_status:'living',...extra});
const family=[person('Gran',[],{partners:['Grandpa'],life_status:'deceased',birth_date:'1930-05-01',death_date:'2000-05-01',source_note:'Fictional'}),person('Grandpa'),person('Mom',['Gran','Grandpa'],{partners:['Dad']}),person('Dad'),person('Uncle',['Gran','Grandpa']),person('Me',['Mom','Dad'],{birth_date:'2000-01-01'}),person('Cousin',['Uncle'])];
test('generations follow recorded links; partners and siblings sit together',()=>{
  const gen=generations(family);
  expect(['Gran','Grandpa','Mom','Dad','Uncle','Me','Cousin'].map(id=>gen.get(id))).toEqual([0,0,1,1,1,2,2]);
  const rows=layoutRows(family,gen).map(r=>r.map(p=>p.id));
  expect(rows[0]).toEqual(['Gran','Grandpa']);
  expect(rows[1].indexOf('Dad')-rows[1].indexOf('Mom')).toBe(1);
  expect(rows[2]).toHaveLength(2);
  // Someone who married in sits beside their partner, not with the eldest generation.
  expect(generations([person('A'),person('B',['A'],{partners:['C']}),person('C')]).get('C')).toBe(1);
});
test('labels generations from your place, dates in words, and says who must approve before saving',()=>{
  const memberships=[{user_id:'u-me',display_name:'Me',role:'member',person_id:'Me'},{user_id:'u-mom',display_name:'Mom',role:'member',person_id:'Mom'},{user_id:'u-owner',display_name:'Owner',role:'owner'}];
  document.body.innerHTML=treeView({people:family,memberships,contributions:[]},null,false,'u-me','',{selected:'Gran'});
  expect([...document.querySelectorAll('.tree-gen-label')].map(h=>h.textContent)).toEqual(['Your grandparents’ generation','Your parents’ generation','Your generation']);
  const gran=document.querySelector('.tree-canvas [data-node=Gran]');
  expect(gran.getAttribute('aria-label')).toBe('Gran, your grandparent, 1930–2000');
  expect(gran.classList.contains('selected')).toBe(true);
  expect(document.querySelector('.tree-canvas [data-node=Mom]').classList.contains('near')).toBe(true);
  expect(document.querySelector('#tree-panel').textContent).toContain('aged 70');
  expect(document.querySelector('#tree-panel').textContent).toContain('Kept by immediate family: Mom');
  expect(document.querySelector('#tree-panel [data-edit]').textContent).toBe('Suggest an edit');
  // A new child of the memorial goes to her keeper; a living relative of your own is added at once.
  expect(approvalNote({people:family,memberships},'u-me',false,null,{parents:['Gran'],life_status:'living'})).toBe('This will be sent to Mom for approval. The tree stays as it is until then.');
  expect(approvalNote({people:family,memberships},'u-me',false,null,{parents:[],life_status:'living'})).toBe('This will be added to the tree straight away.');
  expect(approvalNote({people:family,memberships},'u-me',false,null,{parents:[],life_status:'living'},'Me')).toBe('This will be added to the tree straight away.');
  // Adding a parent offers no one who would make a loop.
  document.body.innerHTML=treeView({people:family,memberships,contributions:[]},null,false,'u-me','',{selected:'Mom',adding:{mode:'parent',of:'Mom'}});
  expect(document.querySelector('#person h3').textContent).toBe('Add a parent of Mom');
  expect(document.querySelector('#person [name=parent_of]').value).toBe('Mom');
  const offered=[...document.querySelectorAll('#person [name=parents]')].map(i=>i.value);
  expect(offered).not.toContain('Me');expect(offered).not.toContain('Mom');expect(offered).toContain('Gran');
  // On phones, the focus view shows the selected person's close family.
  document.body.innerHTML=treeView({people:family,memberships,contributions:[]},null,false,'u-me','',{selected:'Mom'});
  const groups=Object.fromEntries([...document.querySelectorAll('.focus-group')].map(g=>[g.querySelector('h3').textContent,[...g.querySelectorAll('.tree-node')].map(n=>n.dataset.select)]));
  expect(groups).toEqual({Parents:['Gran','Grandpa'],Mom:['Mom','Dad'],'Brothers and sisters':['Uncle'],Children:['Me']});
});
