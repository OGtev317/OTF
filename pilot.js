import { configured, demo, supabase } from "./supabase-client.js";
const signOutButton = `<button class="quiet" id="logout">${demo ? "Leave demo" : "Sign out"}</button>`;
import { decorateWelcome, decorateMember } from "./memory-scene.js";
import { treeView, approvalNote, avatar } from "./tree-view.js";
import { squarePhoto } from "./photo.js";
import { suggestMatches } from "./matching.js";
import { drawTreeLines } from "./tree-layout.js";
import { relationTo } from "./kinship.js";
import { familyFeed } from "./family-feed.js";
const root = document.querySelector("#pilot");
const status = document.querySelector("#status");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let session,
  families = [],
  familyId = "",
  snapshot,
  view = "feed",
  mode = "signin",
  editing = null,
  treeBranch = "",
  // Family tree tab: the selected person, an addition in progress ({mode, of}) and the search text.
  treeSelected = "",
  treeAdding = null,
  treeQuery = "",
  loading = false,
  loadId = 0,
  // The feed shows the newest posts first; older ones load on request.
  postLimit = 20,
  morePosts = false,
  // The invitation just created, shown once so it can be sent.
  inviteResult = null;
// An invitation link (?invite=…) is kept on this device through sign-up and email confirmation.
const INVITE_KEY = "otf-invite";
function pendingInvite() {
  try { return localStorage.getItem(INVITE_KEY) || ""; } catch { return ""; }
}
function keepInvite(code) {
  try { code ? localStorage.setItem(INVITE_KEY, code) : localStorage.removeItem(INVITE_KEY); } catch {}
}
// A family's join link (?join=…) is kept the same way, so a newcomer can ask to join after signing up.
const JOIN_KEY = "otf-join";
function pendingJoin() {
  try { return localStorage.getItem(JOIN_KEY) || ""; } catch { return ""; }
}
function keepJoin(code) {
  try { code ? localStorage.setItem(JOIN_KEY, code) : localStorage.removeItem(JOIN_KEY); } catch {}
}
{
  const params = new URLSearchParams(location.search), code = params.get("invite"), join = params.get("join");
  if (code && /^[0-9a-f]{64}$/i.test(code)) keepInvite(code.toLowerCase());
  if (join && /^[0-9a-f]{64}$/i.test(join)) keepJoin(join.toLowerCase());
  if (code || join) history.replaceState(null, "", location.pathname);
}
// The signed-in person's requests to join, and what their pending join link shows (family name only).
let myRequests = [], joinPreview = null;
// The status floats over the page, so confirmations fade after a few seconds;
// errors and anything the person must act on stay until the next message.
let fade;
const say = (text, stay = false) => {
  status.textContent = text;
  clearTimeout(fade);
  if (text && !stay) fade = setTimeout(() => { if (status.textContent === text) status.textContent = ""; }, 6000);
};
const field = (label, name, type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" ${extra} required></label>`;
async function result(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
function authScreen() {
  document.querySelector("#account").innerHTML = "";
  if (!configured) {
    root.innerHTML = `<section class="welcome"><span class="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>A little closer.<br>A little more together.</h1><p>One home for family updates, shared memories, and the stories that connect us.</p><div class="card"><h2>Our family pilot is getting ready.</h2><p>Account access is not connected yet. For now, explore Roots with a fictional family.</p><a class="light-button" href="/demo.html">Explore the demo ↗</a></div></section>`;
    decorateWelcome(root);
    return;
  }
  const signup = mode === "signup",
    recovery = mode === "recover",
    reset = mode === "reset";
  root.innerHTML = `<div class="auth-grid"><section class="welcome"><span class="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>A little closer.<br>A little more together.</h1><p>Catch up on the everyday.<br>Keep the stories that matter.</p><div class="hero"><div><h2>Different branches.<br>Same roots.</h2><p>Your family space starts with an invitation.</p></div></div><a href="/demo.html">Take a look around the fictional demo →</a></section><form id="auth-form" class="card stack">${pendingInvite() && !reset ? '<p class="kin-note">You have an invitation. Sign in, or create an account, with the email address it was sent to.</p>' : pendingJoin() && !reset ? '<p class="kin-note">You opened a family’s join link. Sign in, or create an account, to ask to join.</p>' : ""}<h2>${signup ? "Create your account" : recovery ? "Find your way back" : reset ? "Choose a new password" : "Welcome back"}</h2><p>${signup ? "An account does not grant family access. Join with an invitation or create your own space." : recovery ? "We’ll send a password-reset link if this email has an account." : reset ? "Use a new password with at least 12 characters." : "Sign in to your family’s space."}</p>${!reset ? field("Email", "email", "email", 'autocomplete="email" maxlength="254"') : ""}${!recovery ? field("Password", "password", "password", `minlength="12" maxlength="128" autocomplete="${signup || reset ? "new-password" : "current-password"}"`) : ""}<button>${signup ? "Create account" : recovery ? "Send reset link" : reset ? "Save new password" : "Sign in"}</button>${!reset ? `<button class="quiet" type="button" data-mode="${signup || recovery ? "signin" : "signup"}">${signup || recovery ? "Back to sign in" : "New here? Create an account"}</button>${!signup && !recovery ? '<button class="quiet" type="button" data-mode="recover">Forgot your password?</button>' : ""}` : ""}</form></div>`;
  decorateWelcome(root);
}
async function refreshFamilies() {
  const current = families.find((f) => f.id === familyId);
  families = await result(
    supabase.from("families").select("id,name").order("created_at"),
  );
  myRequests = (await result(supabase.from("join_requests").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(20))) || [];
  joinPreview = null;
  const join = pendingJoin();
  if (join) {
    const { data, error } = await supabase.rpc("preview_join_link", { code: join });
    joinPreview = error ? { error: error.message } : data?.[0] || { error: "This join link has expired or been turned off. Ask the family for a new one." };
    // Already a member: go straight to that family.
    if (joinPreview.member) { keepJoin(""); familyId = joinPreview.family_id; joinPreview = null; }
  }
  if (!families.some((f) => f.id === familyId)) {
    if (current) removedFrom = current.name;
    familyId = families[0]?.id || "";
  }
}
// Supabase returns at most 1,000 rows per request. Read page by page so a large family's
// tree, members and pending proposals are never silently cut short.
const PAGE = 1000;
async function every(query) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = (await result(query().range(from, from + PAGE - 1))) || [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}
// Replies and likes for the posts on screen only, a few dozen posts per request.
async function forPosts(table, fid, posts) {
  const rows = [];
  for (let i = 0; i < posts.length; i += 50) {
    const chunk = posts.slice(i, i + 50);
    rows.push(...(await every(() => supabase.from(table).select("*").eq("family_id", fid).in("post_id", chunk).order(table === "comments" ? "created_at" : "post_id").order(table === "comments" ? "id" : "user_id"))));
  }
  return rows;
}
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Photos are private files; the page shows them through links that expire after an hour,
// so new links are fetched shortly before then.
const PHOTOS = "family-photos";
let photoTimer;
async function signPhotos(people) {
  clearTimeout(photoTimer);
  const paths = [...new Set(people.map((p) => p.photo_path).filter(Boolean))];
  if (!paths.length) return {};
  photoTimer = setTimeout(async () => {
    if (!snapshot) return;
    snapshot.photos = await signPhotos(snapshot.people);
    render();
  }, 50 * 60 * 1000);
  const { data, error } = await supabase.storage.from(PHOTOS).createSignedUrls(paths, 3600);
  // Photos are optional: without them the tree shows initials.
  if (error) return {};
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
async function loadFamily() {
  const request = ++loadId;
  if (!familyId) {
    snapshot = null;
    render();
    return;
  }
  const fid = familyId, day = localDate();
  const from = (table) => supabase.from(table).select("*").eq("family_id", fid);
  const [memberships, people, life_profiles, posts, events, past_events, pending, decided] = await Promise.all([
    every(() => from("memberships").order("user_id")),
    every(() => from("people").order("id")),
    every(() => from("life_profiles").order("user_id")),
    // One more than shown, to know whether older posts exist.
    result(from("posts").order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, postLimit)),
    every(() => from("events").gte("event_date", day).order("event_date").order("id")),
    result(from("events").lt("event_date", day).order("event_date", { ascending: false }).limit(10)),
    every(() => from("tree_contributions").eq("status", "pending").order("submitted_at").order("id")),
    result(from("tree_contributions").neq("status", "pending").order("submitted_at", { ascending: false }).limit(20)),
  ]);
  const shown = (posts || []).slice(0, postLimit), ids = shown.map((p) => p.id);
  const [comments, reactions] = await Promise.all([forPosts("comments", fid, ids), forPosts("reactions", fid, ids)]);
  if (request !== loadId || !session || fid !== familyId) return;
  const photos = await signPhotos(people);
  if (request !== loadId || !session || fid !== familyId) return;
  snapshot = { memberships, people, life_profiles, posts: shown, comments, reactions, events, past_events: past_events || [], tree_contributions: [...pending, ...(decided || [])], photos };
  morePosts = (posts || []).length > postLimit;
  if (!snapshot.memberships.some((m) => m.user_id === session.user.id)) {
    const lost = families.find((f) => f.id === fid)?.name;
    snapshot = null;
    editing = null;
    treeBranch = "";
    treeSelected = "";
    treeAdding = null;
    treeQuery = "";
    await refreshFamilies();
    await loadFamily();
    if (lost) removedFrom = lost;
    return;
  }
  // Owners see every invitation; members see the ones they sent.
  const invitations = await result(supabase.rpc("list_invitations", { fid }));
  // Owners also see the join link and requests to join.
  const [joinLink, joinRequests] = owner()
    ? await Promise.all([result(supabase.rpc("join_link", { fid })), every(() => supabase.from("join_requests").select("*").eq("family_id", fid).eq("status", "pending").order("created_at").order("id"))])
    : [[], []];
  if (request !== loadId || !session || fid !== familyId) return;
  snapshot.invitations = invitations || [];
  snapshot.joinLink = joinLink?.[0] || null;
  snapshot.joinRequests = joinRequests;
  render();
}
function owner() {
  return snapshot?.memberships.some(
    (m) => m.user_id === session?.user.id && m.role === "owner",
  );
}
const myPerson = () => snapshot?.memberships.find((m) => m.user_id === session?.user.id)?.person_id || "";
function joinCard() {
  if (!joinPreview) return "";
  if (joinPreview.error) return `<section class="card stack" id="join-request-box"><h2>Join link</h2><p>${esc(joinPreview.error)}</p><button class="quiet" id="join-dismiss">Dismiss</button></section>`;
  if (joinPreview.pending) return `<section class="card stack" id="join-request-box"><h2>Your request to join ${esc(joinPreview.family_name)} is waiting</h2><p>An owner of the family will review it. You will see the family here once they approve it.</p><button class="quiet" id="refresh-requests">Check again</button></section>`;
  return `<form id="join-request" class="card stack"><h2>Ask to join ${esc(joinPreview.family_name)}</h2><p>An owner of this family will review your request. Nobody can see you or your note except the family’s owners, and you will see the family only once they approve it.</p>${field("Your name in this family", "display_name", "text", 'maxlength="100" autocomplete="name"')}<label>A note for the family (optional)<textarea name="note" maxlength="500" placeholder="For example: I’m Maya’s daughter Jordan."></textarea></label><label>Your birth year (optional)<input name="birth_year" type="number" inputmode="numeric" min="1900" max="${new Date().getFullYear()}"></label><small>A name and birth year help the owner find your place in the family tree.</small><div class="tree-actions"><button>Send request</button><button type="button" class="quiet" id="join-dismiss">Not now</button></div></form>`;
}
function requestsList() {
  const shown = myRequests.filter((r) => r.status !== "approved" && r.status !== "withdrawn");
  if (!shown.length) return "";
  return `<section class="card"><h2>Your requests to join</h2>${shown.map((r) => `<div class="member"><span>${esc(r.family_name || "A family")} <small>${r.status === "pending" ? "Waiting for an owner" : "Declined"} · ${esc(new Date(r.created_at).toLocaleDateString())}</small></span>${r.status === "pending" ? `<span class="tree-actions"><button class="quiet" id="refresh-requests">Check again</button><button class="quiet" data-withdraw-request="${r.id}" aria-label="Withdraw request to join ${esc(r.family_name)}">Withdraw</button></span>` : ""}</div>`).join("")}</section>`;
}
function onboarding() {
  const invite = pendingInvite();
  return `${joinCard()}${requestsList()}${invite ? '<p class="card kin-note">You have an invitation. Join below with the email address it was sent to.</p>' : ""}<div class="columns"><form id="create-family" class="card stack"><h2>Start your family space</h2><p>An empty home for your own family. You’ll be its first owner.</p>${field("Family name", "family_name", "text", 'maxlength="100"')}${field("Your name in this family", "member_name", "text", 'maxlength="100"')}<button>Create family</button></form><form id="join-family" class="card stack"><h2>Invited by a relative?</h2><p>Open the link from your invitation email, or paste its code. It works once, only for the email address it was sent to, and expires after seven days.</p>${field("Invitation code", "code", "text", `autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200" value="${esc(invite)}"`)}${field("Your name in this family", "member_name", "text", 'maxlength="100"')}<button>Join family</button></form></div>`;
}
function feed() {
  return familyFeed(snapshot, session.user.id, morePosts);
}
function tree() {
  return treeView({ ...snapshot, contributions: snapshot.tree_contributions }, editing, owner(), session.user.id, treeBranch, { selected: treeSelected, adding: treeAdding, query: treeQuery });
}
function events() {
  const gathering = (e) => `<article class="card"><h2>${esc(e.title)}</h2><small>${esc(e.event_date)} · All-day gathering</small><p class="post-body">${esc(e.detail)}</p></article>`;
  return `<div class="columns"><section>${snapshot.events.map(gathering).join("") || '<div class="card"><h2>Make time for together.</h2><p>No upcoming gatherings. Plan something small.</p></div>'}${snapshot.past_events.length ? `<details><summary>Recent gatherings</summary>${snapshot.past_events.map(gathering).join("")}</details>` : ""}</section><form id="event" class="card stack"><h2>Plan a gathering</h2>${field("Name", "title", "text", 'maxlength="100"')}${field("Date", "event_date", "date")}<label>Details<textarea name="detail" maxlength="500"></textarea></label><button>Add gathering</button><small>No email notifications are sent.</small></form></div>`;
}
function invitationMessage({ code, email, person }) {
  const link = `${location.origin}/?invite=${code}`;
  const name = snapshot.people.find((p) => p.id === person)?.name || "";
  const relation = person ? relationTo(snapshot.people, myPerson(), person) : "";
  const me = snapshot.memberships.find((m) => m.user_id === session.user.id)?.display_name || "";
  const family = families.find((f) => f.id === familyId)?.name || "our family";
  const body = `Hi${name ? ` ${name.split(" ")[0]}` : ""},\n\nI’d like you to join ${family} on Roots, our private family space${name ? `, where you are in our family tree as ${name}${relation && relation !== "you" ? ` — my ${relation}` : ""}` : ""}.\n\nJoin with this link:\n${link}\n\nIt works only when you sign up or sign in with ${email}, and it expires in seven days.\n\n${me}`;
  return { link, name, relation, mailto: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Join ${family} on Roots`)}&body=${encodeURIComponent(body)}` };
}
// Owners: the family's join link, and requests to join with "Is this you?" suggestions.
function joinSection() {
  const link = snapshot.joinLink, requests = snapshot.joinRequests || [];
  const open = snapshot.people.filter((p) => p.life_status !== "deceased" && !snapshot.memberships.some((m) => m.person_id === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const years = (p) => (p.birth_date ? ` · born ${p.birth_date.slice(0, 4)}` : "");
  const decision = (r) => {
    const found = suggestMatches(r, snapshot.people, snapshot.memberships);
    const choice = (value, label, checked) => `<label class="check"><input type="radio" name="place" value="${value}" ${checked ? "checked" : ""}>${label}</label>`;
    return `<form class="card stack join-decision" data-join-request="${r.id}"><h3>${esc(r.display_name)}</h3><small>Asked ${esc(new Date(r.created_at).toLocaleDateString())}${r.birth_year ? ` · born ${r.birth_year}` : ""}</small>${r.note ? `<p class="post-body">${esc(r.note)}</p>` : ""}<fieldset class="kin-list"><legend>Who are they in the tree?</legend>${found.length ? '<small>Possible matches, best first. Only you decide.</small>' : '<small>No likely match in the tree.</small>'}${found.map((m, i) => choice(`person:${m.person.id}`, `Is this them? <strong>${esc(m.person.name)}</strong>${esc(years(m.person))}`, i === 0)).join("")}${choice("new", `Add them as someone new: ${esc(r.display_name)}`, !found.length)}${open.length ? `<label class="check"><input type="radio" name="place" value="other">Someone else in the tree<select name="other" aria-label="Choose who they are">${open.map((p) => `<option value="${p.id}">${esc(p.name)}${esc(years(p))}</option>`).join("")}</select></label>` : ""}${choice("none", "Not in the tree for now", false)}</fieldset><div class="tree-actions"><button name="decision" value="approve">Approve</button><button class="quiet" name="decision" value="decline">Decline</button></div></form>`;
  };
  return `<section class="card stack" id="join-section"><h2>Join link</h2><p>Share this link where your family already talks, such as a group chat. Anyone who opens it and signs in sees only your family’s name and can ask to join. Nobody gets in until an owner approves.</p>${link ? `<label>Join link<input readonly value="${esc(`${location.origin}/?join=${link.code}`)}"></label><small>Works until ${esc(new Date(link.expires_at).toLocaleDateString())}.</small><div class="tree-actions"><button class="quiet" id="join-link-new">Replace link</button><button class="quiet" id="join-link-off">Turn off</button></div>` : '<button id="join-link-new">Create join link</button>'}${requests.length ? "" : '<p class="kin-note">No requests to join waiting.</p>'}</section>${requests.length ? `<section class="stack" id="join-requests"><h2>Requests to join (${requests.length})</h2>${requests.map(decision).join("")}</section>` : ""}`;
}
function members() {
  const me = session.user.id, isOwner = owner();
  const name = (id) => esc(snapshot.people.find((p) => p.id === id)?.name || "someone no longer in the tree");
  const profile = snapshot.life_profiles.find((p) => p.user_id === me) || {};
  const open = snapshot.people.filter((p) => p.life_status !== "deceased" && !snapshot.memberships.some((m) => m.person_id === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const status = (i) => (i.revoked_at ? "Revoked" : i.used_at ? "Accepted" : Date.parse(i.expires_at) < Date.now() ? "Expired" : "Waiting");
  const sent = inviteResult && invitationMessage(inviteResult);
  const roster = snapshot.memberships.map((m) => {
    const about = snapshot.life_profiles.find((p) => p.user_id === m.user_id && (p.about || p.work || p.share));
    return `<div class="member">${avatar(snapshot.people.find((p) => p.id === m.person_id) || { name: m.display_name }, snapshot.photos, "tree-avatar small")}<span>${esc(m.display_name)} <small>${m.role}</small>${m.person_id ? `<small class="kin-account">In the tree as ${name(m.person_id)}</small>` : m.claim_person_id ? `<small class="kin-account">Asked to be linked to ${name(m.claim_person_id)}</small>` : ""}${about ? `<details><summary>About ${esc(m.display_name)}</summary>${about.about ? `<p class="post-body">${esc(about.about)}</p>` : ""}${about.work ? `<p><strong>Work:</strong> ${esc(about.work)}</p>` : ""}${about.share ? `<p><strong>For the family:</strong> ${esc(about.share)}</p>` : ""}</details>` : ""}</span><span class="tree-actions">${isOwner && m.person_id && m.user_id !== me ? `<button class="quiet" data-unlink="${m.user_id}" aria-label="Remove the tree link for ${esc(m.display_name)}">Remove link</button>` : ""}${isOwner && m.role !== "owner" ? `<button class="quiet" data-remove="${m.user_id}" aria-label="Remove access for ${esc(m.display_name)}">Remove access</button>` : ""}</span></div>`;
  }).join("");
  return `<section class="card"><h2>Your people</h2>${roster}</section>${isOwner ? joinSection() : ""}<form id="profile" class="card stack"><h2>Your life profile</h2><p>What you want this family to know about you. Only members of this family can see it, and only you can change it.</p><label>About you<textarea name="about" maxlength="1000">${esc(profile.about)}</textarea></label><label>Work<input name="work" maxlength="300" value="${esc(profile.work)}"></label><label>Anything else for the family<textarea name="share" maxlength="1000" placeholder="Interests, news, how best to reach you…">${esc(profile.share)}</textarea></label><button>Save profile</button></form><section class="card stack"><h2>Invite a relative</h2><form id="invite-form" class="stack"><p>Say who you are inviting and where they are in the family tree. The invitation works only for their email address, and joining links their account to that place in the tree.</p><label>Their email address<input name="email" type="email" required maxlength="254" autocomplete="off"></label><label>Who are they in the family tree?<select name="person" ${isOwner ? "" : "required"}>${isOwner ? '<option value="">Not in the tree yet — they can find themselves later</option>' : '<option value="">Choose a person</option>'}${open.map((p) => { const relation = relationTo(snapshot.people, myPerson(), p.id); return `<option value="${p.id}">${esc(p.name)}${relation && relation !== "you" ? ` — your ${esc(relation)}` : ""}</option>`; }).join("")}</select></label><small>Not listed? Add them in Family tree first, then invite them. People who have died, and people already linked to an account, are not listed.</small><button>Create invitation</button></form><div id="invite-code">${sent ? `<p><strong>Invitation ready for ${esc(inviteResult.email)}${sent.name ? ` as ${esc(sent.name)}` : ""}.</strong> Roots does not send invitations itself: open it in your email app, or copy the link.</p><a class="light-button" href="${esc(sent.mailto)}">Open in your email app</a><label>Invitation link<input readonly value="${esc(sent.link)}"></label><small>Shown once. Anyone else who gets this link cannot use it: it works only for ${esc(inviteResult.email)}.</small>` : ""}</div><h3>${isOwner ? "Invitations" : "Invitations you sent"}</h3>${snapshot.invitations.map((i) => `<div class="member"><small>${status(i)} · ${esc(i.email || "Code without an address")}${i.person_id ? ` · as ${name(i.person_id)}` : ""}${isOwner && i.invited_by && i.invited_by !== me ? ` · sent by ${esc(snapshot.memberships.find((m) => m.user_id === i.invited_by)?.display_name || "a former member")}` : ""} · expires ${esc(new Date(i.expires_at).toLocaleDateString())}</small>${!i.used_at && !i.revoked_at ? `<button class="quiet" data-revoke="${i.id}" aria-label="Revoke invitation for ${esc(i.email || "code")}">Revoke</button>` : ""}</div>`).join("") || "<p>No invitations yet.</p>"}</section><details ${pendingInvite() || joinPreview ? "open" : ""}><summary>Create or join another family</summary>${onboarding()}</details>`;
}
// Every update re-renders the page. Keep the user's place: the focused control and any
// unsent text in the feed, reply and gathering forms (not the form that was just saved).
let savedForm = "";
// A family the user was removed from during the last load, reported instead of a success message.
let removedFrom = "";
function report(text) {
  say(removedFrom ? `You no longer have access to ${removedFrom}.` : text, Boolean(removedFrom));
  removedFrom = "";
}
const draftForms = "#post, form[data-comment], #event, form[data-tree-review], #profile, #invite-form, #join-request";
function formKey(form) {
  return form.id ? `#${form.id}` : form.dataset.comment ? `form[data-comment="${form.dataset.comment}"]` : form.dataset.treeReview ? `form[data-tree-review="${form.dataset.treeReview}"]` : "";
}
function controlKey(el) {
  for (const attr of ["data-react", "data-view", "data-edit", "data-remove", "data-revoke", "data-withdraw", "data-claim", "data-select", "data-add", "data-unlink", "data-approve-claim", "data-decline-claim"])
    if (el.hasAttribute(attr)) return `[${attr}="${el.getAttribute(attr)}"]`;
  if (el.id) return `#${el.id}`;
  const form = el.closest("form"), scope = form && formKey(form);
  if (!scope) return "";
  return el.name ? `${scope} [name="${el.name}"]${el.type==='checkbox' ? `[value="${el.value}"]` : ''}` : el.tagName === "BUTTON" ? `${scope} button` : "";
}
function render() {
  const sameFamily = Boolean(session && root.dataset.familyId === familyId);
  const oldPerson = sameFamily && savedForm !== '#person' ? root.querySelector('#person') : null;
  const personKey = oldPerson?.dataset.person;
  const personDraft = oldPerson ? [...oldPerson.querySelectorAll('[name]')].map(el=>[el.name,el.value,el.checked,el.type]) : [];
  const active = root.contains(document.activeElement) ? controlKey(document.activeElement) : "";
  const drafts = [...root.querySelectorAll(draftForms)]
    .filter((form) => sameFamily && formKey(form) !== savedForm)
    .flatMap((form) => [...form.querySelectorAll("input, textarea")].filter((el) => el.value).map((el) => [controlKey(el), el.value]));
  paint();
  root.dataset.familyId = session ? familyId : '';
  const newPerson = root.querySelector('#person');
  if(newPerson && newPerson.dataset.person === personKey) {
    for(const [name,value,checked,type] of personDraft) {
      if(type==='checkbox') {
        const el=[...newPerson.querySelectorAll(`[name="${name}"]`)].find(el=>el.value===value);
        if(el) el.checked=checked;
      } else { const el=newPerson.querySelector(`[name="${name}"]`); if(el) el.value=value; }
    }
  }
  for (const [key, value] of drafts) {
    const el = key && root.querySelector(key);
    if (el && !el.value) el.value = value;
  }
  updatePostCount();
  if (view === "tree") drawTreeLines(root);
  if (active) {
    // The tree shows people twice (wide view and phone view); focus the visible copy.
    const matches = [...root.querySelectorAll(active)];
    (matches.find((el) => el.getClientRects().length) || matches[0])?.focus({ preventScroll: true });
  }
}
// Scrolls a wide generation row sideways so the selected person is visible.
function revealSelected() {
  const canvas = root.querySelector(".tree-canvas"), node = canvas?.querySelector(".tree-node.selected");
  if (!node || getComputedStyle(canvas).display === "none") return;
  const box = canvas.getBoundingClientRect(), r = node.getBoundingClientRect();
  if (r.left < box.left || r.right > box.right) canvas.scrollLeft += r.left - box.left - (box.width - r.width) / 2;
}
// Tree lines follow the cards, so redraw them when the page width changes or fonts load.
let lineFrame = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(lineFrame);
  lineFrame = requestAnimationFrame(() => view === "tree" && drawTreeLines(root));
});
document.fonts?.ready.then(() => view === "tree" && drawTreeLines(root));
function paint() {
  if (!session || mode === "reset") return authScreen();
  decorateMember();
  document.querySelector("#account").innerHTML =
    signOutButton;
  if (!familyId) {
    root.innerHTML = `<div class="page-heading"><span class="eyebrow">A PLACE TO BELONG</span><h1>Let’s find your family.</h1></div>${onboarding()}`;
    return;
  }
  if (!snapshot) {
    root.innerHTML = '<p role="status">Loading your family…</p>';
    return;
  }
  root.innerHTML = `<div class="family-top"><div><span class="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>${esc(families.find((f) => f.id === familyId)?.name)}</h1></div><label>Family space<select id="family-select">${families.map((f) => `<option value="${f.id}" ${f.id === familyId ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label><button class="quiet" id="refresh">Refresh</button></div><nav class="pilot-nav" aria-label="Family sections">${[
    ["feed", "Family feed"],
    ["tree", "Family tree"],
    ["events", "Gatherings"],
    ["members", owner() && snapshot.joinRequests?.length ? `Members (${snapshot.joinRequests.length})` : "Members"],
  ]
    .map(
      ([id, label]) =>
        `<button class="${view === id ? "selected" : ""}" data-view="${id}" ${view === id ? 'aria-current="page"' : ""}>${label}</button>`,
    )
    .join(
      "",
    )}</nav><section id="family-content" data-tab="${view}">${view === "tree" ? tree() : view === "events" ? events() : view === "members" ? members() : feed()}</section>`;
}
async function run(task) {
  if (loading) return;
  loading = true;
  say("Working…");
  try {
    await task();
  } catch (error) {
    if (!snapshot && !root.querySelector("form")) {
      if (session) {
        decorateMember();
        document.querySelector("#account").innerHTML = signOutButton;
        root.innerHTML = '<section class="card"><h2>Your family space could not be loaded.</h2><p>Your saved records have not been changed.</p><button id="refresh">Try again</button></section>';
      } else authScreen();
    }
    say(error.message || "Something went wrong. Please try again.", true);
  } finally {
    loading = false;
  }
}
async function mutate(action, payload, form) {
  await result(
    supabase.rpc("family_action", { fid: familyId, action, payload }),
  );
  savedForm = form ? formKey(form) : "";
  try {
    await loadFamily();
  } finally {
    savedForm = "";
  }
  report("Saved to your family space.");
}
// The tree form's fields as a save request. "Their relationship to you" becomes ordinary links;
// "my parent" and "Add parent" add the new person as a parent of an existing record.
function personPayload(form) {
  const fields = new FormData(form), data = Object.fromEntries(fields), me = myPerson();
  const parents = fields.getAll("parents"), partners = fields.getAll("partners"), parent_kinds = {};
  for (const id of parents) if (fields.get(`kind:${id}`) && fields.get(`kind:${id}`) !== "unspecified") parent_kinds[id] = fields.get(`kind:${id}`);
  const relation = data.relation_to_me;
  if (relation === "child" && !parents.includes(me)) parents.push(me);
  if (relation === "partner" && !partners.includes(me)) partners.push(me);
  if (relation === "sibling") {
    const mine = snapshot.people.find((p) => p.id === me)?.parents || [];
    if (!mine.length) throw new Error("Add your own parents to your record first, so brothers and sisters are linked through them.");
    for (const id of mine) if (!parents.includes(id)) parents.push(id);
  }
  return {
    name: data.name, branch: data.branch, life_status: data.life_status, birth_date: data.birth_date, death_date: data.death_date,
    story: data.story, source_note: data.source_note, parents, partners, parent_kinds,
    ...(relation === "parent" ? { my_parent: true } : data.parent_of ? { parent_of: data.parent_of } : {}),
    ...(editing ? { id: editing.id, version: editing.version } : {}),
  };
}
// Before saving, say whether a change applies at once or who must approve it.
function updateApproval(form) {
  const note = form.querySelector("#person-approval");
  if (!note) return;
  try {
    const payload = personPayload(form);
    note.textContent = approvalNote({ people: snapshot.people, memberships: snapshot.memberships }, session.user.id, owner(), editing, { ...(editing || {}), ...payload }, payload.parent_of || (payload.my_parent ? myPerson() : ""));
  } catch (error) {
    note.textContent = error.message;
  }
}
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  run(async () => {
    if (form.id === "auth-form") {
      const redirectTo = location.origin + "/";
      if (mode === "signup") {
        const response = await result(
          supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: { emailRedirectTo: redirectTo },
          }),
        );
        form.reset();
        if (response.session) {
          session = response.session;
          await refreshFamilies();
          await loadFamily();
        }
        say(
          response.session
            ? "Account created."
            : "Check your email to confirm your account, then sign in.",
          !response.session,
        );
      } else if (mode === "recover") {
        await result(
          supabase.auth.resetPasswordForEmail(data.email, { redirectTo }),
        );
        form.reset();
        say("If this account exists, a reset link is on its way.", true);
      } else if (mode === "reset") {
        await result(supabase.auth.updateUser({ password: data.password }));
        mode = "signin";
        await refreshFamilies();
        await loadFamily();
        say("Password updated.");
      } else {
        const response = await result(supabase.auth.signInWithPassword(data));
        session = response.session;
        await refreshFamilies();
        await loadFamily();
        say("Welcome back.");
      }
    } else if (form.id === "create-family" || form.id === "join-family") {
      if (form.id === "join-family") {
        // Pasted codes often carry spaces or line breaks; the code itself is 64 hexadecimal characters.
        data.code = data.code.replace(/\s+/g, "").toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(data.code))
          throw new Error("That invitation code looks incomplete. Copy all 64 characters and try again.");
      }
      familyId = await result(
        supabase.rpc(
          form.id === "create-family" ? "create_family" : "accept_invitation",
          data,
        ),
      );
      if (form.id === "join-family") keepInvite("");
      editing = null;
      treeBranch = "";
      treeSelected = "";
      treeAdding = null;
      treeQuery = "";
      postLimit = 20;
      inviteResult = null;
      await refreshFamilies();
      await loadFamily();
      say("Welcome to your family space.");
    } else if (form.id === "post") await mutate("post", data, form);
    else if (form.dataset.comment)
      await mutate("comment", { ...data, post_id: form.dataset.comment }, form);
    else if (form.id === "event") await mutate("event", data, form);
    else if (form.id === "person") {
      const payload = personPayload(form);
      const id = await result(supabase.rpc("tree_action", { fid: familyId, action: "save", payload }));
      const wasEditing = Boolean(editing);
      editing = null;
      treeAdding = null;
      form.reset();
      savedForm = '#person';
      try { await loadFamily(); } finally { savedForm = ''; }
      // The answer is the person, or the proposal waiting for approval.
      const proposed = snapshot?.tree_contributions.some((c) => c.id === id);
      if (!proposed && snapshot?.people.some((p) => p.id === id)) { treeSelected = id; render(); revealSelected(); }
      report(!proposed ? "Relative saved to your family tree." : wasEditing ? "Edit submitted for approval. The current record is unchanged." : "Sent for approval. It is shown in the tree with a dashed outline until it is approved.");
    } else if (form.id === "profile") {
      await result(supabase.rpc("tree_action", { fid: familyId, action: "profile", payload: data }));
      savedForm = "#profile";
      try { await loadFamily(); } finally { savedForm = ""; }
      report("Profile saved.");
    } else if (form.id === "join-request") {
      const year = data.birth_year ? Number(data.birth_year) : null;
      await result(supabase.rpc("request_to_join", { code: pendingJoin(), display_name: data.display_name, note: data.note || "", birth_year: year }));
      keepJoin("");
      await refreshFamilies();
      render();
      say("Request sent. You will see the family here once an owner approves it.", true);
    } else if (form.dataset.joinRequest) {
      const decision = event.submitter?.value;
      if (decision === "decline" && !confirm("Decline this request? They will not be able to see the family.")) return say("No changes made.");
      const place = data.place || "none";
      await result(supabase.rpc("decide_join_request", {
        fid: familyId, request: form.dataset.joinRequest, decision,
        person: place.startsWith("person:") ? place.slice(7) : place === "other" ? data.other : null,
        add_person: decision === "approve" && place === "new",
      }));
      await loadFamily();
      report(decision === "approve" ? "Approved. They are now a member of your family." : "Request declined.");
    } else if (form.id === "invite-form") {
      const email = data.email.trim();
      const code = await result(supabase.rpc("create_invitation", { fid: familyId, invite_email: email, invite_person: data.person || null }));
      inviteResult = { code, email, person: data.person || "" };
      savedForm = "#invite-form";
      try { await loadFamily(); } finally { savedForm = ""; }
      say("Invitation ready. Send it from your email app or copy the link.");
    } else if(form.dataset.treeReview) {
      const decision=event.submitter?.value;
      if(!['approve','reject'].includes(decision)) return;
      await result(supabase.rpc('tree_action',{fid:familyId,action:decision,payload:{id:form.dataset.treeReview,note:data.note}}));
      await loadFamily();
      report(decision==='approve' ? 'Edit approved and applied to the family tree.' : 'Edit rejected. The record is unchanged.');
    }
  });
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (loading) return;
  if (button.dataset.mode) {
    mode = button.dataset.mode;
    say("");
    authScreen();
    return;
  }
  if (button.dataset.view) {
    view = button.dataset.view;
    editing = null;
    treeAdding = null;
    render();
    return;
  }
  if (button.dataset.select || button.dataset.edit || button.dataset.add || button.id === "cancel-edit") {
    // Leaving a half-filled tree form asks first.
    const open = root.querySelector("#person");
    const typed = open && [...open.querySelectorAll("input:not([type=hidden]):not([type=checkbox]), textarea")].some((el) => el.value !== el.defaultValue);
    if (typed && button.id !== "cancel-edit" && !confirm("Discard the changes in the open form?")) return;
    editing = button.dataset.edit ? snapshot.people.find((p) => p.id === button.dataset.edit) : null;
    treeAdding = button.dataset.add ? { mode: button.dataset.add, of: button.dataset.of || "" } : null;
    if (button.dataset.select) treeSelected = button.dataset.select;
    if (button.dataset.edit) treeSelected = button.dataset.edit;
    render();
    if (editing || treeAdding) {
      root.querySelector("#person [name=name]")?.focus({ preventScroll: true });
      root.querySelector("#tree-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else if (button.dataset.select && globalThis.matchMedia?.("(max-width: 760px)").matches) root.querySelector(".tree-focus")?.scrollIntoView({ block: "start", behavior: "smooth" });
    else if (button.dataset.select) revealSelected();
    return;
  }
  const treeAction = ["claim", "unlink", "approveClaim", "declineClaim"].find((key) => button.dataset[key]);
  if (
    !["logout", "refresh", "more-posts", "join-link-new", "join-link-off", "join-dismiss", "refresh-requests"].includes(button.id) &&
    !button.dataset.withdrawRequest &&
    !button.dataset.react &&
    !button.dataset.remove &&
    !button.dataset.withdraw &&
    !button.dataset.revoke &&
    !button.dataset.removePhoto &&
    !treeAction
  )
    return;
  run(async () => {
    if (button.id === "join-link-new") {
      if (snapshot.joinLink && !confirm("Replace the join link? The current link will stop working.")) return say("No changes made.");
      await result(supabase.rpc("create_join_link", { fid: familyId }));
      await loadFamily();
      say("Join link ready. Copy it and share it with your family.");
    } else if (button.id === "join-link-off") {
      if (!confirm("Turn off the join link? Nobody new can ask to join with it.")) return say("No changes made.");
      await result(supabase.rpc("revoke_join_link", { fid: familyId }));
      await loadFamily();
      say("Join link turned off.");
    } else if (button.id === "join-dismiss") {
      keepJoin("");
      joinPreview = null;
      render();
      say("");
    } else if (button.id === "refresh-requests" || button.dataset.withdrawRequest) {
      if (button.dataset.withdrawRequest) await result(supabase.rpc("withdraw_join_request", { request: button.dataset.withdrawRequest }));
      const before = families.length;
      await refreshFamilies();
      await loadFamily();
      report(button.dataset.withdrawRequest ? "Request withdrawn." : families.length > before ? "You have been approved. Welcome to your family space." : "Still waiting for an owner.");
    } else if (button.id === "logout") {
      await result(supabase.auth.signOut());
      session = null;
      snapshot = null;
      familyId = "";
      editing = null;
      treeBranch = "";
      treeSelected = "";
      treeAdding = null;
      treeQuery = "";
      postLimit = 20;
      inviteResult = null;
      loadId++;
      render();
      say("Signed out.");
    } else if (button.id === "refresh") {
      await refreshFamilies();
      await loadFamily();
      report("Up to date.");
    } else if (button.id === "more-posts") {
      postLimit += 20;
      await loadFamily();
      say("");
    } else if (button.dataset.removePhoto) {
      if (!confirm("Remove this photo? It will be deleted for everyone in the family.")) return say("No changes made.");
      const old = await result(supabase.rpc("set_person_photo", { fid: familyId, person: button.dataset.removePhoto, path: null }));
      if (old) await supabase.storage.from(PHOTOS).remove([old]);
      await loadFamily();
      report("Photo removed.");
    } else if (treeAction) {
      const name = (id) => snapshot.people.find((p) => p.id === id)?.name || "this person";
      if (treeAction === "unlink" && !confirm("Remove this link between an account and the family tree?")) return say("No changes made.");
      const target = button.dataset[treeAction];
      await result(supabase.rpc("tree_action", {
        fid: familyId,
        action: { claim: "claim", unlink: "unlink", approveClaim: "approve_claim", declineClaim: "reject_claim" }[treeAction],
        payload: treeAction === "claim" ? { person_id: target } : { user_id: target },
      }));
      await loadFamily();
      report(treeAction === "claim" ? (myPerson() ? `Linked. You are ${name(myPerson())} in this tree.` : "Sent to a family owner to confirm.") : treeAction === "approveClaim" ? "Link confirmed." : treeAction === "unlink" ? "Link removed." : "Request declined.");
    } else if(button.dataset.withdraw) {
      await result(supabase.rpc('tree_action',{fid:familyId,action:'withdraw',payload:{id:button.dataset.withdraw}}));
      await loadFamily(); report('Proposed edit withdrawn.');
    } else if (button.dataset.react)
      await mutate("react", {
        post_id: button.dataset.react,
        liked: button.dataset.liked !== "true",
      });
    else if (button.dataset.remove) {
      if (!confirm("Remove this person’s access to the family space?")) {
        say("No changes made.");
        return;
      }
      await mutate("remove_member", { user_id: button.dataset.remove });
    } else if (button.dataset.revoke)
      await mutate("revoke_invitation", { id: button.dataset.revoke });
    else say("");
  });
});
function updatePostCount() {
  const input = root.querySelector('#post textarea');
  const counter = root.querySelector('#post-count');
  if (input && counter) counter.textContent = `${input.value.length.toLocaleString()} / 2,000`;
}
// Composer count and long parent/partner list filtering.
document.addEventListener("input", (event) => {
  if (event.target.matches('#post textarea')) updatePostCount();
  if (event.target.id === "tree-search") { treeQuery = event.target.value; render(); return; }
  if (event.target.closest("#person")) updateApproval(event.target.closest("#person"));
  if (event.target.id !== "relative-filter") return;
  const text = event.target.value.trim().toLowerCase();
  for (const label of root.querySelectorAll(".kin-list .check")) label.hidden = Boolean(text) && !label.textContent.toLowerCase().includes(text) && !label.querySelector("input").checked;
});
// A new photo: prepared on this device, uploaded to the family's private folder, then set on the
// person (the database checks who may). The replaced file is deleted; a refused upload is cleaned up.
function uploadPhoto(input) {
  const person = input.dataset.photo, file = input.files?.[0];
  input.value = "";
  if (!file) return;
  run(async () => {
    const photo = await squarePhoto(file);
    const path = `${familyId}/${person}/${crypto.randomUUID()}.jpg`;
    await result(supabase.storage.from(PHOTOS).upload(path, photo, { contentType: "image/jpeg", upsert: false }));
    let old;
    try {
      old = await result(supabase.rpc("set_person_photo", { fid: familyId, person, path }));
    } catch (error) {
      await supabase.storage.from(PHOTOS).remove([path]);
      throw error;
    }
    if (old) await supabase.storage.from(PHOTOS).remove([old]);
    await loadFamily();
    report("Photo saved. Everyone in the family can now see it.");
  });
}
// Enter in the tree search selects the first matching person.
document.addEventListener("keydown", (event) => {
  if (event.target.id !== "tree-search" || event.key !== "Enter") return;
  event.preventDefault();
  const first = root.querySelector(".tree-canvas .tree-node:not(.dimmed)");
  if (first) { treeSelected = first.dataset.select; render(); root.querySelector("#tree-panel")?.scrollIntoView({ block: "nearest" }); }
});
document.addEventListener("change", (event) => {
  if (event.target.dataset?.photo) return uploadPhoto(event.target);
  // Choosing someone from the list selects "Someone else in the tree".
  if (event.target.name === "other") { const radio = event.target.closest("label")?.querySelector("input[type=radio]"); if (radio) radio.checked = true; }
  if (event.target.closest?.("#person")) updateApproval(event.target.closest("#person"));
  if(event.target.id === 'tree-branch') { treeBranch=event.target.value;render();return; }
  if (event.target.id === "family-select")
    run(async () => {
      familyId = event.target.value;
      snapshot = null;
      editing = null;
      treeBranch = "";
      treeSelected = "";
      treeAdding = null;
      treeQuery = "";
      postLimit = 20;
      inviteResult = null;
      render();
      await loadFamily();
      report("Family space changed.");
    });
});
if (configured) {
  supabase.auth.onAuthStateChange((event, next) => {
    session = next;
    if (event === "PASSWORD_RECOVERY") {
      mode = "reset";
      authScreen();
    } else if (event === "SIGNED_OUT") {
      snapshot = null;
      familyId = "";
      editing = null;
      treeBranch = "";
      treeSelected = "";
      treeAdding = null;
      treeQuery = "";
      loadId++;
      render();
    }
  });
  run(async () => {
    const data = await result(supabase.auth.getSession());
    session = data.session;
    const message = await emailLink();
    if (message) say(message, !/^(Email confirmed|Choose a new password)/.test(message));
    if (session && mode !== "reset") {
      await refreshFamilies();
      await loadFamily();
    } else render();
    if (!message) say("");
  });
} else authScreen();

/**
 * Links from emails. With the templates in supabase/templates, links carry a token hash
 * and work on any device. Supabase's default links carry a one-time code that only works
 * in the browser that asked for it; opened anywhere else, say so instead of failing silently.
 */
async function emailLink() {
  const params = new URLSearchParams(location.search);
  const tokenHash = params.get("token_hash"), type = params.get("type");
  const failed = params.get("error_description") || new URLSearchParams(location.hash.slice(1)).get("error_description");
  const code = params.get("code");
  if (!tokenHash && !failed && !code) return "";
  history.replaceState(null, "", location.pathname);
  if (tokenHash && ["email", "signup", "recovery"].includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return "This link has expired or was already used. Request a new one.";
    session = data.session;
    if (type === "recovery") {
      mode = "reset";
      return "Choose a new password.";
    }
    return "Email confirmed. Welcome to Roots.";
  }
  if (failed) return `${failed}. Request a new link.`;
  if (!session) return "That link only works in the browser where it was requested. Sign in, or ask for a new link here.";
  return "";
}
