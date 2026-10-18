// Static brand artwork on the welcome page; family pages stay plain black.
export function decorateWelcome(root) {
  setScene('network-welcome');
  const welcome = root.querySelector('.welcome');
  if (!welcome) return;
  welcome.querySelector('h1').innerHTML = 'Different branches.<br><em>One family.</em>';
  welcome.querySelector('.eyebrow').textContent = 'EVERY LIFE CONNECTED. EVERY STORY KEPT.';
  welcome.querySelector(':scope > p').textContent = 'A home for your everyday moments, your shared stories, and the people who make you, you.';
  welcome.querySelector('.hero')?.remove();
  // Keep the artwork in its own space below the copy, never behind form text.
  welcome.append(document.querySelector('.logo-backdrop'));
}

export function decorateMember() {
  setScene('network-member');
}

export function decoratePublic() {
  setScene('network-public');
  document.body.classList.add('network-member');
}

function setScene(scene) {
  document.querySelectorAll('.network-backdrop, [data-motion-toggle]').forEach(el => el.remove());
  const backdrop = document.querySelector('.logo-backdrop');
  if (scene === 'network-welcome') {
    if (!backdrop) document.body.insertAdjacentHTML('afterbegin', '<div class="logo-backdrop" aria-hidden="true"><img src="/brand/roots-signin-clean.png" width="1254" height="1254" alt="" fetchpriority="high"></div>');
  } else backdrop?.remove();
  document.body.classList.remove('photo-welcome', 'network-welcome', 'network-member', 'network-public');
  document.body.classList.add(scene);
}
