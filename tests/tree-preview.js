import {treeView} from '../tree-view.js';
const people=[
  {id:'ancestor',name:'Evelyn Bennett',parents:[],version:1,branch:'Shared roots',life_status:'deceased',birth_date:'1934-04-12',death_date:'2012-09-08',story:'A fictional grandmother who brought everyone together around the kitchen table.',source_note:'Fictional family recollection for layout testing.'},
  {id:'relative',name:'Jordan Bennett',parents:['ancestor'],version:1,branch:'Bennett household',life_status:'unknown',story:'Their story is waiting to be told.'},
];
const snapshot={people,memberships:[{user_id:'owner',display_name:'Fictional owner'},{user_id:'member',display_name:'Fictional member'}],contributions:[{id:'proposal',person_id:'ancestor',submitted_by:'member',base_version:1,before_record:people[0],proposed_record:{...people[0],story:'A fictional grandmother remembered for Sunday meals, garden walks, and handwritten birthday cards.',source_note:'A new fictional recollection.'},status:'pending',submitted_at:'2026-10-18T00:00:00Z'}]};
let owner=true,editing=null,branch='';
const root=document.querySelector('#fixture-tree');
const render=()=>{root.innerHTML=treeView(snapshot,editing,owner,owner?'owner':'member',branch);};
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='fixture-owner'||b.id==='fixture-member'){owner=b.id==='fixture-owner';editing=null;render();}
  if(b.dataset.edit){editing=people.find(p=>p.id===b.dataset.edit);render();document.querySelector('#person').scrollIntoView();}
  if(b.id==='cancel-edit'){editing=null;render();}
});
root.addEventListener('change',e=>{if(e.target.id==='tree-branch'){branch=e.target.value;render();}});
document.addEventListener('submit',e=>{e.preventDefault();document.querySelector('#status').textContent='Local visual fixture only. Nothing was saved.';});
render();
