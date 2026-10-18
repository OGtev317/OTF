import { descendantsOf, immediateFamily, keepersOf, mayAdd, mayApply, partnersOf, relationTo } from './kinship.js';
import { generations, layoutRows } from './tree-layout.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ids = list => list || [];
const fields = {name:'Name',branch:'Household branch',life_status:'Life status',birth_date:'Birth date',death_date:'Death date',story:'Story',source_note:'Source / family recollection',parents:'Parents',parent_kinds:'Kind of parent',partners:'Partners'};
const kinds = {biological:'Biological',adoptive:'Adoptive',step:'Step',guardian:'Guardian',unspecified:'Not specified'};
const names = (list,people) => ids(list).map(id=>people.find(p=>p.id===id)?.name || 'Unknown relative');
function value(key,record,people) {
  if(key === 'parents' || key === 'partners') return names(record[key],people).join(', ') || 'Not recorded';
  if(key === 'parent_kinds') return Object.entries(record.parent_kinds || {}).map(([id,k])=>`${names([id],people)[0]}: ${kinds[k] || k}`).join(', ') || 'Not specified';
  return record[key] || (key === 'life_status' ? 'unknown' : 'Not recorded');
}
const list = items => items.length < 3 ? items.join(' & ') : `${items.slice(0,-1).join(', ')} & ${items.at(-1)}`;

// Dates are stored as YYYY-MM-DD; show them in words and work out ages without time zones.
const parts = d => d.split('-').map(Number);
const longDate = d => { const [y,m,day]=parts(d); return new Date(y,m-1,day).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}); };
function ageAt(born, until) {
  const [by,bm,bd]=parts(born), now=new Date(), [uy,um,ud]=until ? parts(until) : [now.getFullYear(),now.getMonth()+1,now.getDate()];
  return uy-by-(um<bm || (um===bm && ud<bd) ? 1 : 0);
}
function years(p) {
  if(p.life_status==='deceased') return p.birth_date || p.death_date ? `${p.birth_date?.slice(0,4) || '?'}–${p.death_date?.slice(0,4) || '?'}` : 'In loving memory';
  if(p.birth_date) return p.life_status==='living' ? `Born ${p.birth_date.slice(0,4)} · age ${ageAt(p.birth_date)}` : `Born ${p.birth_date.slice(0,4)}`;
  return p.life_status==='living' ? 'Living' : '';
}
function lifeLine(p) {
  const out=[];
  if(p.birth_date) out.push(`Born ${longDate(p.birth_date)}`);
  if(p.death_date) out.push(`Died ${longDate(p.death_date)}${p.birth_date ? `, aged ${ageAt(p.birth_date,p.death_date)}` : ''}`);
  else if(p.birth_date && p.life_status==='living') out.push(`Age ${ageAt(p.birth_date)}`);
  return out.join(' · ');
}
function generationLabel(g, mine) {
  if(mine === undefined) return g === 0 ? 'Eldest recorded generation' : `Generation ${g+1}`;
  const d=g-mine;
  return {[-3]:'Your great-grandparents’ generation',[-2]:'Your grandparents’ generation',[-1]:'Your parents’ generation',0:'Your generation',1:'Your children’s generation',2:'Your grandchildren’s generation'}[d] || (d<0 ? `${-d} generations above you` : `${d} generations below you`);
}

const childOf = c => c.proposed_record.child_of || c.proposed_record.child_of_submitter || '';
/** Whether `user` could approve proposal `c` (the database checks again). */
export function canReview(snap, user, isOwner, c) {
  if(user===c.submitted_by) return false;
  if(c.person_id) return mayApply(snap,user,isOwner,c.person_id,snap.people.find(p=>p.id===c.person_id),c.proposed_record,'',c.submitted_by);
  return mayAdd(snap,user,isOwner,c.proposed_record.id,c.proposed_record,childOf(c),c.submitted_by);
}

/** Says, before saving, whether a change applies straight away or who must approve it. */
export function approvalNote(snap, userId, isOwner, editing, record, child='') {
  const target=editing?.id || 'new-person';
  const can=(user,owner,consent='')=>editing ? mayApply(snap,user,owner,target,editing,record,'',consent) : mayAdd(snap,user,owner,target,record,child,consent);
  if(can(userId,isOwner)) return editing ? 'You can save this change directly.' : 'This will be added to the tree straight away.';
  const who=snap.memberships.filter(m=>m.user_id!==userId && can(m.user_id,m.role==='owner',userId)).map(m=>m.display_name);
  return who.length ? `This will be sent to ${list(who)} for approval. The tree stays as it is until then.` : 'This will wait for approval: nobody who can approve it has linked their account to the tree yet.';
}

