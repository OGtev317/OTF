// The fictional demo runs the real family app (pilot.js) against this in-browser stand-in for
// Supabase, so the demo always looks and behaves like the signed-in app. Records are fictional
// and stay in this browser. The rules mirror the database: kinship.js decides who may change what.
import { mayAdd, mayApply, mayPhoto } from "./kinship.js";

const KEY = "roots-demo-v1", ME = "demo-you", FAMILY = "demo-bennetts";
const PARENT_KINDS = ["biological", "adoptive", "step", "guardian", "unspecified"];
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const nextSunday = () => (7 - new Date().getDay()) % 7 || 7;

function person(id, name, extra = {}) {
  return { id, family_id: FAMILY, name, story: "", parents: [], parent_kinds: {}, partners: [], branch: "", life_status: "living", birth_date: null, death_date: null, source_note: "", version: 1, added_by: ME, added_at: hoursAgo(24 * 60), ...extra };
}
function seed() {
  const member = (user_id, display_name, role, person_id, claim_person_id = null) => ({ family_id: FAMILY, user_id, display_name, role, person_id, claim_person_id });
  return {
    version: 1,
    families: [{ id: FAMILY, name: "The Bennetts", created_at: hoursAgo(24 * 90) }],
    memberships: [
      member(ME, "Jordan", "owner", "jordan"),
      member("demo-maya", "Maya", "member", "maya"),
      member("demo-leo", "Leo", "member", "leo"),
      member("demo-ava", "Ava", "member", null, "ava"),
    ],
    people: [
      person("rose", "Rose Bennett", { life_status: "deceased", birth_date: "1938-03-14", death_date: "2019-11-02", partners: ["james"], branch: "Shared roots", story: "Keeper of the Sunday recipes and our favorite family stories.", source_note: "Funeral program and Maya’s recollection (fictional).", added_by: "demo-maya" }),
      person("james", "James Bennett", { birth_date: "1936-07-02", branch: "Shared roots", story: "Always has something growing, and a story to go with it." }),
      person("maya", "Maya Bennett", { parents: ["rose", "james"], partners: ["sam"], branch: "Maya’s household", story: "There is always room for one more at my table." }),
      person("sam", "Sam Rivera", { branch: "Maya’s household", story: "Makes the best lemonade at every gathering." }),
      person("leo", "Leo Bennett", { parents: ["rose", "james"], branch: "Leo’s household", story: "Collecting little moments and taking the scenic route." }),
      person("jordan", "Jordan Bennett", { parents: ["maya"], branch: "Maya’s household", story: "That’s you, in this fictional family." }),
      person("ava", "Ava Bennett", { parents: ["leo"], branch: "Leo’s household", story: "Just started a new job in the city." }),
    ],
    posts: [
      { id: "post-dinner", family_id: FAMILY, author_id: "demo-maya", body: "Sunday dinner at my place? Bring your favorite dish and a story from the week. I’m making Grandma Rose’s pasta.", created_at: hoursAgo(3) },
      { id: "post-recipe", family_id: FAMILY, author_id: "demo-leo", body: "Found one of Mom’s old recipe cards tucked inside a book. Funny how the smallest things bring back a whole afternoon.", created_at: hoursAgo(26) },
      { id: "post-job", family_id: FAMILY, author_id: "demo-ava", body: "First week at the new job done! Thank you all for the good-luck messages.", created_at: hoursAgo(80) },
    ],
    comments: [
      { id: "c1", family_id: FAMILY, post_id: "post-dinner", author_id: "demo-leo", body: "I’ll bring the lemon cake!", created_at: hoursAgo(2) },
      { id: "c2", family_id: FAMILY, post_id: "post-recipe", author_id: "demo-maya", body: "Is it the one with the cinnamon rolls? Save it for me!", created_at: hoursAgo(20) },
    ],
    reactions: [
      { family_id: FAMILY, post_id: "post-dinner", user_id: "demo-leo" },
      { family_id: FAMILY, post_id: "post-dinner", user_id: "demo-ava" },
      { family_id: FAMILY, post_id: "post-recipe", user_id: "demo-maya" },
      { family_id: FAMILY, post_id: "post-job", user_id: "demo-maya" },
      { family_id: FAMILY, post_id: "post-job", user_id: "demo-leo" },
    ],
    events: [
      { id: "e-dinner", family_id: FAMILY, author_id: "demo-maya", title: "Sunday at Maya’s", event_date: localDate(nextSunday()), detail: "A meal, a few stories, and everyone together." },
      { id: "e-reunion", family_id: FAMILY, author_id: ME, title: "Bennett family reunion", event_date: localDate(60), detail: "At the lake. Bring chairs." },
      { id: "e-picnic", family_id: FAMILY, author_id: "demo-leo", title: "Picnic for Grandma Rose’s birthday", event_date: localDate(-30), detail: "Her favorite park, her favorite cake." },
    ],
    tree_contributions: [
      { id: "proposal-james", family_id: FAMILY, person_id: "james", submitted_by: "demo-leo", base_version: 1, before_record: person("james", "James Bennett", { birth_date: "1936-07-02", branch: "Shared roots", story: "Always has something growing, and a story to go with it." }), proposed_record: { ...person("james", "James Bennett", { birth_date: "1936-07-02", branch: "Shared roots", story: "Always has something growing, and a story to go with it. Won the county fair for his tomatoes three years running." }) }, status: "pending", submitted_at: hoursAgo(5), reviewed_by: null, reviewed_at: null, review_note: "" },
    ],
    life_profiles: [
      { family_id: FAMILY, user_id: "demo-maya", about: "Teacher, gardener, and the family’s official dinner host.", work: "Third-grade teacher", share: "Text me before you visit so I can save you a plate.", updated_at: hoursAgo(48) },
      { family_id: FAMILY, user_id: "demo-leo", about: "Happiest on a long drive with good music.", work: "Bus driver", share: "", updated_at: hoursAgo(72) },
    ],
    // Uploaded photos, by storage path, as data URLs kept in this browser.
    photos: {},
    invitations: [
      { id: "invite-sam", family_id: FAMILY, code: "", email: "sam@example.com", person_id: "sam", invited_by: ME, expires_at: new Date(Date.now() + 5 * 864e5).toISOString(), used_at: null, revoked_at: null },
    ],
  };
}

