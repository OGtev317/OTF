import { test, expect, vi } from 'vitest';
import { query } from './supabase-mock.js';
// An owner shares a join link and approves a request with an "Is this them?" suggestion.
const fixture = vi.hoisted(() => ({ calls: [], link: null, rows: null }));
const api = vi.hoisted(() => ({ auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'owner' } } } })), onAuthStateChange: vi.fn() }, from: vi.fn(), rpc: vi.fn() }));
vi.mock('../supabase-client.js', () => ({ configured: true, demo: false, supabase: api }));
const person = (id, name, extra = {}) => ({ id, family_id: 'fam', name, story: '', parents: [], partners: [], parent_kinds: {}, version: 1, life_status: 'living', ...extra });
fixture.rows = {
  families: [{ id: 'fam', name: 'Fictional family' }],
  memberships: [{ family_id: 'fam', user_id: 'owner', display_name: 'Owner', role: 'owner', person_id: null }],
  people: [person('jordan', 'Jordan Bennett', { birth_date: '1995-03-03' }), person('jo', 'Joanna Smith')],
  join_requests: [{ id: 'r1', family_id: 'fam', user_id: 'newcomer', family_name: 'Fictional family', display_name: 'Jordan Bennet', note: '<i>I am Maya’s daughter</i>', birth_year: 1995, status: 'pending', created_at: '2026-10-18T00:00:00Z' }],
};
api.from.mockImplementation((table) => query(() => fixture.rows[table] || []));
api.rpc.mockImplementation(async (name, args) => {
  fixture.calls.push([name, args]);
  if (name === 'join_link') return { data: fixture.link ? [fixture.link] : [] };
  if (name === 'create_join_link') { fixture.link = { code: 'cd'.repeat(32), created_at: '2026-10-18T00:00:00Z', expires_at: '2026-11-17T00:00:00Z' }; return { data: fixture.link.code }; }
  if (name === 'decide_join_request') { fixture.rows.join_requests[0].status = 'approved'; return { data: args.person }; }
  return { data: name === 'list_invitations' ? [] : null };
});
test('owner creates a join link and approves a request linked to the suggested person', async () => {
  globalThis.confirm = () => true;
  document.body.innerHTML = '<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
  await vi.waitFor(() => expect(document.querySelector('[data-view=members]')?.textContent).toBe('Members (1)'));
  document.querySelector('[data-view=members]').click();
  document.querySelector('#join-link-new').click();
  await vi.waitFor(() => expect(document.querySelector('#join-section input')?.value).toBe(`${location.origin}/?join=${'cd'.repeat(32)}`));
  const form = document.querySelector('form[data-join-request=r1]');
  expect(form.querySelector('i')).toBeNull();
  const checked = form.querySelector('input[name=place]:checked');
  expect(checked.value).toBe('person:jordan');
  expect(checked.closest('label').textContent).toContain('Is this them? Jordan Bennett · born 1995');
  form.querySelector('button[value=approve]').click();
  await vi.waitFor(() => expect(document.querySelector('#status').textContent).toContain('Approved'));
  expect(fixture.calls).toContainEqual(['decide_join_request', { fid: 'fam', request: 'r1', decision: 'approve', person: 'jordan', add_person: false }]);
  expect(document.querySelector('#join-requests')).toBeNull();
  expect(document.querySelector('#join-section').textContent).toContain('No requests to join waiting.');
});
