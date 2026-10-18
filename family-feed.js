const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function familyFeed(snapshot, userId, morePosts = false) {
  const author = id => esc(snapshot.memberships.find(m => m.user_id === id)?.display_name || 'Former family member');
  return `<div class="feed-heading"><div><h2>Family feed</h2><p>Little updates. Real conversations. Just your family.</p></div><span class="feed-privacy">Family only</span></div>
    <form id="post" class="card stack family-composer"><label>What’s happening?<textarea id="family-post-body" name="body" maxlength="2000" required aria-describedby="post-privacy post-count" placeholder="Share an update, a thought, or a moment with your family…"></textarea></label><small id="post-privacy">Only members of this family can see and reply to your posts.</small><div class="feed-compose-actions"><output id="post-count" for="family-post-body" aria-live="off">0 / 2,000</output><button>Post to family</button></div></form>
    <p class="feed-order">Latest posts · Newest first</p>
    ${snapshot.posts.length ? '' : '<div class="card empty"><h2>Start the conversation.</h2><p>Share your first update with the family. A simple hello is a good place to start.</p></div>'}
    ${snapshot.posts.map(p => {
      const likes = snapshot.reactions.filter(r => r.post_id === p.id);
      const liked = likes.some(r => r.user_id === userId);
      const replies = snapshot.comments.filter(c => c.post_id === p.id);
      return `<article class="card family-post"><div class="feed-post-header"><h3>${author(p.author_id)}</h3><time datetime="${esc(p.created_at)}">${esc(new Date(p.created_at).toLocaleString())}</time></div><p class="post-body">${esc(p.body)}</p><div class="feed-post-actions"><button class="quiet" data-react="${esc(p.id)}" data-liked="${liked}" aria-pressed="${liked}" aria-label="${liked ? 'Unlike' : 'Like'} post by ${author(p.author_id)}">${liked ? '♥' : '♡'} ${likes.length} · Like</button><span>${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}</span></div>${replies.map(c => `<p class="comment"><strong>${author(c.author_id)}</strong> ${esc(c.body)}</p>`).join('')}<form class="comment-form" data-comment="${esc(p.id)}"><input name="body" maxlength="500" required aria-label="Reply to ${author(p.author_id)}" placeholder="Post a reply…"><button>Reply</button></form></article>`;
    }).join('')}${morePosts ? '<button class="quiet" id="more-posts">Show older posts</button>' : ''}`;
}