let db = load();
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.version === 1) return { photos: {}, ...saved };
  } catch {}
  return seed();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
}
export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch {}
  db = seed();
}

// Query builder with the filters, ordering and ranges pilot.js uses.
function query(table) {
  const filters = [], sort = [];
  let from = 0, to = Infinity;
  const builder = {
    select: () => builder,
    eq: (k, v) => (filters.push((r) => r[k] === v), builder),
    neq: (k, v) => (filters.push((r) => r[k] !== v), builder),
    in: (k, vs) => (filters.push((r) => vs.includes(r[k])), builder),
    gte: (k, v) => (filters.push((r) => r[k] >= v), builder),
    lt: (k, v) => (filters.push((r) => r[k] < v), builder),
    order: (k, { ascending = true } = {}) => (sort.push([k, ascending]), builder),
    range: (a, b) => ((from = a), (to = b), builder),
    limit: (n) => ((to = from + n - 1), builder),
    then(resolve, reject) {
      try {
        const own = new Set(db.memberships.filter((m) => m.user_id === ME).map((m) => m.family_id));
        const rows = structuredClone(db[table] || []).filter((r) => (table === "families" ? own.has(r.id) : own.has(r.family_id)) && filters.every((f) => f(r)));
        rows.sort((a, b) => {
          for (const [k, up] of sort) {
            const c = String(a[k] ?? "").localeCompare(String(b[k] ?? ""));
            if (c) return up ? c : -c;
          }
          return 0;
        });
        resolve({ data: rows.slice(from, to + 1), error: null });
      } catch (error) {
        reject(error);
      }
    },
  };
  return builder;
}

const fail = (message) => { throw new Error(message); };
const membership = (fid) => db.memberships.find((m) => m.family_id === fid && m.user_id === ME);
const owner = (fid) => membership(fid)?.role === "owner";
const need = (fid) => membership(fid) || fail("Family access denied");
const peopleOf = (fid) => db.people.filter((p) => p.family_id === fid);
const rules = (fid) => ({ people: peopleOf(fid), memberships: db.memberships.filter((m) => m.family_id === fid) });

