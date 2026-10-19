// Relationships worked out from recorded parent and partner links only — never from names,
// ages or heritage. The database applies the same memorial rules; these only shape the page.
const ids = (list) => list || [];
const lineal = (person, parent) => !["step", "guardian"].includes(person?.parent_kinds?.[parent]);
const ordinal = (n) => ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][n - 1] || `${n}th`;
const removed = (n) => (n === 0 ? "" : n === 1 ? " once removed" : n === 2 ? " twice removed" : ` ${n} times removed`);
const greats = (n) => "great-".repeat(Math.max(0, n));

export function partnersOf(people, id) {
  const me = people.find((p) => p.id === id);
  return [...new Set([...ids(me?.partners), ...people.filter((p) => ids(p.partners).includes(id)).map((p) => p.id)])];
}

/** Parents, children, partners and anyone sharing a parent: who counts as immediate family. */
export function immediateFamily(people, id, record = people.find((p) => p.id === id), extraChild = "") {
  const parents = ids(record?.parents), out = new Set([...parents, ...ids(record?.partners)]);
  if (extraChild) out.add(extraChild);
  for (const p of people)
    if (ids(p.parents).includes(id) || ids(p.partners).includes(id) || ids(p.parents).some((x) => parents.includes(x))) out.add(p.id);
  out.delete(id);
  return [...out];
}

// Generations from `id` up to each ancestor, through biological, adoptive and unspecified links.
function ancestry(byId, id) {
  const up = new Map([[id, 0]]);
  for (let frontier = [id], depth = 1; frontier.length && depth < 40; depth++) {
    const next = [];
    for (const x of frontier)
      for (const p of ids(byId.get(x)?.parents))
        if (lineal(byId.get(x), p) && byId.has(p) && !up.has(p)) { up.set(p, depth); next.push(p); }
    frontier = next;
  }
  return up;
}

function blood(byId, from, to) {
  const mine = ancestry(byId, from), theirs = ancestry(byId, to);
  let best;
  for (const [id, x] of mine) if (theirs.has(id)) { const y = theirs.get(id); if (!best || x + y < best[0] + best[1]) best = [x, y]; }
  if (!best) return "";
  const [x, y] = best;
  if (x === 0) return y === 1 ? "child" : `${greats(y - 2)}grandchild`;
  if (y === 0) return x === 1 ? "parent" : `${greats(x - 2)}grandparent`;
  if (x === 1 && y === 1) return "brother or sister";
  if (x === 1) return y === 2 ? "niece or nephew" : `${greats(y - 3)}grandniece or grandnephew`;
  if (y === 1) return `${greats(x - 2)}aunt or uncle`;
  return `${ordinal(Math.min(x, y) - 1)} cousin${removed(Math.abs(x - y))}`;
}

/** What `to` is to `from`, such as "grandparent" or "second cousin once removed"; "" if unknown. */
export function relationTo(people, from, to) {
  if (!from || !to) return "";
  if (from === to) return "you";
  const byId = new Map(people.map((p) => [p.id, p])), a = byId.get(from), b = byId.get(to);
  if (!a || !b) return "";
  const kind = (child, parent) => byId.get(child)?.parent_kinds?.[parent];
  if (ids(a.parents).includes(to))
    return { adoptive: "adoptive parent", step: "stepparent", guardian: "guardian" }[kind(from, to)] || "parent";
  if (ids(b.parents).includes(from))
    return { adoptive: "adopted child", step: "stepchild", guardian: "child in your care" }[kind(to, from)] || "child";
  if (partnersOf(people, from).includes(to)) return "partner";
  const direct = blood(byId, from, to);
  if (direct) return direct;
  for (const p of partnersOf(people, from)) {
    const via = blood(byId, p, to);
    if (via === "parent") return "parent-in-law";
    if (via === "brother or sister") return "brother- or sister-in-law";
    if (via === "child") return "stepchild";
  }
  for (const p of partnersOf(people, to)) {
    const via = blood(byId, from, p);
    if (via === "child") return "child-in-law";
    if (via === "brother or sister") return "brother- or sister-in-law";
  }
  return "";
}

