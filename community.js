import { configured, supabase } from './supabase-client.js';
import { decoratePublic } from './memory-scene.js';
decoratePublic();
const root = document.querySelector('#community');
const status = document.querySelector('#community-status');
const account = document.querySelector('#account');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '') ? value : null;
const thread = uuid(params.get('thread')), person = uuid(params.get('profile'));
let session = null, snapshot = { posts: [], me: null, blocks: [] }, busy = false, cursor = null, more = false, generation = 0;
const say = message => { status.textContent = message; };
async function result(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
const enabled = () => Boolean(session && snapshot.me && !snapshot.me.suspended);
function profileForm() {
  const me = snapshot.me;
  return `<details class="card community-profile" ${me ? '' : 'open'}><summary>${me ? 'Your public profile & blocked accounts' : 'Choose how you appear publicly'}</summary><form id="public-profile" class="stack"><p>This profile is separate from your family name and tree. Your name and bio here are visible to everyone.</p><label>Public display name<input name="name" maxlength="60" required value="${esc(me?.name)}" autocomplete="nickname"></label><label>Short bio (optional)<textarea name="bio" maxlength="240">${esc(me?.bio)}</textarea></label>${me ? '' : '<label class="check"><input type="checkbox" name="adult_confirmed" required>I confirm I am 18 or older and understand my Community profile and posts are public.</label>'}<button>${me ? 'Save public profile' : 'Create public profile'}</button><small>Age is self-declared, not independently verified. Do not create a public profile for a child.</small></form>${snapshot.blocks.length ? `<h3>Blocked accounts</h3>${snapshot.blocks.map(b => `<p>${esc(b.name)} <button class="quiet" data-action="block" data-id="${b.id}" data-value="false">Unblock</button></p>`).join('')}` : ''}<p><small>Blocking hides posts between signed-in profiles and prevents replies/likes between them. Public posts can still be read while signed out.</small></p></details>`;
}
function postCard(p) {
  const can = enabled(), own = snapshot.me?.id === p.author_id;
  return `<article class="card community-post" id="post-${p.id}"><div class="community-author"><span class="community-avatar" aria-hidden="true">${esc(p.name.slice(0,1))}</span><div><a href="/community.html?profile=${p.author_id}">${esc(p.name)}</a><small>${esc(new Date(p.created_at).toLocaleString())} · Public${p.parent_id ? ' reply' : ''}</small></div></div><p class="post-body">${esc(p.body)}</p><div class="community-actions">${can ? `<button class="quiet" data-action="like" data-id="${p.id}" data-value="${!p.liked}" aria-pressed="${p.liked}" aria-label="${p.liked ? 'Unlike' : 'Like'} post by ${esc(p.name)}">${p.liked ? '♥' : '♡'} ${p.likes}</button>` : `<span>♡ ${p.likes}</span>`}<a href="/community.html?thread=${p.parent_id || p.id}">${p.parent_id ? 'View conversation' : `${p.replies} replies · Join conversation`}</a></div>${can ? `<details><summary>Post options</summary>${own ? `<button class="quiet" data-action="remove" data-id="${p.id}">Remove my post</button>` : `<button class="quiet" data-action="block" data-id="${p.author_id}" data-value="true">Block ${esc(p.name)}</button><form class="community-report" data-report="${p.id}"><label>Report reason<select name="reason"><option value="privacy">Private information</option><option value="harassment">Harassment or abuse</option><option value="spam">Spam</option><option value="other">Other concern</option></select></label><button>Send report</button></form><small>Reports are private and queued for manual review; they do not immediately remove a post.</small>`}</details>` : ''}</article>`;
}
function render(savedForm = '') {
  const drafts = [...root.querySelectorAll('form[id]')].filter(f => f.id !== savedForm).flatMap(f => [...f.querySelectorAll('[name]')].map(el => [f.id,el.name,el.value,el.checked]));
  const focus = document.activeElement;
  const active = focus?.name && focus.closest('form[id]') ? [focus.closest('form').id, focus.name] : null;
  const profileOpen = root.querySelector('.community-profile')?.open;
  account.innerHTML = session ? '<button id="community-logout" class="quiet">Sign out</button>' : '<a href="/">Sign in</a>';
  root.innerHTML = `<div class="community-heading"><h2>${thread ? 'Conversation' : person ? 'Public profile' : 'The community'}</h2><button class="quiet" id="community-refresh">Refresh</button></div>${thread || person ? '<p><a href="/community.html">← All community posts</a></p>' : ''}${person ? `<section class="card"><span class="public-label">Public profile</span><h2>${esc(snapshot.profile?.name || 'Profile unavailable')}</h2><p class="post-body">${esc(snapshot.profile?.bio)}</p></section>` : ''}${!session ? '<section class="card"><h3>A window into the community.</h3><p>Read freely. Sign in, then create an adult public profile to post, reply, like, report, or block.</p><a class="light-button" href="/">Sign in to participate →</a></section>' : snapshot.me?.suspended ? '<section class="card"><h3>Community participation is suspended.</h3><p>Your family space is separate from Community.</p></section>' : profileForm()}${enabled() && !person ? `<form id="public-post" class="card stack community-compose"><span class="public-label">◎ Public · Visible to anyone</span><label>${thread ? 'Add to the conversation' : 'What would you like to share?'}<textarea name="body" maxlength="500" required placeholder="A thought, a tradition, a small moment…"></textarea></label><small>Up to 500 characters. Keep family details and children’s information private.</small><button>${thread ? 'Reply publicly' : 'Post publicly'}</button></form>` : ''}<div id="community-posts">${snapshot.posts.map(postCard).join('') || `<div class="card community-empty"><span class="public-label">ROOM FOR CONNECTION</span><h3>${thread || person ? 'No posts to show.' : 'Every conversation starts with a hello.'}</h3><p>${thread || person ? 'Content may be unavailable, removed, or blocked.' : 'No public posts yet. Your private family posts will never appear here automatically.'}</p></div>`}</div>${more ? '<button id="community-more" class="quiet">Load older posts</button>' : ''}`;
  for (const [id,name,value,checked] of drafts) {
    const el = document.getElementById(id)?.elements.namedItem(name);
    if (el) { el.value = value; if(el.type === 'checkbox') el.checked = checked; }
  }
  if (profileOpen !== undefined && root.querySelector('.community-profile')) root.querySelector('.community-profile').open = profileOpen;
  if (active) document.getElementById(active[0])?.elements.namedItem(active[1])?.focus({preventScroll:true});
}
async function load(append = false, savedForm = '') {
  const requestId = ++generation;
  const data = await result(supabase.rpc('community_read', {request:{thread,profile:person,...(append && cursor ? cursor : {})}}));
  if (requestId !== generation) return;
  const last = data.posts.at(-1);
  cursor = last ? {before_time:last.created_at,before_id:last.id} : null;
  more = data.posts.length === 20;
  snapshot = {...data,posts:append ? [...snapshot.posts,...data.posts].filter((p,i,all) => all.findIndex(x=>x.id===p.id) === i) : data.posts};
  render(savedForm);
}
async function run(task) {
  if (busy) return;
  busy = true;
  try { await task(); } catch(error) {
    say(error.message || 'Community could not be loaded. Please try again.');
    if (!root.querySelector('button')) root.innerHTML = '<section class="card"><h2>Community is unavailable right now.</h2><p>Your family space has not changed.</p><button id="community-refresh">Try again</button></section>';
  } finally { busy = false; }
}
root.addEventListener('submit',event => {
  event.preventDefault();
  const form = event.target, values = Object.fromEntries(new FormData(form));
  if (!session || busy) return;
  run(async()=>{
    let action, payload;
    if(form.id === 'public-profile') {action='profile';payload={...values,adult_confirmed:values.adult_confirmed === 'on'};}
    else if(form.id === 'public-post') {action='post';payload={body:values.body,parent_id:thread};}
    else if(form.dataset.report) {action='report';payload={id:form.dataset.report,reason:values.reason};}
    else return;
    await result(supabase.rpc('community_action',{action,payload}));
    // Clear only confirmed saved text, even if the subsequent refresh fails.
    form.reset();
    say(action === 'report' ? 'Report received for manual review. No immediate response is guaranteed.' : action === 'post' ? 'Shared publicly.' : 'Public profile saved.');
    await load(false,form.id);
  });
});
document.addEventListener('click',event=>{
  const button = event.target.closest('button');
  if(!button || busy) return;
  if(!button.dataset.action && !['community-refresh','community-more','community-logout'].includes(button.id)) return;
  run(async()=>{
    if(button.id === 'community-logout') {
      await result(supabase.auth.signOut());
      session=null; snapshot={posts:[],me:null,blocks:[]}; root.innerHTML=''; await load(); say('Signed out.');
    } else if(button.id === 'community-refresh' || button.id === 'community-more') {await load(button.id === 'community-more');say('Up to date.');}
    else {
      if(!enabled()) throw new Error('Sign in and create a public profile first.');
      const action=button.dataset.action;
      if(action === 'remove' && !confirm('Remove this public post? Replies to a removed root post will also be hidden.')) return;
      if(action === 'block' && button.dataset.value === 'true' && !confirm('Block this profile? Their posts will be hidden while you are signed in. Public posts remain readable when signed out.')) return;
      await result(supabase.rpc('community_action',{action,payload:{id:button.dataset.id,liked:button.dataset.value === 'true',blocked:button.dataset.value === 'true'}}));
      await load(); say(action === 'remove' ? 'Post removed from public view.' : 'Updated.');
    }
  });
});
if(configured) {
  supabase.auth.onAuthStateChange((event,next)=>{
    if(event === 'SIGNED_OUT' || (session && next?.user.id !== session.user.id)) {
      session=next; generation++; snapshot={posts:[],me:null,blocks:[]}; root.innerHTML=''; render();
      setTimeout(()=>run(()=>load()),0);
    } else if(event === 'SIGNED_IN' && next?.user.id !== session?.user.id) {
      session=next; generation++; root.innerHTML='';
      // Auth callbacks must not await another Supabase call inside the auth lock.
      setTimeout(()=>run(()=>load()),0);
    }
  });
  run(async()=>{session=(await result(supabase.auth.getSession())).session;await load();});
} else root.innerHTML='<section class="card"><h2>Community is getting ready.</h2><p>The public feed is not connected in this environment. No sample posts are presented as real activity.</p><a href="/">Return to Roots</a></section>';