function treeRecord(fid, target, payload) {
  const name = String(payload.name ?? "").trim(), state = payload.life_status || "unknown";
  const born = payload.birth_date || null, died = payload.death_date || null, today = localDate();
  if (!name || name.length > 100) fail("Enter a name of 1–100 characters");
  if (String(payload.story || "").length > 2000 || String(payload.branch || "").length > 100 || String(payload.source_note || "").length > 1000) fail("A tree field is too long");
  if (!["unknown", "living", "deceased"].includes(state)) fail("Choose a valid life status");
  if (died && state !== "deceased") fail("A death date requires deceased status");
  if ((born && born > today) || (died && died > today) || (born && died && born > died)) fail("Check the birth and death dates");
  if (state === "deceased" && !String(payload.source_note || "").trim()) fail("Add a source for this memorial record: who or what the details come from.");
  const people = peopleOf(fid), here = (id) => people.some((p) => p.id === id);
  const parents = [...(payload.parents || [])], partners = [...(payload.partners || [])];
  if (parents.length > 8 || new Set(parents).size !== parents.length) fail("Invalid or duplicate parents");
  if (parents.some((x) => !x || x === target || !here(x))) fail("Parent must be another person in this family");
  if (partners.length > 4 || new Set(partners).size !== partners.length) fail("Invalid or duplicate partners");
  if (partners.some((x) => !x || x === target || parents.includes(x) || !here(x))) fail("A partner must be another person in this family, not also their parent");
  for (const stack = [...parents], seen = new Set(); stack.length; ) {
    const x = stack.pop();
    if (x === target) fail("This relationship would create an ancestry loop");
    if (!seen.has(x)) { seen.add(x); stack.push(...(people.find((p) => p.id === x)?.parents || [])); }
  }
  const parent_kinds = {};
  for (const [id, kind] of Object.entries(payload.parent_kinds || {})) {
    if (!PARENT_KINDS.includes(kind)) fail("Choose a valid parent relationship");
    if (parents.includes(id) && kind !== "unspecified") parent_kinds[id] = kind;
  }
  return { name, story: payload.story || "", parents, parent_kinds, partners, branch: String(payload.branch || "").trim(), life_status: state, birth_date: born, death_date: died, source_note: payload.source_note || "" };
}
function applyPerson(fid, target, record, author) {
  const old = db.people.find((p) => p.id === target && p.family_id === fid);
  if (old) Object.assign(old, record, { version: old.version + 1 });
  else db.people.push({ id: target, family_id: fid, ...record, version: 1, added_by: author, added_at: now() });
}
function addParent(fid, child, parent) {
  const me = db.people.find((p) => p.id === child && p.family_id === fid) || fail("Your place in the tree is unavailable");
  me.parents = [...me.parents, parent];
  me.version += 1;
}

