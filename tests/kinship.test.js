import { test, expect } from 'vitest';
import { relationTo, keepersOf, mayApply, mayAdd, immediateFamily, possiblyLiving } from '../kinship.js';
// A fictional family: grandparents G1+G2; their children Mom and Uncle; Mom's child Me and Sib;
// Uncle's child Cousin; Cousin's child Kid; Mom's partner Step (not a parent of Me); Step's sister Aunty.
const p = (id, parents = [], extra = {}) => ({ id, name: id, parents, partners: [], parent_kinds: {}, life_status: 'living', ...extra });
const people = [
  p('G1', [], { life_status: 'deceased', partners: ['G2'] }), p('G2'), p('Mom', ['G1', 'G2']), p('Uncle', ['G1', 'G2']),
  p('Me', ['Mom'], { parent_kinds: {} }), p('Sib', ['Mom', 'Step'], { parent_kinds: { Step: 'step' } }), p('Cousin', ['Uncle']), p('Kid', ['Cousin']),
  p('Step', ['StepMom'], { partners: ['Mom'] }), p('StepMom'), p('Aunty', ['StepMom']), p('Adopted', ['Mom'], { parent_kinds: { Mom: 'adoptive' } }),
];
test('relationship labels come from recorded links only', () => {
  const label = (to) => relationTo(people, 'Me', to);
  expect(label('Me')).toBe('you');
  expect(label('Mom')).toBe('parent');
  expect(label('G1')).toBe('grandparent');
  expect(label('Sib')).toBe('brother or sister');
  expect(label('Uncle')).toBe('aunt or uncle');
  expect(label('Cousin')).toBe('first cousin');
  expect(label('Kid')).toBe('first cousin once removed');
  expect(label('Adopted')).toBe('brother or sister');
  expect(relationTo(people, 'Kid', 'G1')).toBe('great-grandparent');
  expect(relationTo(people, 'G1', 'Kid')).toBe('great-grandchild');
  expect(relationTo(people, 'Uncle', 'Me')).toBe('niece or nephew');
  expect(relationTo(people, 'Sib', 'Step')).toBe('stepparent');
  expect(relationTo(people, 'Mom', 'Step')).toBe('partner');
  expect(relationTo(people, 'Step', 'Mom')).toBe('partner');
  expect(relationTo(people, 'Mom', 'Adopted')).toBe('adopted child');
  // A stepparent's sister is not counted as an aunt; marriage gives in-laws only.
  expect(relationTo(people, 'Sib', 'Aunty')).toBe('');
  expect(relationTo(people, 'Mom', 'StepMom')).toBe('parent-in-law');
  expect(relationTo(people, 'Mom', 'Aunty')).toBe('brother- or sister-in-law');
  expect(relationTo(people, 'Me', 'nobody')).toBe('');
});
test('memorial keepers are living immediate relatives with linked accounts', () => {
  expect(immediateFamily(people, 'G1').sort()).toEqual(['G2', 'Mom', 'Uncle']);
  const memberships = [{ user_id: 'u-mom', person_id: 'Mom', display_name: 'Mom' }, { user_id: 'u-me', person_id: 'Me', display_name: 'Me' }, { user_id: 'u-owner', role: 'owner' }];
  expect(keepersOf(people, memberships, 'G1').keepers.map((m) => m.user_id)).toEqual(['u-mom']);
  expect(keepersOf(people, memberships, 'G1').historical).toBe(false);
  const snap = { people, memberships };
  const g1 = people[0], edit = { ...g1, story: 'New' };
  expect(mayApply(snap, 'u-mom', false, 'G1', g1, edit)).toBe(true);
  expect(mayApply(snap, 'u-me', false, 'G1', g1, edit)).toBe(false);
  expect(mayApply(snap, 'u-owner', true, 'G1', g1, edit)).toBe(false);
  // Anyone adds living relatives; a new child of the memorial needs a keeper.
  expect(mayApply(snap, 'u-me', false, 'N', undefined, { parents: [], life_status: 'living' })).toBe(true);
  expect(mayApply(snap, 'u-me', false, 'N', undefined, { parents: ['G1'], life_status: 'living' })).toBe(false);
  expect(mayApply(snap, 'u-mom', false, 'N', undefined, { parents: ['G1'], life_status: 'living' })).toBe(true);
  // "They are my parent": a new memorial record whose child is the person adding it.
  expect(mayApply(snap, 'u-me', false, 'N', undefined, { parents: [], life_status: 'deceased' }, 'Me')).toBe(true);
  expect(mayApply(snap, 'u-me', false, 'N', undefined, { parents: [], life_status: 'deceased' })).toBe(false);
  // A linked record changes only with its person; owners change other records.
  const mom = people[2];
  expect(mayApply(snap, 'u-owner', true, 'Mom', mom, { ...mom, story: 'x' })).toBe(false);
  expect(mayApply(snap, 'u-mom', false, 'Mom', mom, { ...mom, story: 'x' })).toBe(true);
  expect(mayApply(snap, 'u-owner', true, 'Uncle', people[3], { ...people[3], story: 'x' })).toBe(true);
  expect(mayApply(snap, 'u-me', false, 'Uncle', people[3], { ...people[3], story: 'x' })).toBe(false);
  // Linking yourself to a memorial needs its keeper, even on your own record; with your consent they can approve.
  const me = people[4], link = { ...me, parents: ['Mom', 'G1'] };
  expect(mayApply(snap, 'u-me', false, 'Me', me, link)).toBe(false);
  expect(mayApply(snap, 'u-mom', false, 'Me', me, link, '', 'u-me')).toBe(true);
  expect(mayApply(snap, 'u-mom', false, 'Me', me, link)).toBe(false);
});

