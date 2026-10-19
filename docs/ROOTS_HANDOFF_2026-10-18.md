# Roots handoff, 2026-10-18

Roots (repository name OTF, "Only the Family") is a private space where a family shares updates,
keeps a connected family tree, and plans gatherings. This note is where things stand at the end
of the session that built kinship rules, the connected tree, photos, historical records and join
links. `OTF_HANDOFF.md` has the full history; read this first.

## Where things are

| What | Where | State |
| --- | --- | --- |
| Code | `main` at `9c1a5fa`, public repo `OGtev317/OTF` | Clean, pushed |
| Site | https://otfroots.com (www redirects) | Deployment `dpl_5XH5mSdJi7Rpj3tMRpuR5CFw516r`, matches `main` |
| Demo | https://otfroots.com/demo.html | The real app on a fictional family kept in the browser |
| Database | Supabase project `fmfsctqtnpjjfxmumolk` | All 8 migrations applied (see below) |
| Email | Resend, `no-reply@mail.otfroots.com` | Sign-up and password reset confirmed from a phone |

Deploys are manual (`vercel deploy --prod` from a clean checkout); pushing to GitHub does not deploy.
Codex also works in `~/Desktop/OTF`: use a separate git worktree and rebase before pushing.

## What exists

- **Accounts and families:** email sign-up with confirmation; an account alone sees nothing. People
  join by an email-bound invitation (which also links them to their place in the tree) or by a
  **join link** that an owner approves, with "Is this them?" suggestions from the tree.
- **Feed, gatherings, members, life profiles.** Paged loading for large families.
- **Connected family tree:** generations joined by lines (a focus view on phones), a panel per person
  with Edit / Add parent / Add child / Add partner, and a note before saving saying who must approve.
  Pending changes show dashed in place; "Waiting for you" lists what you can approve.
- **Who may change what** (enforced in the database, mirrored in `kinship.js` for the screens):
  - Living relatives: anyone adds; owners edit unlinked records; a linked record changes only with
    its person's agreement.
  - People who have died: kept by living immediate family with linked accounts (parent, child,
    sibling, partner); owners are not exempt.
  - **Historical records:** when no immediate relative could still be alive (all deceased, or born
    more than 110 years ago), the nearest linked descendants keep the record, or owners if none.
  - Everyone else's changes become proposals for those people to approve.
- **Photos:** private storage, expiring links, cropped and cleaned on the device. A child's photo
  (under 18, no account) comes only from a parent or guardian linked in the tree.

## Database migrations (all applied to hosted, outside the CLI migration ledger)

`20261018` family pilot · `20261019` community (paused on the site) · `20261020` tree contributions ·
`20261021` kinship · `20261022` add parent · `20261023` person photos · `20261024` historical records ·
`20261025` join requests. Never re-apply one blindly or run `db push`.

## How releases were done (keep doing this)

1. `npm run check`, `npx vitest run` (check the exit code, not just the count), `npm run test:db`
   (seven suites in Docker), `npm run build`, and a browser run against a local Supabase.
2. Hosted migration: read-only checks, then the migration with `commit` replaced by `rollback`
   (dry run), then the real file with `supabase db query --linked --project-ref ... -f`, then verify.
3. Run every `supabase/tests/*.sql` on hosted (each rolls back), then check nothing was left.
4. Deploy, then check the live site in Chromium and WebKit at phone and desktop widths.

Hosted changes and deploys need the owner's approval in Claude Code's `/permissions`.

## Waiting on the owner

- **Onboard the family:** add yourself in Family tree, choose "This is me", add close relatives,
  then invite people or share the join link (Members → Join link).
- **Delete the Cloudflare API token** created for the email setup (dash.cloudflare.com → My Profile →
  API Tokens). It is no longer stored locally and could see four zones.
- Note what relatives find confusing; that decides what comes next.

## Next work (agreed order)

1. **Privacy basics:** leave Roots / delete account (author foreign keys to `auth.users` currently
   block deletion), owner-only tree export (GEDCOM and JSON), birth-date privacy for living people,
   a visible change history with restore (`private.person_history` already holds old versions),
   optional two-step sign-in for owners.
2. **GEDCOM import** from Ancestry and others, with a review of likely duplicates; living
   relatives' birth dates left out by default. Plan: `docs/CONNECTING_FAMILIES.md`.
3. Smaller items: email alerts for owners when someone asks to join (needs a server function);
   suggesting a photo for approval; choosing the photo crop; zoom for very large trees.

Parked after review: zero-knowledge proofs (no outside party to prove anything to) and putting
family records on a blockchain (personal data that may need deletion).

## Pitfalls met

- In zsh, `set -- $var` does not split words; use separate arguments. A broken loop once made
  present DNS records look missing.
- The local Supabase stack resumes from its last state and skips new migrations: run
  `supabase db reset --local`. Include `storage-api` when testing photos.
- Hosted Supabase refuses SQL deletes from storage tables; `supabase/tests/photos.sql` skips them there.
- In the demo, `pilot.js` must load after `demo-backend.js` (`demo.js` imports it dynamically);
  bundling otherwise ran the real Supabase setup first.
- jsdom lacks `scrollIntoView` and `matchMedia`; stub them in tests. Test fakes must return `[]`
  for tables they do not know.
- Class names can clash with the theme (`.mini` was already a 34px icon); the content area's tab
  attribute is `data-tab`, not `data-view`.
- WebKit logs a `style-src-attr` CSP warning for any `<select>`; it is cosmetic.
- Limits: Resend sends 100 emails a day on the free plan; Supabase also caps auth emails per hour.