function treeAction(fid, action, payload = {}) {
  need(fid);
  const me = membership(fid).person_id;
  if (action === "save") {
    let target = payload.id || null;
    const old = target ? db.people.find((p) => p.id === target && p.family_id === fid) || fail("Person unavailable") : undefined;
    if (old && old.version !== Number(payload.version || 0)) fail("This person changed. Refresh and reopen the record before editing.");
    target ||= uid();
    const proposed = treeRecord(fid, target, { ...(old || {}), ...payload });
    // A new person can be added as the parent of someone already in the tree.
    let extra = "";
    if (payload.my_parent) { if (!me) fail("Link your account to your place in the tree first"); extra = me; }
    else if (payload.parent_of) extra = payload.parent_of;
    if (extra) {
      if (old) fail("A new parent is added as a new person. To link someone already in the tree as a parent, edit the child’s record.");
      const kid = db.people.find((p) => p.id === extra && p.family_id === fid) || fail("Person unavailable");
      if (kid.parents.length >= 8) fail("Invalid or duplicate parents");
      const above = new Set();
      for (const stack = [...proposed.parents]; stack.length; ) { const x = stack.pop(); if (!above.has(x)) { above.add(x); stack.push(...(db.people.find((p) => p.id === x)?.parents || [])); } }
      if (above.has(extra) || proposed.partners.includes(extra)) fail("This relationship would create an ancestry loop");
    }
    if (proposed.life_status === "deceased" && db.memberships.some((m) => m.family_id === fid && m.person_id === target))
      fail("This person’s account is linked to the tree. The link must be removed before they can be recorded as deceased.");
    if (old ? mayApply(rules(fid), ME, owner(fid), target, old, proposed) : mayAdd(rules(fid), ME, owner(fid), target, proposed, extra)) {
      applyPerson(fid, target, proposed, ME);
      if (extra) addParent(fid, extra, target);
      return target;
    }
    const mine = db.tree_contributions.filter((c) => c.family_id === fid && c.submitted_by === ME && c.status === "pending");
    if (old && mine.some((c) => c.person_id === target)) fail("You already have a pending edit for this relative. Withdraw it before submitting another.");
    if (mine.length >= 20) fail("You have 20 pending edits. Wait for review or withdraw one.");
    const proposal = { id: uid(), family_id: fid, person_id: old?.id || null, submitted_by: ME, base_version: old?.version || 0, before_record: old ? structuredClone(old) : {}, proposed_record: { ...proposed, id: target, ...(extra ? { child_of: extra } : {}) }, status: "pending", submitted_at: now(), reviewed_by: null, reviewed_at: null, review_note: "" };
    db.tree_contributions.push(proposal);
    return proposal.id;
  }
  if (["approve", "reject", "withdraw"].includes(action)) {
    const c = db.tree_contributions.find((x) => x.id === payload.id && x.family_id === fid) || fail("Contribution unavailable");
    if (c.status !== "pending") fail("This contribution has already been reviewed or withdrawn");
    if (action === "withdraw") {
      if (c.submitted_by !== ME) fail("Only the contributor can withdraw this edit");
    } else {
      const old = c.person_id ? db.people.find((p) => p.id === c.person_id) : undefined;
      const target = c.person_id || c.proposed_record.id;
      const named = c.person_id ? "" : c.proposed_record.child_of || c.proposed_record.child_of_submitter || "";
      const extra = named && db.people.some((p) => p.id === named && p.family_id === fid) ? named : "";
      const allowed = (proposed) => (old ? mayApply(rules(fid), ME, owner(fid), target, old, proposed, "", c.submitted_by) : mayAdd(rules(fid), ME, owner(fid), target, proposed, extra, c.submitted_by));
      if (action === "approve") {
        if (c.submitted_by === ME) fail("Someone else needs to approve your edit");
        if (!db.memberships.some((m) => m.family_id === fid && m.user_id === c.submitted_by)) fail("The contributor is no longer a family member. Reject this edit.");
        if (c.person_id && (!old || old.version !== c.base_version)) fail("This record changed after the edit was submitted. Reject it and request a fresh edit.");
        if (named && !extra) fail("The person this parent was proposed for is no longer in the tree. Decline this proposal.");
        const proposed = treeRecord(fid, target, c.proposed_record);
        if (!allowed(proposed)) fail("Only an immediate relative with a linked account, the person themselves, or a family owner for other records can approve this edit.");
        applyPerson(fid, target, proposed, c.submitted_by);
        if (extra) addParent(fid, extra, target);
      } else if (!owner(fid) && !allowed(c.proposed_record)) fail("Only a family owner or someone who could approve this edit can reject it");
    }
    Object.assign(c, { status: { approve: "approved", reject: "rejected", withdraw: "withdrawn" }[action], reviewed_by: ME, reviewed_at: now(), review_note: payload.note || "" });
    return c.id;
  }
  const row = (user) => db.memberships.find((m) => m.family_id === fid && m.user_id === user);
  if (action === "claim") {
    const p = db.people.find((x) => x.id === payload.person_id && x.family_id === fid) || fail("Person unavailable");
    if (p.life_status === "deceased") fail("A memorial record cannot be linked to an account");
    if (me) fail("Your account is already linked to someone in this tree. Remove that link first.");
    if (db.memberships.some((m) => m.family_id === fid && m.person_id === p.id)) fail("Someone has already linked their account to this person");
    Object.assign(membership(fid), owner(fid) ? { person_id: p.id, claim_person_id: null } : { claim_person_id: p.id });
    return p.id;
  }
  if (["approve_claim", "reject_claim", "unlink"].includes(action)) {
    const who = payload.user_id || ME, m = row(who) || fail("Member unavailable");
    if (who !== ME && !owner(fid)) fail("Only a family owner can change someone else’s link");
    if (action === "unlink") return Object.assign(m, { person_id: null, claim_person_id: null }) && null;
    if (!m.claim_person_id) fail("There is no pending link for this member");
    if (action === "reject_claim") return Object.assign(m, { claim_person_id: null }) && null;
    if (!owner(fid)) fail("Only a family owner can confirm who someone is");
    if (db.memberships.some((x) => x.family_id === fid && x.person_id === m.claim_person_id)) fail("Someone has already linked their account to this person");
    Object.assign(m, { person_id: m.claim_person_id, claim_person_id: null });
    return m.person_id;
  }
  if (action === "profile") {
    if (String(payload.about || "").length > 1000 || String(payload.work || "").length > 300 || String(payload.share || "").length > 1000) fail("A profile field is too long");
    db.life_profiles = db.life_profiles.filter((p) => !(p.family_id === fid && p.user_id === ME));
    db.life_profiles.push({ family_id: fid, user_id: ME, about: payload.about || "", work: payload.work || "", share: payload.share || "", updated_at: now() });
    return null;
  }
  fail("Unknown tree action");
}

