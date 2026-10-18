import { familyFeed } from '../family-feed.js';
const root = document.querySelector('#family-content');
root.innerHTML = familyFeed({
  memberships:[{user_id:'maya',display_name:'Maya Bennett'},{user_id:'leo',display_name:'Leo Bennett'}],
  posts:[{id:'hello',author_id:'maya',created_at:'2026-10-18T20:30:00Z',body:'Sunday dinner at my place? Bring your favorite dish and a story from the week. 🌿'}],
  comments:[{post_id:'hello',author_id:'leo',body:'Count me in! I’ll bring the lemon cake.'}],
  reactions:[{post_id:'hello',user_id:'leo'}],
},'leo');
document.addEventListener('submit', e => e.preventDefault());
root.addEventListener('input', () => { document.querySelector('#post-count').textContent = `${document.querySelector('#family-post-body').value.length} / 2,000`; });
