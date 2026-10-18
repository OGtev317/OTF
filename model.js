export function initialState() {
  return {
    people: [
      { id: 'rose', name: 'Rose Bennett', role: 'The storyteller', story: 'Keeper of the Sunday recipes and our favorite family stories.', parents: [] },
      { id: 'james', name: 'James Bennett', role: 'The garden enthusiast', story: 'Always has something growing and a story to go with it.', parents: [] },
      { id: 'maya', name: 'Maya Bennett', role: 'The bring-everyone-together one', story: 'There is always room for one more at my table.', parents: ['rose', 'james'] },
      { id: 'leo', name: 'Leo Bennett', role: 'The adventurer', story: 'Collecting little moments and taking the scenic route.', parents: ['rose', 'james'] }
    ],
    posts: [
      { id: 'p1', author: 'Maya Bennett', text: 'Sunday dinner at my place? Bring your favorite dish and a story from the week. I’m making Grandma’s pasta. 🍝', tag: 'Around the table', liked: false, likes: 4, comments: [{ text: 'I’ll bring the lemon cake!', author: 'Rose Bennett' }] },
      { id: 'p2', author: 'Leo Bennett', text: 'Found an old recipe card tucked inside a book. Funny how the smallest things can bring back a whole afternoon with family.', tag: 'A little memory', liked: false, likes: 7, comments: [] }
    ],
    events: [{ id: 'e1', title: 'Sunday at Maya’s', date: '', detail: 'A meal, a few stories, and everyone together. Date to be decided.' }]
  };
}
export function validateParents(people, personId, parents) {
  if (new Set(parents).size !== parents.length) throw new Error('Each parent can only be added once.');
  const byId = new Map(people.map(person => [person.id, person]));
  for (const parent of parents) {
    if (!byId.has(parent)) throw new Error('Choose a person already in the tree.');
    const pending = [parent], seen = new Set();
    while (pending.length) {
      const id = pending.pop();
      if (id === personId) throw new Error('That relationship would create a loop in the family tree.');
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(...(byId.get(id)?.parents || []));
    }
  }
}
export function validState(value) {
  if (!value || !Array.isArray(value.people) || !Array.isArray(value.posts) || !Array.isArray(value.events)) return false;
  try {
    if (new Set(value.people.map(p => p.id)).size !== value.people.length) return false;
    for (const p of value.people) {
      if (![p.id, p.name, p.role, p.story].every(x => typeof x === 'string') || !Array.isArray(p.parents)) return false;
      validateParents(value.people, p.id, p.parents);
    }
    return value.posts.every(p => [p.id, p.author, p.text, p.tag].every(x => typeof x === 'string') && typeof p.liked === 'boolean' && Number.isFinite(p.likes) && Array.isArray(p.comments) && p.comments.every(c => typeof c.text === 'string' && typeof c.author === 'string')) && value.events.every(e => [e.id, e.title, e.date, e.detail].every(x => typeof x === 'string'));
  } catch { return false; }
}
