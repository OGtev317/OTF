import { configured, supabase } from "./supabase-client.js";
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
  loading = false,
  loadId = 0;
const say = (text) => {
  status.textContent = text;
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
    return;
  }
  const signup = mode === "signup",
    recovery = mode === "recover",
    reset = mode === "reset";
  root.innerHTML = `<div class="auth-grid"><section class="welcome"><span class="eyebrow">YOUR PEOPLE. YOUR PLACE.</span><h1>A little closer.<br>A little more together.</h1><p>Catch up on the everyday.<br>Keep the stories that matter.</p><div class="hero"><div><h2>Different branches.<br>Same roots.</h2><p>Your family space starts with an invitation.</p></div></div><a href="/demo.html">Take a look around the fictional demo →</a></section><form id="auth-form" class="card stack"><h2>${signup ? "Create your account" : recovery ? "Find your way back" : reset ? "Choose a new password" : "Welcome back"}</h2><p>${signup ? "An account does not grant family access. Join with an invitation or create your own space." : recovery ? "We’ll send a password-reset link if this email has an account." : reset ? "Use a new password with at least 12 characters." : "Sign in to your family’s space."}</p>${!reset ? field("Email", "email", "email", 'autocomplete="email" maxlength="254"') : ""}${!recovery ? field("Password", "password", "password", `minlength="12" maxlength="128" autocomplete="${signup || reset ? "new-password" : "current-password"}"`) : ""}<button>${signup ? "Create account" : recovery ? "Send reset link" : reset ? "Save new password" : "Sign in"}</button>${!reset ? `<button class="quiet" type="button" data-mode="${signup || recovery ? "signin" : "signup"}">${signup || recovery ? "Back to sign in" : "New here? Create an account"}</button>${!signup && !recovery ? '<button class="quiet" type="button" data-mode="recover">Forgot your password?</button>' : ""}` : ""}</form></div>`;
}
async function refreshFamilies() {
  families = await result(
    supabase.from("families").select("id,name").order("created_at"),
  );
  if (!families.some((f) => f.id === familyId))
    familyId = families[0]?.id || "";
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
  ];
  const values = await Promise.all(
    tables.map((table) =>
      result(supabase.from(table).select("*").eq("family_id", fid)),
    ),
  );
  if (request !== loadId || !session || fid !== familyId) return;
  snapshot = Object.fromEntries(tables.map((table, i) => [table, values[i]]));
  if (!snapshot.memberships.some((m) => m.user_id === session.user.id)) {
    snapshot = null;
    await refreshFamilies();
    return loadFamily();
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
  return `<div class="columns"><form id="create-family" class="card stack"><h2>Start your family space</h2><p>An empty home for your own family. You’ll be its first owner.</p>${field("Family name", "family_name", "text", 'maxlength="100"')}${field("Your name in this family", "member_name", "text", 'maxlength="100"')}<button>Create family</button></form><form id="join-family" class="card stack"><h2>Invited by a relative?</h2><p>Paste their invitation code. Each code can be used once and expires after seven days.</p>${field("Invitation code", "code", "text", 'autocomplete="off" maxlength="64" minlength="64"')}${field("Your name in this family", "member_name", "text", 'maxlength="100"')}<button>Join family</button></form></div>`;
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
  const p = editing || { name: "", story: "", parents: [] };
  return `<div class="section-title"><h2>The people in our story</h2><small>${owner() ? "You manage the tree during this pilot." : "Your family owner manages tree edits."}</small></div><div class="people">${snapshot.people.map((person) => `<article class="card relative"><h2>${esc(person.name)}</h2><p class="post-body">${esc(person.story) || "Their story is waiting to be told."}</p><small>${person.parents.length ? "Child of " + person.parents.map((id) => esc(snapshot.people.find((x) => x.id === id)?.name || "Unknown")).join(" & ") : "Parents not recorded"}</small>${owner() ? `<button class="quiet" data-edit="${person.id}">Edit story</button>` : ""}</article>`).join("") || "<p>No relatives recorded yet. Tree records do not need login accounts.</p>"}</div>${
    owner()
      ? `<form id="person" class="card stack"><h2>${editing ? "Edit relative" : "Add a relative"}</h2><label>Full name<input name="name" required maxlength="100" value="${esc(p.name)}"></label><label>Their story<textarea name="story" maxlength="2000">${esc(p.story)}</textarea></label><fieldset><legend>Known parents</legend><small>Relationships are unspecified for now. Leave blank if unknown.</small>${snapshot.people
          .filter((x) => x.id !== p.id)
          .map(
            (x) =>
              `<label class="check"><input name="parents" type="checkbox" value="${x.id}" ${p.parents.includes(x.id) ? "checked" : ""}>${esc(x.name)}</label>`,
          )
          .join(
            "",
          )}</fieldset><button>Save relative</button>${editing ? '<button type="button" class="quiet" id="cancel-edit">Cancel edit</button>' : ""}</form>`
      : ""
  }`;
}
function events() {
  return `<div class="columns"><section>${snapshot.events.map((e) => `<article class="card"><h2>${esc(e.title)}</h2><small>${esc(e.event_date)} · All-day gathering</small><p class="post-body">${esc(e.detail)}</p></article>`).join("") || '<div class="card"><h2>Make time for together.</h2><p>No gatherings yet. Plan something small.</p></div>'}</section><form id="event" class="card stack"><h2>Plan a gathering</h2>${field("Name", "title", "text", 'maxlength="100"')}${field("Date", "event_date", "date")}<label>Details<textarea name="detail" maxlength="500"></textarea></label><button>Add gathering</button><small>No email notifications are sent.</small></form></div>`;
}
function members() {
  return `<section class="card"><h2>Your people</h2>${snapshot.memberships.map((m) => `<div class="member"><span>${esc(m.display_name)} <small>${m.role}</small></span>${owner() && m.role !== "owner" ? `<button class="quiet" data-remove="${m.user_id}">Remove access</button>` : ""}</div>`).join("")}</section>${owner() ? `<section class="card stack"><h2>Bring someone in</h2><p>Create a code and share it privately with one relative. Anyone signed in who holds the code can accept it. You can revoke it before use.</p><button id="invite">Create invitation code</button><div id="invite-code"></div><h3>Invitations</h3>${snapshot.invitations.map((i) => `<div class="member"><small>${i.revoked_at ? "Revoked" : i.used_at ? "Accepted" : Date.parse(i.expires_at) < Date.now() ? "Expired" : "Available"} · expires ${esc(new Date(i.expires_at).toLocaleDateString())}</small>${!i.used_at && !i.revoked_at ? `<button class="quiet" data-revoke="${i.id}">Revoke</button>` : ""}</div>`).join("") || "<p>No invitations created.</p>"}</section>` : ""}<details><summary>Create or join another family</summary>${onboarding()}</details>`;
}
function render() {
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
    say(error.message || "Something went wrong. Please try again.");
  } finally {
    loading = false;
  }
}
async function mutate(action, payload) {
  await result(
    supabase.rpc("family_action", { fid: familyId, action, payload }),
  );
  await loadFamily();
  say("Saved to your family space.");
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
        );
      } else if (mode === "recover") {
        await result(
          supabase.auth.resetPasswordForEmail(data.email, { redirectTo }),
        );
        form.reset();
        say("If this account exists, a reset link is on its way.");
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
      if (data.code) data.code = data.code.trim();
      familyId = await result(
        supabase.rpc(
          form.id === "create-family" ? "create_family" : "accept_invitation",
          data,
        ),
      );
      await refreshFamilies();
      await loadFamily();
      say("Welcome to your family space.");
    } else if (form.id === "post") await mutate("post", data);
    else if (form.dataset.comment)
      await mutate("comment", { ...data, post_id: form.dataset.comment });
    else if (form.id === "event") await mutate("event", data);
    else if (form.id === "person") {
      const payload = {
        ...data,
        parents: new FormData(form).getAll("parents"),
        ...(editing ? { id: editing.id, version: editing.version } : {}),
      };
      await result(
        supabase.rpc("family_action", {
          fid: familyId,
          action: "person",
          payload,
        }),
      );
      editing = null;
      await loadFamily();
      say("Family tree saved.");
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
    !button.dataset.revoke
  )
    return;
  run(async () => {
    if (button.id === "logout") {
      await result(supabase.auth.signOut());
      session = null;
      snapshot = null;
      familyId = "";
      loadId++;
      render();
      say("Signed out.");
    } else if (button.id === "refresh") {
      await refreshFamilies();
      await loadFamily();
      say("Up to date.");
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
  if (event.target.id === "family-select")
    run(async () => {
      familyId = event.target.value;
      snapshot = null;
      editing = null;
      render();
      await loadFamily();
      say("Family space changed.");
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
      loadId++;
      render();
    }
  });
  run(async () => {
    const data = await result(supabase.auth.getSession());
    session = data.session;
    if (session && mode !== "reset") {
      await refreshFamilies();
      await loadFamily();
    } else render();
    say("");
  });
} else authScreen();
