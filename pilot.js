import { configured, supabase } from "./supabase-client.js";
import { decorateWelcome, decorateMember } from "./memory-scene.js";
import { treeView } from "./tree-view.js";
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
{
  const code = new URLSearchParams(location.search).get("invite");
  if (code) {
    if (/^[0-9a-f]{64}$/i.test(code)) keepInvite(code.toLowerCase());
    history.replaceState(null, "", location.pathname);
  }
}
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
  root.innerHTML = `<div class="auth-grid"><section class="welcome"><span class="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>A little closer.<br>A little more together.</h1><p>Catch up on the everyday.<br>Keep the stories that matter.</p><div class="hero"><div><h2>Different branches.<br>Same roots.</h2><p>Your family space starts with an invitation.</p></div></div><a href="/demo.html">Take a look around the fictional demo →</a></section><form id="auth-form" class="card stack">${pendingInvite() && !reset ? '<p class="kin-note">You have an invitation. Sign in, or create an account, with the email address it was sent to.</p>' : ""}<h2>${signup ? "Create your account" : recovery ? "Find your way back" : reset ? "Choose a new password" : "Welcome back"}</h2><p>${signup ? "An account does not grant family access. Join with an invitation or create your own space." : recovery ? "We’ll send a password-reset link if this email has an account." : reset ? "Use a new password with at least 12 characters." : "Sign in to your family’s space."}</p>${!reset ? field("Email", "email", "email", 'autocomplete="email" maxlength="254"') : ""}${!recovery ? field("Password", "password", "password", `minlength="12" maxlength="128" autocomplete="${signup || reset ? "new-password" : "current-password"}"`) : ""}<button>${signup ? "Create account" : recovery ? "Send reset link" : reset ? "Save new password" : "Sign in"}</button>${!reset ? `<button class="quiet" type="button" data-mode="${signup || recovery ? "signin" : "signup"}">${signup || recovery ? "Back to sign in" : "New here? Create an account"}</button>${!signup && !recovery ? '<button class="quiet" type="button" data-mode="recover">Forgot your password?</button>' : ""}` : ""}</form></div>`;
  decorateWelcome(root);
}
async function refreshFamilies() {
  const current = families.find((f) => f.id === familyId);
  families = await result(
    supabase.from("families").select("id,name").order("created_at"),
  );
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
  snapshot = { memberships, people, life_profiles, posts: shown, comments, reactions, events, past_events: past_events || [], tree_contributions: [...pending, ...(decided || [])] };
  morePosts = (posts || []).length > postLimit;
  if (!snapshot.memberships.some((m) => m.user_id === session.user.id)) {
    const lost = families.find((f) => f.id === fid)?.name;
    snapshot = null;
    editing = null;
    treeBranch = "";
    await refreshFamilies();
    await loadFamily();
    if (lost) removedFrom = lost;
    return;
  }
  // Owners see every invitation; members see the ones they sent.
  const invitations = await result(supabase.rpc("list_invitations", { fid }));
  if (request !== loadId || !session || fid !== familyId) return;
  snapshot.invitations = invitations || [];
  render();
}
function owner() {
  return snapshot?.memberships.some(
    (m) => m.user_id === session?.user.id && m.role === "owner",
  );
}
const myPerson = () => snapshot?.memberships.find((m) => m.user_id === session?.user.id)?.person_id || "";
function onboarding() {
  const invite = pendingInvite();
  return `${invite ? '<p class="card kin-note">You have an invitation. Join below with the email address it was sent to.</p>' : ""}<div class="columns"><form id="create-family" class="card stack"><h2>Start your family space</h2><p>An empty home for your own family. You’ll be its first owner.</p>${field("Family name", "family_name", "text", 'maxlength="100"')}${field("Your name in this family", "member_name", "text", 'maxlength="100"')}<button>Create family</button></form><form id="join-family" class="card stack"><h2>Invited by a relative?</h2><p>Open the link from your invitation email, or paste its code. It works once, only for the email address it was sent to, and expires after seven days.</p>${field("Invitation code", "code", "text", `autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200" value="${esc(invite)}"`)}${field("Your name in this family", "member_name", "text", 'maxlength="100"')}<button>Join family</button></form></div>`;
}
function feed() {
  return familyFeed(snapshot, session.user.id, morePosts);
}
function tree() {
  return treeView({ ...snapshot, contributions: snapshot.tree_contributions }, editing, owner(), session.user.id, treeBranch);
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
function members() {
  const me = session.user.id, isOwner = owner();
  const name = (id) => esc(snapshot.people.find((p) => p.id === id)?.name || "someone no longer in the tree");
  const profile = snapshot.life_profiles.find((p) => p.user_id === me) || {};
  const open = snapshot.people.filter((p) => p.life_status !== "deceased" && !snapshot.memberships.some((m) => m.person_id === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const status = (i) => (i.revoked_at ? "Revoked" : i.used_at ? "Accepted" : Date.parse(i.expires_at) < Date.now() ? "Expired" : "Waiting");
  const sent = inviteResult && invitationMessage(inviteResult);
  const roster = snapshot.memberships.map((m) => {
    const about = snapshot.life_profiles.find((p) => p.user_id === m.user_id && (p.about || p.work || p.share));
    return `<div class="member"><span>${esc(m.display_name)} <small>${m.role}</small>${m.person_id ? `<small class="kin-account">In the tree as ${name(m.person_id)}</small>` : m.claim_person_id ? `<small class="kin-account">Asked to be linked to ${name(m.claim_person_id)}</small>` : ""}${about ? `<details><summary>About ${esc(m.display_name)}</summary>${about.about ? `<p class="post-body">${esc(about.about)}</p>` : ""}${about.work ? `<p><strong>Work:</strong> ${esc(about.work)}</p>` : ""}${about.share ? `<p><strong>For the family:</strong> ${esc(about.share)}</p>` : ""}</details>` : ""}</span><span class="tree-actions">${isOwner && m.person_id && m.user_id !== me ? `<button class="quiet" data-unlink="${m.user_id}" aria-label="Remove the tree link for ${esc(m.display_name)}">Remove link</button>` : ""}${isOwner && m.role !== "owner" ? `<button class="quiet" data-remove="${m.user_id}" aria-label="Remove access for ${esc(m.display_name)}">Remove access</button>` : ""}</span></div>`;
  }).join("");
  return `<section class="card"><h2>Your people</h2>${roster}</section><form id="profile" class="card stack"><h2>Your life profile</h2><p>What you want this family to know about you. Only members of this family can see it, and only you can change it.</p><label>About you<textarea name="about" maxlength="1000">${esc(profile.about)}</textarea></label><label>Work<input name="work" maxlength="300" value="${esc(profile.work)}"></label><label>Anything else for the family<textarea name="share" maxlength="1000" placeholder="Interests, news, how best to reach you…">${esc(profile.share)}</textarea></label><button>Save profile</button></form><section class="card stack"><h2>Invite a relative</h2><form id="invite-form" class="stack"><p>Say who you are inviting and where they are in the family tree. The invitation works only for their email address, and joining links their account to that place in the tree.</p><label>Their email address<input name="email" type="email" required maxlength="254" autocomplete="off"></label><label>Who are they in the family tree?<select name="person" ${isOwner ? "" : "required"}>${isOwner ? '<option value="">Not in the tree yet — they can find themselves later</option>' : '<option value="">Choose a person</option>'}${open.map((p) => { const relation = relationTo(snapshot.people, myPerson(), p.id); return `<option value="${p.id}">${esc(p.name)}${relation && relation !== "you" ? ` — your ${esc(relation)}` : ""}</option>`; }).join("")}</select></label><small>Not listed? Add them in Family tree first, then invite them. People who have died, and people already linked to an account, are not listed.</small><button>Create invitation</button></form><div id="invite-code">${sent ? `<p><strong>Invitation ready for ${esc(inviteResult.email)}${sent.name ? ` as ${esc(sent.name)}` : ""}.</strong> Roots does not send email yet: open it in your email app, or copy the link.</p><a class="light-button" href="${esc(sent.mailto)}">Open in your email app</a><label>Invitation link<input readonly value="${esc(sent.link)}"></label><small>Shown once. Anyone else who gets this link cannot use it: it works only for ${esc(inviteResult.email)}.</small>` : ""}</div><h3>${isOwner ? "Invitations" : "Invitations you sent"}</h3>${snapshot.invitations.map((i) => `<div class="member"><small>${status(i)} · ${esc(i.email || "Code without an address")}${i.person_id ? ` · as ${name(i.person_id)}` : ""}${isOwner && i.invited_by && i.invited_by !== me ? ` · sent by ${esc(snapshot.memberships.find((m) => m.user_id === i.invited_by)?.display_name || "a former member")}` : ""} · expires ${esc(new Date(i.expires_at).toLocaleDateString())}</small>${!i.used_at && !i.revoked_at ? `<button class="quiet" data-revoke="${i.id}" aria-label="Revoke invitation for ${esc(i.email || "code")}">Revoke</button>` : ""}</div>`).join("") || "<p>No invitations yet.</p>"}</section><details ${pendingInvite() ? "open" : ""}><summary>Create or join another family</summary>${onboarding()}</details>`;
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
const draftForms = "#post, form[data-comment], #event, form[data-tree-review], #profile, #invite-form";
function formKey(form) {
  return form.id ? `#${form.id}` : form.dataset.comment ? `form[data-comment="${form.dataset.comment}"]` : form.dataset.treeReview ? `form[data-tree-review="${form.dataset.treeReview}"]` : "";
}
function controlKey(el) {
  for (const attr of ["data-react", "data-view", "data-edit", "data-remove", "data-revoke", "data-withdraw", "data-claim", "data-unlink", "data-approve-claim", "data-decline-claim"])
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
  if (active) root.querySelector(active)?.focus({ preventScroll: true });
}
function paint() {
  if (!session || mode === "reset") return authScreen();
  decorateMember();
  document.querySelector("#account").innerHTML =
    '<button class="quiet" id="logout">Sign out</button>';
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
    ["members", "Members"],
  ]
    .map(
      ([id, label]) =>
        `<button class="${view === id ? "selected" : ""}" data-view="${id}" ${view === id ? 'aria-current="page"' : ""}>${label}</button>`,
    )
    .join(
      "",
    )}</nav><section id="family-content">${view === "tree" ? tree() : view === "events" ? events() : view === "members" ? members() : feed()}</section>`;
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
        document.querySelector("#account").innerHTML = '<button class="quiet" id="logout">Sign out</button>';
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
      const fields = new FormData(form), me = myPerson();
      const parents = fields.getAll("parents"), partners = fields.getAll("partners"), parent_kinds = {};
      for (const id of parents) if (fields.get(`kind:${id}`) && fields.get(`kind:${id}`) !== "unspecified") parent_kinds[id] = fields.get(`kind:${id}`);
      // "Their relationship to you" becomes ordinary links; "my parent" also updates your own record.
      const relation = data.relation_to_me;
      if (relation === "child" && !parents.includes(me)) parents.push(me);
      if (relation === "partner" && !partners.includes(me)) partners.push(me);
      if (relation === "sibling") {
        const mine = snapshot.people.find((p) => p.id === me)?.parents || [];
        if (!mine.length) throw new Error("Add your own parents to your record first, so brothers and sisters are linked through them.");
        for (const id of mine) if (!parents.includes(id)) parents.push(id);
      }
      const payload = {
        name: data.name, branch: data.branch, life_status: data.life_status, birth_date: data.birth_date, death_date: data.death_date,
        story: data.story, source_note: data.source_note, parents, partners, parent_kinds,
        ...(relation === "parent" ? { my_parent: true } : {}),
        ...(editing ? { id: editing.id, version: editing.version } : {}),
      };
      const id = await result(supabase.rpc("tree_action", { fid: familyId, action: "save", payload }));
      const wasEditing = Boolean(editing);
      editing = null;
      form.reset();
      savedForm = '#person';
      try { await loadFamily(); } finally { savedForm = ''; }
      // The answer is the person, or the proposal waiting for approval.
      const proposed = snapshot?.tree_contributions.some((c) => c.id === id);
      report(!proposed ? "Relative saved to your family tree." : wasEditing ? "Edit submitted for approval. The current record is unchanged." : "Sent for approval. Memorial records, and links to them, are kept by immediate family; it appears once one of them approves.");
    } else if (form.id === "profile") {
      await result(supabase.rpc("tree_action", { fid: familyId, action: "profile", payload: data }));
      savedForm = "#profile";
      try { await loadFamily(); } finally { savedForm = ""; }
      report("Profile saved.");
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
    render();
    return;
  }
  if (button.dataset.edit) {
    editing = snapshot.people.find((p) => p.id === button.dataset.edit);
    render();
    document.querySelector("#person").scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (button.id === "cancel-edit") {
    editing = null;
    render();
    return;
  }
  const treeAction = ["claim", "unlink", "approveClaim", "declineClaim"].find((key) => button.dataset[key]);
  if (
    !["logout", "refresh", "more-posts"].includes(button.id) &&
    !button.dataset.react &&
    !button.dataset.remove &&
    !button.dataset.withdraw &&
    !button.dataset.revoke &&
    !treeAction
  )
    return;
  run(async () => {
    if (button.id === "logout") {
      await result(supabase.auth.signOut());
      session = null;
      snapshot = null;
      familyId = "";
      editing = null;
      treeBranch = "";
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
  if (event.target.id !== "relative-filter") return;
  const text = event.target.value.trim().toLowerCase();
  for (const label of root.querySelectorAll(".kin-list .check")) label.hidden = Boolean(text) && !label.textContent.toLowerCase().includes(text) && !label.querySelector("input").checked;
});
document.addEventListener("change", (event) => {
  if(event.target.id === 'tree-branch') { treeBranch=event.target.value;render();return; }
  if (event.target.id === "family-select")
    run(async () => {
      familyId = event.target.value;
      snapshot = null;
      editing = null;
      treeBranch = "";
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
