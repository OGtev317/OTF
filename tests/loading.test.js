import { test, expect, vi } from 'vitest';
import { query } from './supabase-mock.js';
// More rows than one request returns: every relative loads; the feed pages 20 posts at a time.
const fixture = vi.hoisted(() => ({ rows: {} }));
const api = vi.hoisted(() => ({
  auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'owner' } } } })), onAuthStateChange: vi.fn() },
  from: vi.fn(), rpc: vi.fn(async () => ({ data: [] })),
}));
vi.mock('../supabase-client.js', () => ({ configured: true, demo: false, supabase: api }));
const pad = (n) => String(n).padStart(4, '0');
fixture.rows = {
  families: [{ id: 'family-a', name: 'Fictional large family' }],
  memberships: [{ user_id: 'owner', display_name: 'Owner', role: 'owner' }],
  people: Array.from({ length: 2345 }, (_, i) => ({ id: `p${pad(i)}`, name: `Fictional relative ${pad(i)}`, story: '', parents: [], partners: [], parent_kinds: {}, version: 1, life_status: 'living' })),
  posts: Array.from({ length: 25 }, (_, i) => ({ id: `post${pad(i)}`, author_id: 'owner', body: `Fictional post ${pad(i)}`, created_at: `2026-10-${String(1 + i).padStart(2, '0')}T12:00:00Z` })),
  comments: Array.from({ length: 25 }, (_, i) => ({ id: `c${pad(i)}`, post_id: `post${pad(i)}`, author_id: 'owner', body: `Reply ${pad(i)}`, created_at: '2026-10-30T00:00:00Z' })),
  reactions: [], life_profiles: [], tree_contributions: [],
  events: [{ id: 'e1', title: 'Past picnic', event_date: '2000-01-01', detail: '' }, { id: 'e2', title: 'Future reunion', event_date: '2999-01-01', detail: '' }],
};
api.from.mockImplementation((table) => query(() => fixture.rows[table] || []));
test('loads every relative across pages and shows older posts on request', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  document.body.innerHTML = '<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
  await vi.waitFor(() => expect(document.querySelectorAll('.post-body').length).toBe(20));
  expect(document.querySelector('.post-body').textContent).toBe('Fictional post 0024');
  expect(document.querySelectorAll('.comment').length).toBe(20);
  document.querySelector('#more-posts').click();
  await vi.waitFor(() => expect(document.querySelectorAll('.post-body').length).toBe(25));
  expect(document.querySelector('#more-posts')).toBeNull();
  expect(document.querySelectorAll('.comment').length).toBe(25);
  document.querySelector('[data-view=tree]').click();
  expect(document.querySelectorAll('.tree-canvas .tree-node').length).toBe(2345);
  document.querySelector('.tree-toolbar [data-add=free]').click();
  expect(document.querySelectorAll('#person [name=parents]').length).toBe(2345);
  document.querySelector('[data-view=events]').click();
  expect(document.querySelector('#family-content section').textContent).toMatch(/Future reunion[\s\S]*Recent gatherings[\s\S]*Past picnic/);
  const ranges = api.from.mock.results.filter((r, i) => api.from.mock.calls[i][0] === 'people').length;
  expect(ranges).toBeGreaterThanOrEqual(3);
});
