import { test, expect, vi } from 'vitest';
import { query } from './supabase-mock.js';
// Links from emails, in a fresh page per case: a token-hash link works on any device;
// a one-time-code link opened in another browser explains itself instead of failing silently.
const api = vi.hoisted(() => ({
  auth: {
    onAuthStateChange: vi.fn(), getSession: vi.fn(async () => ({ data: { session: null } })),
    verifyOtp: vi.fn(async () => ({ data: { session: { user: { id: 'synthetic-user' } } }, error: null })),
  },
  from: vi.fn(() => query(() => [])),
  rpc: vi.fn(async () => ({ data: [] })),
}));
vi.mock('../supabase-client.js', () => ({ configured: true, demo: false, supabase: api }));
async function openWith(search) {
  vi.resetModules();
  window.history.replaceState(null, '', `/${search}`);
  document.body.innerHTML = '<div id="account"></div><main id="pilot"></main><p id="status"></p>';
  await import('../pilot.js');
}
test('a recovery link with a token hash opens the new-password form on any device and leaves a clean address', async () => {
  await openWith('?token_hash=synthetic-hash&type=recovery');
  await vi.waitFor(() => expect(document.querySelector('#auth-form h2')?.textContent).toBe('Choose a new password'));
  expect(api.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'synthetic-hash', type: 'recovery' });
  expect(location.search).toBe('');
});
test('a used or expired link says so', async () => {
  api.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { message: 'Token has expired or is invalid' } });
  await openWith('?token_hash=used&type=email');
  await vi.waitFor(() => expect(document.querySelector('#status').textContent).toMatch(/expired or was already used/));
  expect(document.querySelector('#auth-form')).not.toBeNull();
});
test('a one-time-code link opened in another browser explains what to do', async () => {
  await openWith('?code=synthetic-code');
  await vi.waitFor(() => expect(document.querySelector('#status').textContent).toMatch(/only works in the browser where it was requested/));
  expect(location.search).toBe('');
});
