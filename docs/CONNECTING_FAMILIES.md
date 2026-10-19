# Connecting family members and existing trees (plan, 2026-10-18)

How newcomers find their family's space in Roots, how they are matched to the right person in the
tree, and how relatives bring in trees they already keep elsewhere. Nothing here is built yet.

Principles from the product plan still hold: an account alone grants no family access; Roots
suggests matches but never merges people or links accounts on its own; living relatives' details
stay minimal; memorial records keep the immediate-family rule (see "Decisions needed").

## What other tools do

- **No genealogy service can tell Roots who belongs to a family.** Ancestry has no public API; its
  owners can export a tree as a GEDCOM 5.5 file (often zipped, without photos or DNA). FamilySearch
  has an OAuth API, but production use needs its Compatible Solution Program, a compatibility review
  and a security policy. WikiTree's public API is read-only. MyHeritage's Family Graph API appears
  retired. No DNA service offers an API.
- **Gramps** (`gramps/plugins/tool/finddupes.py`) finds possible duplicates by grouping people by the
  sound of their surname (Soundex) and sex, then scoring pairs: first names (exact 1, partial or
  initials 0.25–0.5), birth and death dates (exact 1, same year and month 0.75, overlapping ranges
  0.5), places, parents' and spouses' names. Any hard conflict vetoes the pair: different surnames,
  conflicting dates or suffixes, or one being the other's ancestor. Default threshold 0.25. A person
  reviews every suggestion and merges by hand.
- **webtrees** (`app/Services/AdminService.php`) only flags people with the same full name and the
  same birth, baptism, death or burial date. It stores raw GEDCOM per record.
- **Probably alive:** webtrees (`Individual::isDead`) treats someone as dead if they have a death
  record, or any dated event more than 120 years ago, or relatives' dates imply it (parents +45
  years, spouse +40, children −15). Gramps uses 110 years, sibling gaps of 20 and generation gaps
  of 20. Both hide living people's details from outsiders by default.
- Gramps Web and webtrees are GPL/AGPL: learn from them, do not copy their code. Topola and
  family-chart (MIT) are options for drawing very large trees later.

## Part 1: join link and owner-approved requests (built 2026-10-18)

For relatives who do not have an invitation.

1. An owner turns on a **join link** in Members (`/?join=<code>`, like invitation links), shares it
   where the family already talks, and can replace or turn it off; it expires after 30 days. Codes
   are random. Unlike invitation codes they are stored readable so owners can copy the link again:
   a join link grants nothing without an owner's approval.
2. A newcomer opens it, signs in or creates an account, and sees **only the family's name**. They
   send a **request to join** with the name they use, a short note ("I'm Maya's daughter Jordan")
   and, optionally, their birth year to help matching. At most 3 pending requests per account and
   20 per family.
3. Owners see requests under "Waiting for you" with **"Is this you?" suggestions**: unlinked,
   not-deceased people in the tree ranked by name similarity (Soundex on the surname, exact or
   initial first names, common nicknames) and birth year (±2), with Gramps-style vetoes. The owner
   links the newcomer to a suggestion, adds them as someone new, or declines. Nothing is linked
   without that choice.
4. Approval creates the membership and the link in one step, with the same checks as an accepted
   invitation (person unlinked, not deceased).

Database: `family_join_links`, `join_requests`, and functions to create and revoke a link, preview a
family name from a code (signed-in users only), request, withdraw, and decide. No notifications by
email yet: owners see requests when they open Roots (email alerts need a small server function).

## Part 2: GEDCOM import and export

For relatives who already keep a tree on Ancestry, MyHeritage, FamilySearch or Gramps.

**Import**, read in the browser so the raw file is never uploaded:
- Accept GEDCOM 5.5.1 `.ged` files and zipped exports (a small MIT unzip library). GEDCOM 7 later.
- Map each individual to a Roots person: name (given and surname), exact birth and death dates;
  approximate dates ("about 1890", "before 1902", year only) go into the story, because Roots only
  stores exact dates. A death record means deceased; no death record and no event within 110 years
  means "not recorded", not "living". Parent links come from families, with the pedigree type
  (birth → biological, adopted → adoptive, foster → guardian). Couples become partners. Notes go
  to the story, source titles to the source note. Media links are skipped (exports do not contain
  the photos). Records marked private or confidential in the file are skipped.
- **Living relatives come in with names and relationships only**; birth dates of people who may be
  living are left out unless the importer chooses to keep them (this joins the birth-date privacy
  work in the privacy-basics milestone).
- **Review before anything is saved:** a summary of what will be added, and "these people may
  already be in your tree" using the same matching. For each suggestion the importer chooses "same
  person" (keep the existing record and add only what is missing, such as unknown parents) or
  "different people". Nothing merges silently.
- Saved in one all-or-nothing database call (up to about 2,000 people) with the same checks as
  ordinary saves: names, dates, sources for memorials, no ancestry loops, and who may add what.

**Export** a GEDCOM 5.5.1 file (and a JSON copy) of the family's tree, so families keep their own
record and can move to other software. This is item (a) of the privacy-basics milestone.

## Part 3: later, only if families ask

- Linking people to FamilySearch IDs (needs FamilySearch's approval process).
- Importing a public WikiTree branch through its read-only API.
- An opt-in family directory searchable by name (off by default).

## Decisions (made 2026-10-18)

1. **Historical records (adopted; built 2026-10-18).** Today only living immediate relatives with linked accounts
   may add or approve a memorial. Nobody alive can be the immediate relative of a great-grandparent
   born in 1880, so an imported tree's older generations could never be approved. Proposed:
   **historical records**, meaning deceased people with no immediate relative who could still be
   alive (all deceased, or born more than 110 years ago), may be added and kept by their nearest
   linked living descendants, or by owners when there are none. Recent memorials keep today's
   strict rule. This matches the original request that history be added by immediate family
   "if the relative has brothers and sisters or any immediate family still alive". Only recorded
   relatives count; an unknown birth date counts as possibly alive.
2. **Who may export the whole tree: owners only** (adopted), because the export includes living
   relatives.
3. **Living relatives' birth dates on import: left out by default** (adopted); the importer may
   choose to keep them.

## Suggested order

1. Part 1: join link, requests and "Is this you?" matching.
2. Privacy basics (deletion and export, birth-date privacy, change history, owner two-step
   sign-in), including GEDCOM and JSON export.
3. Part 2: GEDCOM import with match review (historical records are now in place).