test('historical records: kept by the nearest linked descendants, or owners when there are none', () => {
  const q = (id, parents = [], extra = {}) => ({ id, name: id, parents, partners: [], parent_kinds: {}, life_status: 'deceased', ...extra });
  // Great-grandad (born 1880) -> Grandad (died) -> Dad (living, linked) -> Me (living, linked).
  const tree = [q('GGD', [], { birth_date: '1880-01-01' }), q('GD', ['GGD']), q('Dad', ['GD'], { life_status: 'living' }), q('Me', ['Dad'], { life_status: 'living' }), q('Lone', [], { birth_date: '1850-01-01' }), q('Old', ['GGD'], { life_status: 'unknown', birth_date: '1899-01-01' })];
  const memberships = [{ user_id: 'u-dad', person_id: 'Dad', display_name: 'Dad' }, { user_id: 'u-me', person_id: 'Me', display_name: 'Me' }, { user_id: 'u-owner', role: 'owner', display_name: 'Owner' }];
  const snap = { people: tree, memberships };
  expect(possiblyLiving(tree[5])).toBe(false);
  expect(possiblyLiving({ life_status: 'unknown' })).toBe(true);
  // GGD's children (GD, Old) cannot be alive: historical, kept by the nearest linked descendant (Dad).
  expect(keepersOf(tree, memberships, 'GGD')).toMatchObject({ historical: true, owners: false });
  expect(keepersOf(tree, memberships, 'GGD').keepers.map((m) => m.user_id)).toEqual(['u-dad']);
  const ggd = tree[0], edit = { ...ggd, story: 'x' };
  expect(mayApply(snap, 'u-dad', false, 'GGD', ggd, edit)).toBe(true);
  expect(mayApply(snap, 'u-me', false, 'GGD', ggd, edit)).toBe(false);
  expect(mayApply(snap, 'u-owner', true, 'GGD', ggd, edit)).toBe(false);
  // GD has a living child (Dad): the ordinary rule, kept by Dad.
  expect(keepersOf(tree, memberships, 'GD')).toMatchObject({ historical: false });
  // No descendants at all: owners keep it.
  expect(keepersOf(tree, memberships, 'Lone')).toMatchObject({ historical: true, owners: true });
  expect(mayApply(snap, 'u-owner', true, 'Lone', tree[4], { ...tree[4], story: 'x' })).toBe(true);
  expect(mayApply(snap, 'u-me', false, 'Lone', tree[4], { ...tree[4], story: 'x' })).toBe(false);
  // Adding GGD's father: the new person's only child (GGD) has died, so Dad keeps him too.
  expect(mayAdd(snap, 'u-dad', false, 'New', { parents: [], life_status: 'deceased', source_note: 'x' }, 'GGD')).toBe(true);
  expect(mayAdd(snap, 'u-me', false, 'New', { parents: [], life_status: 'deceased', source_note: 'x' }, 'GGD')).toBe(false);
});
