import {test,expect} from 'vitest';
test('welcome shows one static Roots backdrop and removes it on entering the family space',async()=>{
  document.body.className='';
  document.body.innerHTML='<header class="pilot-header"><button data-motion-toggle>Pause signals</button></header><div class="network-backdrop"><svg class="signal"></svg></div><main id="pilot"><section class="welcome"><h1>Welcome</h1><span class="eyebrow"></span><p></p><div class="hero"></div></section></main>';
  const {decorateWelcome,decorateMember,decoratePublic}=await import('../memory-scene.js');
  const root=document.querySelector('#pilot');
  decorateWelcome(root);
  expect(document.querySelector('.network-backdrop')).toBeNull();
  expect(document.querySelector('[data-motion-toggle]')).toBeNull();
  expect(document.querySelector('.logo-backdrop img').getAttribute('src')).toBe('/brand/roots-signin-clean.png');
  expect(document.querySelector('.logo-backdrop').getAttribute('aria-hidden')).toBe('true');
  expect(document.querySelector('.welcome .hero')).toBeNull();
  decorateWelcome(root);
  expect(document.querySelectorAll('.logo-backdrop').length).toBe(1);
  for(const decorate of [decorateMember,decorateMember,decoratePublic]){
    decorate();
    expect(document.body.classList.contains('network-member')).toBe(true);
    expect(document.querySelector('.logo-backdrop')).toBeNull();
  }
  decorateWelcome(root);
  expect(document.querySelectorAll('.logo-backdrop').length).toBe(1);
  expect(document.querySelector('.signal')).toBeNull();
  expect(document.querySelector('[data-motion-toggle]')).toBeNull();
});
