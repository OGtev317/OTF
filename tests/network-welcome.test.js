import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
test('only welcome mounts animated scenery; workspace and public pages stay plain',async()=>{
  document.body.className='';
  localStorage.setItem('otf-motion-paused','true');
  document.body.innerHTML='<header class="pilot-header"></header><main id="pilot"><section class="welcome"><h1>Welcome</h1><span class="eyebrow"></span><p></p><div class="hero"></div></section></main>';
  const {decorateWelcome,decorateMember,decoratePublic}=await import('../memory-scene.js');
  const root=document.querySelector('#pilot');
  decorateWelcome(root);
  expect(document.querySelectorAll('.signal').length).toBe(16);
  expect(document.querySelector('.welcome .hero')).toBeNull();
  const toggle=document.querySelector('[data-motion-toggle]');
  expect(toggle.hidden).toBe(false);
  expect(toggle.textContent).toBe('Resume signals');
  toggle.click();
  expect(document.documentElement.dataset.motion).toBe('playing');
  decorateWelcome(root);
  expect(document.querySelectorAll('.network-backdrop').length).toBe(1);
  for(const decorate of [decorateMember,decorateMember,decoratePublic,decoratePublic]){
    decorate();
    expect(document.body.classList.contains('network-member')).toBe(true);
    expect(document.querySelector('.network-backdrop')).toBeNull();
    expect(document.querySelector('.signal')).toBeNull();
    expect(toggle.hidden).toBe(true);
  }
  decorateWelcome(root);
  expect(document.body.classList.contains('network-member')).toBe(false);
  expect(document.querySelectorAll('.signal').length).toBe(16);
  expect(toggle.hidden).toBe(false);
  expect(toggle.textContent).toBe('Pause signals');
  expect(document.querySelectorAll('[data-motion-toggle]').length).toBe(1);
  const css=readFileSync('network-shared.css','utf8');
  expect(css).toContain('.network-member{background:#000');
  expect(css).toContain('border:1px solid #328d57');
  expect(readFileSync('network-welcome.css','utf8')).toMatch(/\.signal\{animation:none!important/);
});