function familyAction(fid, action, payload = {}) {
  if (action === "person") return treeAction(fid, "save", payload);
  need(fid);
  const text = (v, max) => { const t = String(v ?? "").trim(); if (!t || t.length > max) fail(`Write 1–${max} characters`); return t; };
  if (action === "post") { const id = uid(); db.posts.push({ id, family_id: fid, author_id: ME, body: text(payload.body, 2000), created_at: now() }); return id; }
  if (action === "comment") {
    db.posts.some((p) => p.id === payload.post_id && p.family_id === fid) || fail("Post unavailable");
    const id = uid(); db.comments.push({ id, family_id: fid, post_id: payload.post_id, author_id: ME, body: text(payload.body, 500), created_at: now() }); return id;
  }
  if (action === "react") {
    db.posts.some((p) => p.id === payload.post_id && p.family_id === fid) || fail("Post unavailable");
    db.reactions = db.reactions.filter((r) => !(r.post_id === payload.post_id && r.user_id === ME));
    if (payload.liked) db.reactions.push({ family_id: fid, post_id: payload.post_id, user_id: ME });
    return null;
  }
  if (action === "event") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.event_date || "")) fail("Choose a date");
    const id = uid(); db.events.push({ id, family_id: fid, author_id: ME, title: text(payload.title, 100), event_date: payload.event_date, detail: String(payload.detail || "").slice(0, 500) }); return id;
  }
  if (action === "remove_member") {
    if (!owner(fid)) fail("Only the family owner can remove members");
    db.memberships = db.memberships.filter((m) => !(m.family_id === fid && m.user_id === payload.user_id && m.role !== "owner"));
    db.life_profiles = db.life_profiles.filter((p) => !(p.family_id === fid && p.user_id === payload.user_id));
    for (const i of db.invitations) if (i.family_id === fid && i.invited_by === payload.user_id && !i.used_at && !i.revoked_at) i.revoked_at = now();
    return null;
  }
  if (action === "revoke_invitation") {
    const i = db.invitations.find((x) => x.id === payload.id && x.family_id === fid && !x.used_at && !x.revoked_at && (owner(fid) || x.invited_by === ME));
    if (!i) fail("Only the family owner or the person who sent it can revoke this invitation");
    i.revoked_at = now();
    return null;
  }
  fail("Unknown action");
}

