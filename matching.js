// "Is this you?": likely matches between a request to join and people already in the tree.
// Suggestions only; an owner always chooses. Like Gramps' duplicate finder, names are compared by
// spelling and sound (Soundex on the surname), common nicknames and initials, and a birth year
// more than three years apart rules a match out. Surnames may differ (people marry), so a
// first name has to match in some way.
const NICKNAMES = [
  ["william", "bill", "will", "billy", "liam"], ["robert", "bob", "rob", "bobby", "bert"], ["richard", "rick", "rich", "dick"],
  ["elizabeth", "liz", "beth", "betty", "eliza", "lisa", "libby"], ["katherine", "catherine", "kate", "katie", "kathy", "cathy", "kat"],
  ["margaret", "maggie", "meg", "peggy", "marge"], ["michael", "mike", "mikey"], ["james", "jim", "jimmy", "jamie"],
  ["thomas", "tom", "tommy"], ["joseph", "joe", "joey"], ["jennifer", "jen", "jenny"], ["christopher", "chris"],
  ["christina", "christine", "chris", "tina"], ["daniel", "dan", "danny"], ["anthony", "tony"], ["edward", "ed", "eddie", "ted", "ned"],
  ["patricia", "pat", "patty", "trish"], ["patrick", "pat"], ["alexander", "alex", "al"], ["alexandra", "alex", "sandra", "sandy"],
  ["benjamin", "ben", "benny"], ["samuel", "sam", "sammy"], ["samantha", "sam"], ["deborah", "debbie", "deb"], ["susan", "sue", "suzy"],
  ["charles", "charlie", "chuck"], ["nicholas", "nick"], ["jonathan", "jon", "johnny"], ["john", "jack", "johnny", "jon"],
  ["andrew", "andy", "drew"], ["matthew", "matt"], ["steven", "stephen", "steve"], ["rebecca", "becky", "becca"],
  ["victoria", "vicky", "tori"], ["theodore", "theo", "ted", "teddy"], ["dorothy", "dot", "dottie"], ["frances", "fran", "frankie"],
  ["francis", "frank"], ["gregory", "greg"], ["kenneth", "ken", "kenny"], ["timothy", "tim"], ["abigail", "abby"],
  ["jacqueline", "jackie"], ["lawrence", "larry"], ["raymond", "ray"], ["ronald", "ron"], ["donald", "don"], ["douglas", "doug"],
].map((group) => new Set(group));

const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (s) => plain(s).replace(/['’-]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w && !["jr", "sr", "ii", "iii", "iv"].includes(w));

/** American Soundex: names that sound alike share a code (Robert, Rupert → R163). */
export function soundex(word) {
  const s = plain(word).replace(/[^a-z]/g, "");
  if (!s) return "";
  const codes = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
  let out = s[0].toUpperCase(), last = codes[s[0]] || 0;
  for (const ch of s.slice(1)) {
    const code = codes[ch] || 0;
    if (code && code !== last) out += code;
    if (ch !== "h" && ch !== "w") last = code;
    if (out.length === 4) break;
  }
  return out.padEnd(4, "0");
}

function given(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (NICKNAMES.some((g) => g.has(a) && g.has(b))) return 0.75;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.6;
  if ((a.length === 1 || b.length === 1) && a[0] === b[0]) return 0.4;
  return 0;
}
function surname(a, b) {
  if (!a || !b) return 0;
  return a === b ? 1 : soundex(a) === soundex(b) ? 0.6 : 0;
}

/** How likely `request` ({display_name, birth_year}) is `person`; 0 when unlikely. */
export function matchScore(request, person) {
  const r = words(request.display_name), p = words(person.name);
  const first = given(r[0], p[0]);
  if (!first) return 0;
  // Compare the request's surname with every later part of the person's name (middle or maiden names).
  const last = r.length > 1 ? Math.max(0, ...p.slice(1).map((w) => surname(r.at(-1), w))) : 0;
  let score = first + last;
  const born = person.birth_date ? Number(person.birth_date.slice(0, 4)) : 0;
  if (request.birth_year && born) {
    const gap = Math.abs(Number(request.birth_year) - born);
    if (gap > 3) return 0;
    score += gap <= 1 ? 0.5 : 0.25;
  }
  return score;
}

/** Up to `limit` people the request most likely is: living or unknown, not already linked to an account. */
export function suggestMatches(request, people, memberships, limit = 3) {
  const linked = new Set(memberships.map((m) => m.person_id).filter(Boolean));
  return people
    .filter((p) => p.life_status !== "deceased" && !linked.has(p.id))
    .map((person) => ({ person, score: matchScore(request, person) }))
    .filter((m) => m.score >= 1)
    .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name))
    .slice(0, limit);
}
