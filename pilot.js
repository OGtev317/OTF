import { configured, supabase } from "./supabase-client.js";
import { decorateWelcome } from "./memory-scene.js";
import { treeView } from "./tree-view.js";
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
  loadId = 0;
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
    root.innerHTML = `<section class="welcome"><span class="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>A little closer.<br>A little more together.</h1><p>One home for family updates, shared memories, and the stories that connect us.</p><div class="card"><h2>Our family pilot is getting ready.</h2><p>Account access is not connected yet. For now, explore OTF with a fictional family.</p><a class="light-button" href="/demo.html">Explore the demo ↗</a></div></section>`;
    decorateWelcome(root);
    return;
  }
  const signup = mode === "signup",
    recovery = mode === "recover",
    reset = mode === "reset";
  root.innerHTML = `<div class="auth-grid"><section class="welcome"><span class="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>A little closer.<br>A little more together.</h1><p>Catch up on the everyday.<br>Keep the stories that matter.</p><div class="hero"><div><h2>Different branches.<br>Same roots.</h2><p>Your family space starts with an invitation.</p></div></div><a href="/demo.html">Take a look around the fictional demo →</a></section><form id="auth-form" class="card stack"><h2>${signup ? "Create your account" : recovery ? "Find your way back" : reset ? "Choose a new password" : "Welcome back"}</h2><p>${signup ? "An account does not grant family access. Join with an invitation or create your own space." : recovery ? "We’ll send a password-reset link if this email has an account." : reset ? "Use a new password with at least 12 characters." : "Sign in to your family’s space."}</p>${!reset ? field("Email", "email", "email", 'autocomplete="email" maxlength="254"') : ""}${!recovery ? field("Password", "password", "password", `minlength="12" maxlength="128" autocomplete="${signup || reset ? "new-password" : "current-password"}"`) : ""}<button>${signup ? "Create account" : recovery ? "Send reset link" : reset ? "Save new password" : "Sign in"}</button>${!reset ? `<button class="quiet" type="button" data-mode="${signup || recovery ? "signin" : "signup"}">${signup || recovery ? "Back to sign in" : "New here? Create an account"}</button>${!signup && !recovery ? '<button class="quiet" type="button" data-mode="recover">Forgot your password?</button>' : ""}` : ""}</form></div>`;
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
async function loadFamily() {
  const request = ++loadId;
  if (!familyId) {
    snapshot = null;
    render();
    return;
  }
  const fid = familyId;
  const tables = [
    "memberships",
    "posts",
    "comments",
    "reactions",
    "people",
    "events",
    "tree_contributions",
  ];
  const values = await Promise.all(
    tables.map((table) =>
      result(supabase.from(table).select("*").eq("family_id", fid)),
    ),
  );
  if (request !== loadId || !session || fid !== familyId) return;
  snapshot = Object.fromEntries(tables.map((table, i) => [table, values[i] || []]));
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
  snapshot.posts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  snapshot.comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
  snapshot.events.sort((a, b) => a.event_date.localeCompare(b.event_date));
  snapshot.invitations = owner()
    ? await result(supabase.rpc("list_invitations", { fid }))
    : [];
  if (request === loadId && session) render();
}
function owner() {
  return snapshot?.memberships.some(
    (m) => m.user_id === session?.user.id && m.role === "owner",
  );
}
const author = (id) =>
  esc(
    snapshot.memberships.find((m) => m.user_id === id)?.display_name ||
      "Former family member",
  );
