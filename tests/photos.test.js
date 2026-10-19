import { test, expect, vi } from 'vitest';
import { query } from './supabase-mock.js';
import { isMinor, mayPhoto } from '../kinship.js';
import { avatar } from '../tree-view.js';
// Fictional family: the owner's late mother, the owner, their young child, and a sibling's young child.
const years = (n) => { const d = new Date(); return `${d.getFullYear() - n}-01-01`; };
const fixture = vi.hoisted(() => ({ storage: {}, calls: [], rows: null }));
vi.mock('../photo.js', () => ({ squarePhoto: vi.fn(async () => new Blob(['fictional'], { type: 'image/jpeg' })) }));
const api = vi.hoisted(() => ({ auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'owner' } } } })), onAuthStateChange: vi.fn() }, from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } }));
vi.mock('../supabase-client.js', () => ({ configured: true, demo: false, supabase: api }));
const person = (id, name, extra = {}) => ({ id, family_id: 'fam', name, story: '', parents: [], partners: [], parent_kinds: {}, version: 1, life_status: 'living', ...extra });
fixture.rows = {
  families: [{ id: 'fam', name: 'Fictional family' }],
  memberships: [{ family_id: 'fam', user_id: 'owner', display_name: 'Owner', role: 'owner', person_id: 'me' }],
  people: [person('gran', 'Gran Example', { life_status: 'deceased', source_note: 'Fictional' }), person('me', 'Owner Example', { parents: ['gran'] }), person('sib', 'Sibling Example', { parents: ['gran'] }), person('kid', 'Kid Example', { parents: ['me'], birth_date: years(8) }), person('niece', 'Niece Example', { parents: ['sib'], birth_date: years(6) })],
  posts: [], comments: [], reactions: [], events: [], life_profiles: [], tree_contributions: [],
};
api.from.mockImplementation((table) => query(() => fixture.rows[table] || []));
api.storage.from.mockImplementation(() => ({
  upload: vi.fn(async (path, blob) => { fixture.calls.push(['upload', path, blob.type]); fixture.storage[path] = true; return { data: { path }, error: null }; }),
  remove: vi.fn(async (paths) => { fixture.calls.push(['remove', ...paths]); for (const p of paths) delete fixture.storage[p]; return { data: paths, error: null }; }),
  createSignedUrls: vi.fn(async (paths) => ({ data: paths.map((path) => ({ path, signedUrl: `https://photos.example.invalid/${path}` })), error: null })),
}));
api.rpc.mockImplementation(async (name, args) => {
  if (name === 'list_invitations') return { data: [] };
  if (name === 'set_person_photo') {
    fixture.calls.push(['set', args.person, args.path]);
    const p = fixture.rows.people.find((x) => x.id === args.person), old = p.photo_path || null;
    p.photo_path = args.path;
    return { data: old, error: null };
  }
  return { data: null };
});
test('who may set a photo: the record\'s editors, and only a parent or guardian for a child', () => {
  const snap = { people: fixture.rows.people, memberships: fixture.rows.memberships };
  const by = (id) => snap.people.find((p) => p.id === id);
  expect(isMinor(years(8))).toBe(true); expect(isMinor(years(30))).toBe(false); expect(isMinor('')).toBe(false);
  expect(mayPhoto(snap, 'owner', true, by('kid'))).toBe(true);
  expect(mayPhoto(snap, 'owner', true, by('niece'))).toBe(false);
  expect(mayPhoto(snap, 'owner', true, by('gran'))).toBe(true);
  expect(mayPhoto(snap, 'owner', true, by('sib'))).toBe(true);
  expect(mayPhoto(snap, 'someone', false, by('sib'))).toBe(false);
  expect(avatar(by('kid'), {})).toContain('>KE<');
  expect(avatar({ ...by('kid'), photo_path: 'x' }, { x: 'https://photos.example.invalid/x"><b>' })).not.toContain('<b>');
});
test('add, replace and remove a photo; it shows on the tree, the panel and the members list', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.confirm = () => true;
  document.body.innerHTML = '<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
  await vi.waitFor(() => expect(document.querySelector('[data-view=tree]')).not.toBeNull());
  document.querySelector('[data-view=tree]').click();
  const node = (name) => [...document.querySelectorAll('.tree-canvas .tree-node')].find((n) => n.querySelector('strong').textContent === name);
  const panel = () => document.querySelector('#tree-panel');
  expect(node('Kid Example').querySelector('.tree-avatar').textContent).toBe('KE');
  node('Niece Example').click();
  expect(panel().querySelector('[data-photo]')).toBeNull();
  expect(panel().textContent).toContain('Only a parent or guardian linked in the tree can add a child’s photo.');
  node('Kid Example').click();
  const pick = (input) => { Object.defineProperty(input, 'files', { value: [new File(['fictional'], 'kid.jpg', { type: 'image/jpeg' })] }); input.dispatchEvent(new Event('change', { bubbles: true })); };
  pick(panel().querySelector('[data-photo=kid]'));
  await vi.waitFor(() => expect(document.querySelector('#status').textContent).toContain('Photo saved'));
  const [, first] = fixture.calls.find((c) => c[0] === 'upload');
  expect(first).toMatch(/^fam\/kid\/[0-9a-f-]{36}\.jpg$/);
  expect(fixture.calls).toContainEqual(['set', 'kid', first]);
  expect(node('Kid Example').querySelector('img').getAttribute('src')).toBe(`https://photos.example.invalid/${first}`);
  expect(panel().querySelector('.tree-photo img').getAttribute('alt')).toBe('Photo of Kid Example');
  expect(panel().querySelector('.tree-photo-pick').textContent).toContain('Change photo');
  // Replacing deletes the previous file.
  pick(panel().querySelector('[data-photo=kid]'));
  await vi.waitFor(() => expect(fixture.calls).toContainEqual(['remove', first]));
  // Removing clears it everywhere.
  panel().querySelector('[data-remove-photo=kid]').click();
  await vi.waitFor(() => expect(document.querySelector('#status').textContent).toBe('Photo removed.'));
  expect(node('Kid Example').querySelector('img')).toBeNull();
  // The owner's own photo appears beside their name on the members page.
  node('Owner Example').click();
  pick(panel().querySelector('[data-photo=me]'));
  await vi.waitFor(() => expect(node('Owner Example').querySelector('img')).not.toBeNull());
  document.querySelector('[data-view=members]').click();
  expect(document.querySelector('.member .tree-avatar img')).not.toBeNull();
});