const rpcs = {
  family_action: ({ fid, action, payload }) => familyAction(fid, action, payload),
  tree_action: ({ fid, action, payload }) => treeAction(fid, action, payload),
  list_invitations: ({ fid }) => {
    need(fid);
    return db.invitations.filter((i) => i.family_id === fid && (owner(fid) || i.invited_by === ME)).map(({ code, ...i }) => i);
  },
  create_invitation: ({ fid, invite_email, invite_person }) => {
    need(fid);
    const email = String(invite_email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Enter the email address of the relative you are inviting");
    if (invite_person) {
      const p = db.people.find((x) => x.id === invite_person && x.family_id === fid) || fail("Person unavailable");
      if (p.life_status === "deceased") fail("A memorial record cannot be linked to an account");
      if (db.memberships.some((m) => m.family_id === fid && m.person_id === p.id)) fail("Someone has already linked their account to this person");
    } else if (!owner(fid)) fail("Choose who they are in the family tree. If they are not there yet, add them as a relative first.");
    const open = db.invitations.filter((i) => i.family_id === fid && !i.used_at && !i.revoked_at && Date.parse(i.expires_at) > Date.now());
    if (open.some((i) => i.email === email)) fail("This email already has an open invitation. Revoke it to send a new one.");
    const code = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    db.invitations.push({ id: uid(), family_id: fid, code, email, person_id: invite_person || null, invited_by: ME, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), used_at: null, revoked_at: null });
    return code;
  },
  create_family: ({ family_name, member_name }) => {
    if (db.memberships.filter((m) => m.user_id === ME && m.role === "owner").length >= 5) fail("Family limit reached");
    const id = uid(), name = String(family_name || "").trim(), display = String(member_name || "").trim();
    if (!name || !display) fail("Enter a family name and your name");
    db.families.push({ id, name, created_at: now() });
    db.memberships.push({ family_id: id, user_id: ME, display_name: display, role: "owner", person_id: null, claim_person_id: null });
    return id;
  },
  accept_invitation: () => fail("Invitations work on the real Roots site, not in this demo."),
  set_person_photo: ({ fid, person, path = null }) => {
    need(fid);
    const p = db.people.find((x) => x.id === person && x.family_id === fid) || fail("Person unavailable");
    const may = mayPhoto(rules(fid), ME, owner(fid), p);
    if (path === null ? !(may || owner(fid)) : !may) fail(path === null ? "You cannot remove this photo" : "Only someone who can edit this record directly can set its photo. A child’s photo comes from a parent or guardian in the tree.");
    if (path !== null && (!path.startsWith(`${fid}/${person}/`) || !db.photos[path])) fail("Upload the photo first");
    const old = p.photo_path || null;
    p.photo_path = path;
    return old;
  },
};

const session = { user: { id: ME, email: "you@example.invalid" } };
const notInDemo = async () => ({ data: {}, error: { message: "Accounts are not used in the fictional demo." } });
export const backend = {
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    // Leaving the demo goes back to the real sign-in page.
    signOut: async () => { location.assign("/"); return { data: {}, error: null }; },
    signInWithPassword: notInDemo, signUp: notInDemo, resetPasswordForEmail: notInDemo, updateUser: notInDemo, verifyOtp: notInDemo,
  },
  from: (table) => query(table),
  // Photos stay in this browser as data URLs; "signed links" are the data URLs themselves.
  storage: {
    from: () => ({
      upload: async (path, blob) => {
        const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
        if (JSON.stringify(db).length + url.length > 4_500_000) return { data: null, error: { message: "This demo cannot keep more photos in your browser. Use “Start over” to clear it." } };
        db.photos[path] = url;
        save();
        return { data: { path }, error: null };
      },
      remove: async (paths) => { for (const path of paths) delete db.photos[path]; save(); return { data: paths, error: null }; },
      createSignedUrls: async (paths) => ({ data: paths.map((path) => ({ path, signedUrl: db.photos[path] || null, error: null })), error: null }),
    }),
  },
  rpc: async (name, args = {}) => {
    try {
      const data = (rpcs[name] || (() => fail("Unknown request")))(args);
      save();
      return { data: data ?? null, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message } };
    }
  },
};
globalThis.otfDemoBackend = backend;