function onboarding() {
  return `<div class="columns"><form id="create-family" class="card stack"><h2>Start your family space</h2><p>An empty home for your own family. You’ll be its first owner.</p>${field("Family name", "family_name", "text", 'maxlength="100"')}${field("Your name in this family", "member_name", "text", 'maxlength="100"')}<button>Create family</button></form><form id="join-family" class="card stack"><h2>Invited by a relative?</h2><p>Paste their invitation code. Each code can be used once and expires after seven days.</p>${field("Invitation code", "code", "text", 'autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200"')}${field("Your name in this family", "member_name", "text", 'maxlength="100"')}<button>Join family</button></form></div>`;
}
function feed() {
  return `<form id="post" class="card stack"><label>What’s happening in your corner?<textarea name="body" maxlength="2000" required placeholder="A small win, a memory, or just a hello…"></textarea></label><button>Share with family</button></form>${snapshot.posts.length ? "" : '<div class="card empty"><h2>Every family story starts somewhere.</h2><p>Be the first to say hello.</p></div>'}${snapshot.posts
    .map((p) => {
      const likes = snapshot.reactions.filter((r) => r.post_id === p.id),
        liked = likes.some((r) => r.user_id === session.user.id);
      return `<article class="card"><h3>${author(p.author_id)}</h3><small>${esc(new Date(p.created_at).toLocaleString())}</small><p class="post-body">${esc(p.body)}</p><button class="quiet" data-react="${p.id}" data-liked="${liked}" aria-pressed="${liked}">${liked ? "♥" : "♡"} ${likes.length} · Love this</button>${snapshot.comments
        .filter((c) => c.post_id === p.id)
        .map(
          (c) =>
            `<p class="comment"><strong>${author(c.author_id)}</strong> ${esc(c.body)}</p>`,
        )
        .join(
          "",
        )}<form class="comment-form" data-comment="${p.id}"><input name="body" maxlength="500" required aria-label="Reply to ${author(p.author_id)}" placeholder="Leave a little love…"><button>Reply</button></form></article>`;
    })
    .join("")}`;
}
function tree() {
  return treeView({...snapshot,contributions:snapshot.tree_contributions},editing,owner(),session.user.id,treeBranch);
}
function events() {
  return `<div class="columns"><section>${snapshot.events.map((e) => `<article class="card"><h2>${esc(e.title)}</h2><small>${esc(e.event_date)} · All-day gathering</small><p class="post-body">${esc(e.detail)}</p></article>`).join("") || '<div class="card"><h2>Make time for together.</h2><p>No gatherings yet. Plan something small.</p></div>'}</section><form id="event" class="card stack"><h2>Plan a gathering</h2>${field("Name", "title", "text", 'maxlength="100"')}${field("Date", "event_date", "date")}<label>Details<textarea name="detail" maxlength="500"></textarea></label><button>Add gathering</button><small>No email notifications are sent.</small></form></div>`;
}
function members() {
  return `<section class="card"><h2>Your people</h2>${snapshot.memberships.map((m) => `<div class="member"><span>${esc(m.display_name)} <small>${m.role}</small></span>${owner() && m.role !== "owner" ? `<button class="quiet" data-remove="${m.user_id}" aria-label="Remove access for ${esc(m.display_name)}">Remove access</button>` : ""}</div>`).join("")}</section>${owner() ? `<section class="card stack"><h2>Bring someone in</h2><p>Create a code and share it privately with one relative. Anyone signed in who holds the code can accept it. You can revoke it before use.</p><button id="invite">Create invitation code</button><div id="invite-code"></div><h3>Invitations</h3>${snapshot.invitations.map((i) => `<div class="member"><small>${i.revoked_at ? "Revoked" : i.used_at ? "Accepted" : Date.parse(i.expires_at) < Date.now() ? "Expired" : "Available"} · expires ${esc(new Date(i.expires_at).toLocaleDateString())}</small>${!i.used_at && !i.revoked_at ? `<button class="quiet" data-revoke="${i.id}" aria-label="Revoke invitation expiring ${esc(new Date(i.expires_at).toLocaleDateString())}">Revoke</button>` : ""}</div>`).join("") || "<p>No invitations created.</p>"}</section>` : ""}<details><summary>Create or join another family</summary>${onboarding()}</details>`;
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
const draftForms = "#post, form[data-comment], #event, form[data-tree-review]";
function formKey(form) {
  return form.id ? `#${form.id}` : form.dataset.comment ? `form[data-comment="${form.dataset.comment}"]` : form.dataset.treeReview ? `form[data-tree-review="${form.dataset.treeReview}"]` : "";
}
function controlKey(el) {
  for (const attr of ["data-react", "data-view", "data-edit", "data-remove", "data-revoke", "data-withdraw"])
    if (el.hasAttribute(attr)) return `[${attr}="${el.getAttribute(attr)}"]`;
  if (el.id) return `#${el.id}`;
  const form = el.closest("form"), scope = form && formKey(form);
  if (!scope) return "";
  return el.name ? `${scope} [name="${el.name}"]${el.type==='checkbox' ? `[value="${el.value}"]` : ''}` : el.tagName === "BUTTON" ? `${scope} button` : "";
}
function render() {
  document.body.classList.remove('photo-welcome','network-welcome');
  const sameFamily = Boolean(session && root.dataset.familyId === familyId);
  const oldPerson = sameFamily && savedForm !== '#person' ? root.querySelector('#person') : null;
  const personKey = oldPerson?.dataset.person;
  const personDraft = oldPerson ? [...oldPerson.querySelectorAll('[name]')].map(el=>[el.name,el.value,el.checked]) : [];
  const active = root.contains(document.activeElement) ? controlKey(document.activeElement) : "";
  const drafts = [...root.querySelectorAll(draftForms)]
    .filter((form) => sameFamily && formKey(form) !== savedForm)
    .flatMap((form) => [...form.querySelectorAll("input, textarea")].filter((el) => el.value).map((el) => [controlKey(el), el.value]));
  paint();
  root.dataset.familyId = session ? familyId : '';
  const newPerson = root.querySelector('#person');
  if(newPerson && newPerson.dataset.person === personKey) {
    for(const [name,value,checked] of personDraft) {
      if(name==='parents') {
        const el=[...newPerson.querySelectorAll('[name=parents]')].find(el=>el.value===value);
        if(el) el.checked=checked;
      } else { const el=newPerson.elements.namedItem(name); if(el) el.value=value; }
    }
  }
  for (const [key, value] of drafts) {
    const el = key && root.querySelector(key);
    if (el && !el.value) el.value = value;
  }
  if (active) root.querySelector(active)?.focus({ preventScroll: true });
}
function paint() {
  if (!session || mode === "reset") return authScreen();
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
    ["feed", "Family home"],
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
      editing = null;
      treeBranch = "";
      await refreshFamilies();
      await loadFamily();
      say("Welcome to your family space.");
    } else if (form.id === "post") await mutate("post", data, form);
    else if (form.dataset.comment)
      await mutate("comment", { ...data, post_id: form.dataset.comment }, form);
    else if (form.id === "event") await mutate("event", data, form);
    else if (form.id === "person") {
      const proposedEdit = Boolean(editing && !owner());
      const payload = {
        ...data,
        parents: new FormData(form).getAll("parents"),
        ...(editing ? { id: editing.id, version: editing.version } : {}),
      };
      await result(
        supabase.rpc("tree_action", {
          fid: familyId,
          action: "save",
          payload,
        }),
      );
      editing = null;
      form.reset();
      savedForm = '#person';
      try { await loadFamily(); } finally { savedForm = ''; }
      report(proposedEdit ? "Edit submitted for owner approval. The current record is unchanged." : "Relative saved to your family tree.");
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
  if (
    !["logout", "refresh", "invite"].includes(button.id) &&
    !button.dataset.react &&
    !button.dataset.remove &&
    !button.dataset.withdraw &&
    !button.dataset.revoke
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
      loadId++;
      render();
      say("Signed out.");
    } else if (button.id === "refresh") {
      await refreshFamilies();
      await loadFamily();
      report("Up to date.");
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
    else if (button.id === "invite") {
      const code = await result(
        supabase.rpc("create_invitation", { fid: familyId }),
      );
      await loadFamily();
      document.querySelector("#invite-code").innerHTML =
        `<label>Copy this code and share it privately<input readonly value="${esc(code)}"></label><small>This code is shown once. It expires in seven days.</small>`;
      say("Invitation ready. No message has been sent.");
    } else say("");
  });
});
document.addEventListener("change", (event) => {
  if(event.target.id === 'tree-branch') { treeBranch=event.target.value;render();return; }
  if (event.target.id === "family-select")
    run(async () => {
      familyId = event.target.value;
      snapshot = null;
      editing = null;
      treeBranch = "";
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
    return "Email confirmed. Welcome to OTF.";
  }
  if (failed) return `${failed}. Request a new link.`;
  if (!session) return "That link only works in the browser where it was requested. Sign in, or ask for a new link here.";
  return "";
}