const linkedTo = (memberships, person) => memberships.find((m) => m.person_id === person)?.user_id || "";

/** Members who keep a memorial record: living immediate relatives whose accounts are linked. */
export function keepersOf(people, memberships, id) {
  const near = immediateFamily(people, id);
  return memberships.filter((m) => m.person_id && near.includes(m.person_id) && people.find((p) => p.id === m.person_id)?.life_status !== "deceased");
}

/**
 * Mirror of private.may_apply: whether `userId` may apply `record` to person `target`
 * (`old` is undefined for someone new) directly, or approve it when `consent` proposed it.
 */
export function mayApply({ people, memberships }, userId, isOwner, target, old, record, extraChild = "", consent = "") {
  const me = memberships.find((m) => m.user_id === userId)?.person_id || "";
  const parents = ids(record.parents), partners = ids(record.partners);
  const touched = new Set();
  if (record.life_status === "deceased" || old?.life_status === "deceased") touched.add(target);
  for (const p of people)
    if (p.life_status === "deceased" && p.id !== target &&
      ((parents.includes(p.id) && !ids(old?.parents).includes(p.id)) ||
        (partners.includes(p.id) && !ids(old?.partners).includes(p.id)) ||
        (ids(p.parents).some((x) => parents.includes(x)) && !ids(p.parents).some((x) => ids(old?.parents).includes(x)))))
      touched.add(p.id);
  if (touched.size) {
    if (!me || people.find((p) => p.id === me)?.life_status === "deceased") return false;
    for (const t of touched) {
      const near = t === target && !old ? immediateFamily(people, t, record, extraChild) : immediateFamily(people, t);
      if (!near.includes(me)) return false;
    }
  }
  const claimant = old ? linkedTo(memberships, old.id) : "";
  if (claimant && claimant !== userId && claimant !== consent) return false;
  return Boolean(touched.size || claimant || !old || isOwner);
}

/** Mirror of private.may_add: a new person, added on their own or as the parent of `child`. */
export function mayAdd(snap, userId, isOwner, target, record, child = "", consent = "") {
  if (!mayApply(snap, userId, isOwner, target, undefined, record, child, consent)) return false;
  if (!child) return true;
  const kid = snap.people.find((p) => p.id === child);
  return Boolean(kid) && mayApply(snap, userId, isOwner, child, kid, { ...kid, parents: [...ids(kid.parents), target] }, "", consent);
}

/** Everyone descended from `id` through recorded parent links (any kind). */
export function descendantsOf(people, id) {
  const out = new Set();
  for (let frontier = [id]; frontier.length; ) {
    const next = [];
    for (const p of people) if (!out.has(p.id) && ids(p.parents).some((x) => frontier.includes(x))) { out.add(p.id); next.push(p.id); }
    frontier = next;
  }
  return out;
}

/** Under 18 today, by a recorded birth date (unknown birth dates are not treated as children). */
export function isMinor(born) {
  if (!born) return false;
  const d = new Date(), [y, m, day] = born.split("-").map(Number);
  return d.getFullYear() - y - (d.getMonth() + 1 < m || (d.getMonth() + 1 === m && d.getDate() < day) ? 1 : 0) < 18;
}

/** Mirror of private.may_set_photo: a child's photo comes from a parent or guardian linked in the tree. */
export function mayPhoto(snap, userId, isOwner, person) {
  const me = snap.memberships.find((m) => m.user_id === userId)?.person_id || "";
  const claimed = snap.memberships.some((m) => m.person_id === person.id);
  if (person.life_status !== "deceased" && isMinor(person.birth_date) && !claimed) return Boolean(me) && ids(person.parents).includes(me);
  return mayApply(snap, userId, isOwner, person.id, person, person);
}
