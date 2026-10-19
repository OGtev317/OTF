import { test, expect, vi } from 'vitest';
import { query } from './supabase-mock.js';
// A newcomer opens a family's join link, signs in, and asks to join. Fictional data only.
const code = 'ab'.repeat(32);
const fixture = vi.hoisted(() => ({ requests: [], calls: [] }));
const api = vi.hoisted(() => ({
  auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'newcomer' } } } })), onAuthStateChange: vi.fn() },
  from: vi.fn(), rpc: vi.fn(),
}));
vi.mock('../supabase-client.js', () => ({ configured: true, demo: false, supabase: api }));
api.from.mockImplementation((table) => query(() => (table === 'join_requests' ? fixture.requests : [])));
api.rpc.mockImplementation(async (name, args) => {
  fixture.calls.push([name, args]);
  if (name === 'preview_join_link') return { data: [{ family_id: 'fam', family_name: 'Fictional <b>family</b>', member: false, pending: fixture.requests.some((r) => r.status === 'pending') }] };
  if (name === 'request_to_join') { fixture.requests.push({ id: 'r1', user_id: 'newcomer', family_id: 'fam', family_name: 'Fictional <b>family</b>', status: 'pending', created_at: '2026-10-18T00:00:00Z' }); return { data: 'r1' }; }
  if (name === 'withdraw_join_request') { fixture.requests[0].status = 'withdrawn'; return { data: null }; }
  return { data: null };
});
test('opening a join link shows only the family name and sends a request', async () => {
  history.replaceState(null, '', `/?join=${code}`);
  globalThis.confirm = () => true;
  document.body.innerHTML = '<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
  await vi.waitFor(() => expect(document.querySelector('#join-request')).not.toBeNull());
  expect(location.search).toBe('');
  expect(document.querySelector('#join-request h2').textContent).toBe('Ask to join Fictional <b>family</b>');
  expect(document.querySelector('#join-request b')).toBeNull();
  const form = document.querySelector('#join-request');
  form.elements.display_name.value = 'Jordan Bennett'; form.elements.note.value = "I'm Maya's daughter"; form.elements.birth_year.value = '1995';
  form.querySelector('button').click();
  await vi.waitFor(() => expect(document.querySelector('#status').textContent).toContain('Request sent'));
  expect(fixture.calls).toContainEqual(['request_to_join', { code, display_name: 'Jordan Bennett', note: "I'm Maya's daughter", birth_year: 1995 }]);
  expect(localStorage.getItem('otf-join')).toBeNull();
  expect(document.querySelector('#pilot').textContent).toContain('Waiting for an owner');
  document.querySelector('[data-withdraw-request=r1]').click();
  await vi.waitFor(() => expect(document.querySelector('#status').textContent).toBe('Request withdrawn.'));
});
