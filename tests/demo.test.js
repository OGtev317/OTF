import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
// The demo runs the real app (pilot.js) on fictional records kept in this browser.
const status = () => document.querySelector('#status').textContent;
const card = (name) => [...document.querySelectorAll('.relative')].find((c) => c.querySelector('h2').textContent === name);
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
  expect(card('Rose Bennett').textContent).toContain('Your grandparent');
  expect(card('Rose Bennett').textContent).toContain('Kept by immediate family: Leo & Maya');
  expect(card('Rose Bennett').querySelector('[data-edit]').textContent).toBe('Suggest an edit');
  expect(card('Ava Bennett').textContent).toContain('Your first cousin');
  expect(card('Leo Bennett').textContent).toContain('Your aunt or uncle');

  // As a grandchild you cannot change Grandma Rose's memorial directly.
  card('Rose Bennett').querySelector('[data-edit]').click();
  document.querySelector('#person [name=story]').value = 'A new memory of Rose';
  document.querySelector('#person button').click();
  await vi.waitFor(() => expect(status()).toContain('Edit submitted for approval'));
  expect(card('Rose Bennett').textContent).not.toContain('A new memory of Rose');

  // As the owner you approve Leo's suggestion and confirm who Ava is.
  document.querySelector('button[value=approve]').click();
  await vi.waitFor(() => expect(status()).toContain('Edit approved'));
  expect(card('James Bennett').textContent).toContain('county fair');
  document.querySelector('[data-approve-claim]').click();
  await vi.waitFor(() => expect(status()).toBe('Link confirmed.'));
  expect(card('Ava Bennett').textContent).toContain('Linked to Ava’s account');

  document.querySelector('[data-view=events]').click();
  expect(document.querySelector('#family-content').textContent).toMatch(/Sunday at Maya’s[\s\S]*Recent gatherings/);
  document.querySelector('[data-view=members]').click();
  expect(document.querySelector('#family-content').textContent).toContain('sam@example.com');
  expect(document.querySelector('#family-content').textContent).toContain('About Maya');
});