/**
 * The Family tree tab: generations of connected cards (focus view on phones), a panel for the
 * selected person with relationship-based additions, and pending proposals shown in place.
 * `ui` holds the selected person, the addition in progress ({mode, of}) and the search text.
 */
export function treeView({people,contributions=[],memberships=[],life_profiles=[]},editing,isOwner,userId,branch='',ui={}) {
  const snap={people,memberships};
  const mine=memberships.find(m=>m.user_id===userId), me=mine?.person_id || '', claim=mine?.claim_person_id || '';
  const account=id=>memberships.find(m=>m.person_id===id);
  const pending=contributions.filter(c=>c.status==='pending');
  // Pending new relatives appear in place, linked to the child they were proposed for.
  const ghosts=pending.filter(c=>!c.person_id).map(c=>({...c.proposed_record,id:c.proposed_record.id,ghost:c.id,version:0}));
  const all=[...people.map(p=>({...p,parents:[...ids(p.parents),...ghosts.filter(g=>childOf(pending.find(c=>c.id===g.ghost))===p.id).map(g=>g.id)]})),...ghosts];
  const byId=id=>all.find(p=>p.id===id);
  const gen=generations(all), rows=layoutRows(all,gen);
  const selectedId=ui.selected && byId(ui.selected) ? ui.selected : me && byId(me) ? me : rows[0]?.[0]?.id || '';
  const sel=byId(selectedId);
  const near=new Set(sel ? immediateFamily(all,sel.id,sel) : []);
  const editsFor=id=>pending.filter(c=>c.person_id===id);
  const direct=person=>mayApply(snap,userId,isOwner,person.id,person,person);
  const query=(ui.query || '').trim().toLowerCase();
  const dim=p=>(query && !p.name.toLowerCase().includes(query)) || (branch && p.branch!==branch);
  const relation=id=>me ? relationTo(all,me,id) : '';

  const reviewCard=c=>{
    const current=c.person_id ? people.find(p=>p.id===c.person_id) : undefined;
    const stale=Boolean(c.person_id) && current?.version!==c.base_version;
    const removed=!memberships.some(m=>m.user_id===c.submitted_by);
    const submitter=memberships.find(m=>m.user_id===c.submitted_by)?.display_name || 'Former family member';
    const canApprove=canReview(snap,userId,isOwner,c);
    const approvers=memberships.filter(m=>canReview(snap,m.user_id,m.role==='owner',c)).map(m=>m.user_id===userId ? 'you' : m.display_name);
    const waiting=approvers.length ? `Can be approved by ${esc(list(approvers))}.` : 'Nobody who can approve this has linked their account to the tree yet, so it stays pending. A family owner can decline it.';
    const child=childOf(c) && people.find(p=>p.id===childOf(c));
    return `<article class="card tree-review"><h4>${c.person_id ? 'Changes to ' : 'New relative: '}${esc(c.proposed_record.name)}</h4><p>${esc(submitter)} · ${esc(c.status)} · ${esc(new Date(c.submitted_at).toLocaleString())}</p>${child ? `<p>Proposed as a parent of ${esc(child.name)}.</p>` : ''}${c.status==='pending' ? `<p class="kin-note">${waiting}</p>` : ''}<details><summary>${c.person_id ? 'Compare original and proposed record' : 'See the proposed record'}</summary><div class="tree-comparison"><table><caption>Changes proposed at submission</caption><thead><tr><th>Field</th><th>Original</th><th>Proposed</th></tr></thead><tbody>${Object.keys(fields).filter(key=>JSON.stringify(c.before_record[key] ?? '')!==JSON.stringify(c.proposed_record[key] ?? '')).map(key=>`<tr><th scope="row">${fields[key]}</th><td>${esc(value(key,c.before_record,people))}</td><td>${esc(value(key,c.proposed_record,people))}</td></tr>`).join('') || '<tr><td colspan="3">No editable fields changed.</td></tr>'}</tbody></table></div></details>${c.status==='pending' ? `${stale ? '<p class="tree-warning">This record has changed. Reject or withdraw this proposal and submit a fresh edit.</p>' : ''}${removed ? '<p class="tree-warning">This contributor no longer belongs to the family. Their proposal cannot be approved.</p>' : ''}${canApprove || isOwner ? `<form class="stack tree-review-form" data-tree-review="${c.id}"><label>Review note (optional)<input name="note" maxlength="500"></label><div class="tree-actions">${canApprove ? `<button name="decision" value="approve" ${stale || removed ? 'disabled' : ''}>Approve</button>` : ''}<button class="quiet" name="decision" value="reject">Decline</button></div></form>` : ''}${c.submitted_by===userId ? `<button class="quiet" data-withdraw="${c.id}">Withdraw my proposal</button>` : ''}` : `<p>${esc(c.review_note)}</p>`}</article>`;
  };

  const node=(p,variant='')=>{
    const rel=relation(p.id), when=years(p);
    const cls=['tree-node',variant,p.id===selectedId && 'selected',near.has(p.id) && 'near',p.ghost && 'ghost',p.life_status==='deceased' && 'memorial',p.id===me && 'you',editsFor(p.id).length && 'has-pending',dim(p) && 'dimmed'].filter(Boolean).join(' ');
    const label=`${p.name}${p.id===me ? ', you' : rel ? `, your ${rel}` : ''}${when ? `, ${when}` : ''}${p.ghost ? ', awaiting approval' : editsFor(p.id).length ? ', edit awaiting approval' : ''}`;
    const wiring=variant ? '' : ` data-node="${esc(p.id)}" data-parents="${esc(ids(p.parents).join(' '))}" data-partners="${esc(partnersOf(all,p.id).join(' '))}"${p.ghost ? ' data-ghost="1"' : ''}`;
    return `<button type="button" class="${cls}" data-select="${esc(p.id)}"${wiring}${p.id===selectedId ? ' aria-current="true"' : ''} aria-label="${esc(label)}"><strong>${esc(p.name)}</strong>${p.id===me ? '<small class="kin-label">You</small>' : rel ? `<small class="kin-label">Your ${esc(rel)}</small>` : ''}${when ? `<small>${esc(when)}</small>` : ''}${p.ghost ? '<small class="tree-flag">Awaiting approval</small>' : editsFor(p.id).length ? '<small class="tree-flag">Edit awaiting approval</small>' : ''}</button>`;
  };
  const myGen=me && gen.has(me) ? gen.get(me) : undefined;
  const canvas=`<p class="tree-scroll-hint kin-note" hidden>Some generations are wider than the screen: scroll sideways to see everyone.</p><div class="tree-canvas" role="group" aria-label="Family tree by generation"><svg class="tree-lines" aria-hidden="true" focusable="false"></svg>${rows.map(row=>{const label=generationLabel(gen.get(row[0].id),myGen);return `<section class="tree-gen" aria-label="${esc(label)}"><h3 class="tree-gen-label">${esc(label)}</h3><div class="tree-row">${row.map(p=>node(p)).join('')}</div></section>`;}).join('')}</div>`;

  const group=(title,members,empty,extra='')=>`<div class="focus-group ${extra}"><h3>${title}</h3><div class="focus-row">${members.map(p=>node(p,'tree-mini')).join('') || `<p class="kin-note">${empty}</p>`}</div></div>`;
  const focus=sel ? `<div class="tree-focus" role="group" aria-label="Close family of ${esc(sel.name)}">${group('Parents',ids(sel.parents).map(byId).filter(Boolean),'Not recorded')}${group(esc(sel.name),[sel,...partnersOf(all,sel.id).map(byId).filter(Boolean)],'','focus-center')}${group('Brothers and sisters',all.filter(p=>p.id!==sel.id && ids(p.parents).some(x=>ids(sel.parents).includes(x))),'None recorded')}${group('Children',all.filter(p=>ids(p.parents).includes(sel.id)),'None recorded')}<details class="focus-all"><summary>Everyone in the tree (${all.length})</summary>${rows.map(row=>`<h4>${esc(generationLabel(gen.get(row[0].id),myGen))}</h4><div class="focus-row">${row.map(p=>node(p,'tree-mini')).join('')}</div>`).join('')}</details></div>` : '';

  const relLinks=list2=>list2.map(p=>`<button type="button" class="tree-link" data-select="${esc(p.id)}">${esc(p.name)}${p.kind ? ` (${esc(kinds[p.kind].toLowerCase())})` : ''}${p.ghost ? ' (awaiting approval)' : ''}</button>`).join(', ');
  const panelFor=p=>{
    const linked=account(p.id), rel=relation(p.id);
    const parents=ids(p.parents).map(id=>({...byId(id),kind:p.parent_kinds?.[id]})).filter(x=>x.id);
    const mates=partnersOf(all,p.id).map(byId).filter(Boolean);
    const kids=all.filter(x=>ids(x.parents).includes(p.id));
    const sibs=all.filter(x=>x.id!==p.id && ids(x.parents).some(y=>ids(p.parents).includes(y)));
    const keepers=p.life_status==='deceased' ? keepersOf(people,memberships,p.id).map(m=>m.user_id===userId ? 'you' : m.display_name) : [];
    const profile=linked && life_profiles.find(x=>x.user_id===linked.user_id && (x.about || x.work || x.share));
    const canClaim=!me && !claim && !linked && p.life_status!=='deceased';
    const can=direct(p);
    return `<span class="eyebrow">${esc(p.branch || 'SHARED ROOTS')}</span><h3 id="tree-panel-name">${esc(p.name)}</h3>${p.id===me ? '<p class="kin-label">This is you</p>' : rel ? `<p class="kin-label">Your ${esc(rel)}</p>` : ''}<span class="memorial-label">${p.life_status==='deceased' ? 'In loving memory' : p.life_status==='living' ? 'Living' : 'Life status not recorded'}</span>${lifeLine(p) ? `<p class="life-dates">${esc(lifeLine(p))}</p>` : ''}${linked && linked.user_id!==userId ? `<small class="kin-account">Linked to ${esc(linked.display_name)}’s account</small>` : ''}<p class="post-body">${esc(p.story) || 'Their story is waiting to be told.'}</p><dl class="tree-relations"><dt>Parents</dt><dd>${relLinks(parents) || 'Not recorded'}</dd>${mates.length ? `<dt>Partners</dt><dd>${relLinks(mates)}</dd>` : ''}${kids.length ? `<dt>Children</dt><dd>${relLinks(kids)}</dd>` : ''}${sibs.length ? `<dt>Brothers and sisters</dt><dd>${relLinks(sibs)}</dd>` : ''}</dl>${p.life_status==='deceased' ? `<p class="kin-note">${keepers.length ? `Kept by immediate family: ${esc(list(keepers))}` : 'No immediate relative has linked their account yet. Changes wait for one of them.'}</p>` : ''}${p.source_note ? `<details><summary>Source / family recollection</summary><p class="post-body">${esc(p.source_note)}</p><small>As given by the family. Roots does not verify sources.</small></details>` : ''}${profile ? `<details><summary>About ${esc(p.name)}</summary>${profile.about ? `<p class="post-body">${esc(profile.about)}</p>` : ''}${profile.work ? `<p><strong>Work:</strong> ${esc(profile.work)}</p>` : ''}${profile.share ? `<p><strong>For the family:</strong> ${esc(profile.share)}</p>` : ''}</details>` : ''}${editsFor(p.id).map(reviewCard).join('')}<div class="tree-actions"><button class="quiet" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">${can ? 'Edit record' : 'Suggest an edit'}</button>${ids(p.parents).length < 8 ? `<button class="quiet" data-add="parent" data-of="${esc(p.id)}">Add parent</button>` : ''}<button class="quiet" data-add="child" data-of="${esc(p.id)}">Add child</button><button class="quiet" data-add="partner" data-of="${esc(p.id)}">Add partner</button>${canClaim ? `<button class="quiet" data-claim="${esc(p.id)}" aria-label="This is me: ${esc(p.name)}">This is me</button>` : ''}</div>${can ? '' : '<p class="kin-note">Your changes to this record are sent for approval; the form says to whom.</p>'}`;
  };

  const adding=ui.adding;
  const formFor=()=>{
    if(!editing && !adding) return '';
    const of=adding?.of ? people.find(p=>p.id===adding.of) : null, mode=of ? adding.mode : 'free';
    const p=editing || {name:'',story:'',parents:mode==='child' ? [of.id] : [],partners:mode==='partner' ? [of.id] : [],parent_kinds:{},life_status:'unknown'};
    const child=mode==='parent' ? of.id : '';
    const editDirect=editing ? direct(editing) : true;
    // Offer only parents that cannot create a loop.
    const blocked=editing ? descendantsOf(people,editing.id) : child ? new Set([child,...descendantsOf(people,child)]) : new Set();
    const choices=people.filter(x=>x.id!==p.id && !blocked.has(x.id)).sort((a,b)=>a.name.localeCompare(b.name));
    const checks=(field,chosen)=>choices.map(x=>`<label class="check"><input name="${field}" type="checkbox" value="${x.id}" ${chosen.includes(x.id)?'checked':''}>${esc(x.name)}${field==='parents' ? `<select name="kind:${x.id}" aria-label="How ${esc(x.name)} is their parent">${Object.entries(kinds).map(([k,label])=>`<option value="${k}" ${(p.parent_kinds?.[x.id] || 'unspecified')===k?'selected':''}>${label}</option>`).join('')}</select>` : ''}</label>`).join('') || '<small>No one else in the tree yet.</small>';
    const title=editing ? `${editDirect ? 'Edit' : 'Suggest changes to'} ${editing.name}` : of ? `Add a ${mode} of ${of.name}` : 'Add a relative';
    return `<form id="person" class="stack tree-form" data-person="${esc(editing ? editing.id : `new-${mode}-${of?.id || ''}`)}"><h3>${esc(title)}</h3>${child ? `<input type="hidden" name="parent_of" value="${esc(child)}">` : ''}<p class="kin-note" id="person-approval" aria-live="polite">${esc(approvalNote(snap,userId,isOwner,editing,p,child))}</p><label>Full name<input name="name" required maxlength="100" value="${esc(p.name)}"></label>${!editing && !of && me ? `<label>Their relationship to you<select name="relation_to_me"><option value="">Not immediate family, or not sure</option><option value="parent">They are my parent</option><option value="child">They are my child</option><option value="sibling">They are my brother or sister</option><option value="partner">They are my partner</option></select></label>` : ''}<label>Household branch (optional)<input name="branch" maxlength="100" list="tree-branches" value="${esc(p.branch)}" placeholder="For example, the Bennett household"></label><datalist id="tree-branches">${[...new Set(people.map(x=>x.branch).filter(Boolean))].map(b=>`<option value="${esc(b)}"></option>`).join('')}</datalist><label>Life status<select name="life_status"><option value="unknown" ${!p.life_status || p.life_status==='unknown'?'selected':''}>Not recorded / unknown</option><option value="living" ${p.life_status==='living'?'selected':''}>Living</option><option value="deceased" ${p.life_status==='deceased'?'selected':''}>Deceased — memorial record</option></select></label><div class="tree-date-fields"><label>Birth date (optional)<input type="date" name="birth_date" value="${esc(p.birth_date)}"></label><label>Death date (optional)<input type="date" name="death_date" value="${esc(p.death_date)}"></label></div><small>Leave unknown dates blank. A death date requires deceased status. For approximate dates, explain what is known in the story.</small><label>Their story<textarea name="story" maxlength="2000">${esc(p.story)}</textarea></label><label>Source or family recollection (required for memorial records)<textarea name="source_note" maxlength="1000" placeholder="Where did this information come from? For example: birth certificate, funeral program, Grandma’s recollection. Note uncertainty or conflicting recollections.">${esc(p.source_note)}</textarea></label><details class="kin-more" ${editing || mode==='free' ? 'open' : ''}><summary>Parents and partners</summary>${choices.length > 8 ? '<label>Find someone in these lists<input id="relative-filter" type="search" autocomplete="off"></label>' : ''}<fieldset class="kin-list"><legend>Known parents</legend><small>Leave blank if unknown. Step and guardian links are shown but do not make further relatives: a stepparent’s sister is not counted as an aunt.</small>${checks('parents',ids(p.parents))}</fieldset><fieldset class="kin-list"><legend>Partners</legend><small>Spouses and partners, past or present. A partner linked on either record is shown on both.</small>${checks('partners',ids(p.partners))}</fieldset></details><div class="tree-actions"><button>${editing && !editDirect ? 'Submit edit for approval' : 'Save relative'}</button><button type="button" class="quiet" id="cancel-edit">Cancel</button></div><small>Do not add private information about living people without their permission.</small></form>`;
  };

  const ghostCard=g=>{const c=pending.find(x=>x.id===g.ghost);return `<span class="eyebrow">AWAITING APPROVAL</span><h3 id="tree-panel-name">${esc(g.name)}</h3><p class="kin-note">Proposed by ${esc(memberships.find(m=>m.user_id===c.submitted_by)?.display_name || 'a former member')}. Not part of the tree until it is approved.</p>${reviewCard(c)}`;};
  const form=formFor();
  const panel=`<aside class="card tree-panel" id="tree-panel" aria-labelledby="tree-panel-name">${form || (sel ? (sel.ghost ? ghostCard(sel) : panelFor(sel)) : '<h3 id="tree-panel-name">Start your tree</h3><p>Add the first relative, perhaps yourself, and grow the tree from there.</p><button data-add="free">Add a relative</button>')}</aside>`;

  const you=me ? `<p>You are <strong>${esc(byId(me)?.name)}</strong> in this tree. Relationships are shown from your place.</p><button class="quiet" data-unlink="${esc(userId)}">This isn’t me</button>`
    : claim ? `<p>Waiting for a family owner to confirm that you are <strong>${esc(byId(claim)?.name || 'this person')}</strong>.</p><button class="quiet" data-decline-claim="${esc(userId)}">Withdraw request</button>`
    : `<p>Find yourself in the tree and choose “This is me”. If you are not in the tree yet, add yourself as a living relative first.</p>`;
  const claims=isOwner ? memberships.filter(m=>m.claim_person_id && m.user_id!==userId) : [];
  const forMe=pending.filter(c=>canReview(snap,userId,isOwner,c)), sent=pending.filter(c=>c.submitted_by===userId);
  const target=c=>c.person_id || c.proposed_record.id;
  const row=(c,action)=>`<div class="member"><span>${esc(memberships.find(m=>m.user_id===c.submitted_by)?.display_name || 'A former member')} ${c.person_id ? 'suggested changes to' : 'proposed adding'} <strong>${esc(c.proposed_record.name)}</strong></span><button class="quiet" data-select="${esc(target(c))}">${action}</button></div>`;
  const attention=claims.length || forMe.length || sent.length ? `<section class="card tree-attention" id="tree-attention" aria-labelledby="tree-attention-title"><h3 id="tree-attention-title">Waiting for you (${claims.length+forMe.length})</h3>${claims.map(m=>`<div class="member"><span>${esc(m.display_name)} says they are <strong>${esc(byId(m.claim_person_id)?.name || 'someone')}</strong></span><span class="tree-actions"><button data-approve-claim="${m.user_id}" aria-label="Confirm ${esc(m.display_name)} is ${esc(byId(m.claim_person_id)?.name)}">Confirm</button><button class="quiet" data-decline-claim="${m.user_id}" aria-label="Decline ${esc(m.display_name)}’s request">Decline</button></span></div>`).join('')}${forMe.map(c=>row(c,'Review')).join('')}${!claims.length && !forMe.length ? '<p class="kin-note">Nothing needs your approval.</p>' : ''}${sent.length ? `<h4>Your proposals waiting for others (${sent.length})</h4>${sent.map(c=>row(c,'View')).join('')}` : ''}</section>` : '';
  const branches=[...new Set(people.map(p=>p.branch).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const toolbar=`<div class="tree-toolbar"><label>Find someone<input id="tree-search" type="search" autocomplete="off" value="${esc(ui.query)}" placeholder="Type a name, then press Enter"></label>${branches.length ? `<label class="branch-filter">Household branch<select id="tree-branch"><option value="">All branches (${people.length})</option>${branches.map(b=>`<option value="${esc(b)}" ${branch===b?'selected':''}>${esc(b)}</option>`).join('')}</select></label>` : ''}<button data-add="free">Add a relative</button></div>`;
  const decided=contributions.filter(c=>c.status!=='pending').sort((a,b)=>b.submitted_at.localeCompare(a.submitted_at));
  return `<div class="section-title"><div><h2>The people in our story</h2><p>One extended family. Many branches.</p></div><small>Private to this family</small></div><details class="card tree-guidance"><summary>How editing the tree works</summary><ul><li>Anyone in the family can add living relatives.</li><li>People who have died are kept by their immediate family: a parent, child, brother or sister, or partner whose account is linked to the tree. Anyone else’s additions and changes go to them for approval, and need a source.</li><li>A record linked to someone’s account changes only with their agreement.</li><li>${isOwner ? 'As an owner you change other records directly, confirm who people are, and can decline any proposal.' : 'Changes to other records need a family owner’s approval.'}</li><li>Roots cannot verify family history: sources are what the contributor says the details come from.</li></ul></details>${attention}<section class="card kin-you" id="you"><h3>You in this tree</h3>${you}</section>${toolbar}${people.length || ghosts.length ? `<div class="tree-layout"><div class="tree-main">${canvas}${focus}</div>${panel}</div>` : `<div class="tree-layout empty">${panel}</div>`}${decided.length ? `<details class="tree-contributions"><summary>Recent decisions (${decided.length})</summary>${decided.map(reviewCard).join('')}</details>` : ''}`;
}
