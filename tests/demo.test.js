import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
// The demo runs the real app (pilot.js) on fictional records kept in this browser.
const status = () => document.querySelector('#status').textContent;
const node = (name) => [...document.querySelectorAll('.tree-canvas .tree-node')].find((n) => n.querySelector('strong').textContent === name);
const panel = () => document.querySelector('#tree-panel');
test('the demo is the signed-in app with a fictional family, following the same rules', async () => {
  const page = new DOMParser().parseFromString(readFileSync('demo.html', 'utf8'), 'text/html');
  document.body.innerHTML = page.body.innerHTML;
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.confirm = () => true;
  await (await import('../demo.js')).app;
  await vi.waitFor(() => expect(document.querySelectorAll('.post-body').length).toBe(3));
  expect(document.querySelector('h1').textContent).toBe('The Bennetts');
  expect(document.querySelector('#logout').textContent).toBe('Leave demo');
  expect(document.querySelector('.post-body').textContent).toContain('Sunday dinner');
  expect(document.querySelector('#auth-form')).toBeNull();

  document.querySelector('#post textarea').value = 'Hello from the demo';
  document.querySelector('#post button').click();
  await vi.waitFor(() => expect(document.querySelector('.post-body').textContent).toBe('Hello from the demo'));
  expect(localStorage.getItem('roots-demo-v1')).toContain('Hello from the demo');

  document.querySelector('[data-view=tree]').click();
  expect(document.querySelector('#you').textContent).toContain('You are Jordan Bennett');
  expect([...document.querySelectorAll('.tree-gen-label')].map((h) => h.textContent)).toEqual(['Your grandparents’ generation', 'Your parents’ generation', 'Your generation']);
  expect(node('Ava Bennett').textContent).toContain('Your first cousin');
  expect(node('Leo Bennett').textContent).toContain('Your aunt or uncle');
  expect(document.querySelector('#tree-attention h3').textContent).toBe('Waiting for you (2)');

  // As a grandchild you cannot change Grandma Rose's memorial directly.
  node('Rose Bennett').click();
  expect(panel().textContent).toContain('Your grandparent');
  expect(panel().textContent).toContain('Kept by immediate family: Leo & Maya');
  expect(panel().textContent).toContain('Died November 2, 2019, aged 81');
  panel().querySelector('[data-edit]').click();
  expect(document.querySelector('#person-approval').textContent).toBe('This will be sent to Leo & Maya for approval. The tree stays as it is until then.');
  document.querySelector('#person [name=story]').value = 'A new memory of Rose';
  document.querySelector('#person button').click();
  await vi.waitFor(() => expect(status()).toContain('Edit submitted for approval'));
  expect(node('Rose Bennett').textContent).toContain('Edit awaiting approval');

  // As the owner you approve Leo's suggestion and confirm who Ava is.
  node('James Bennett').click();
  panel().querySelector('button[value=approve]').click();
  await vi.waitFor(() => expect(status()).toContain('Edit approved'));
  expect(panel().textContent).toContain('county fair');
  document.querySelector('[data-approve-claim]').click();
  await vi.waitFor(() => expect(status()).toBe('Link confirmed.'));
  node('Ava Bennett').click();
  expect(panel().textContent).toContain('Linked to Ava’s account');

  // Adding a child of Maya, a living relative, applies at once.
  node('Maya Bennett').click();
  panel().querySelector('[data-add=child]').click();
  document.querySelector('#person [name=name]').value = 'Robin Bennett';
  document.querySelector('#person button').click();
  await vi.waitFor(() => expect(status()).toBe('Relative saved to your family tree.'));
  expect(node('Robin Bennett').textContent).toContain('Your brother or sister');

  document.querySelector('[data-view=events]').click();
  expect(document.querySelector('#family-content').textContent).toMatch(/Sunday at Maya’s[\s\S]*Recent gatherings/);
  document.querySelector('[data-view=members]').click();
  expect(document.querySelector('#family-content').textContent).toContain('sam@example.com');
  expect(document.querySelector('#family-content').textContent).toContain('About Maya');
});
