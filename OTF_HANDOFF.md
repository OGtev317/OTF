# OTF handoff

## Direction

OTF means Only the Family. Build an app for families to connect, socialize, stay in touch, and record their family tree. Begin with the founder's family and eventually support separate family spaces for others.



## Person photos (2026-10-18)

- **Storage:** private bucket `family-photos` (JPEG only, 512 KB limit), files at `<family id>/<person id>/<random id>.jpg`. Policies on `storage.objects`: family members read; upload only where `private.may_set_photo` allows; delete where `private.may_remove_photo` allows. The page shows photos through signed links that expire after an hour and are renewed after 50 minutes. CSP `img-src` allows only `https://fmfsctqtnpjjfxmumolk.supabase.co`.
- **Who may set a photo:** whoever may edit the record directly (memorials: their keepers; someone with an account: only them; others: owners). A living child under 18 by recorded birth date, without their own account, takes a photo only from a parent or guardian linked in the tree; owners are not exempt. Owners may always remove a photo. No photo proposals yet.
- **Database** `20261023010000_person_photos.sql` (additive): `people.photo_path`, `photo_updated_at` (a photo does not change the record version), the bucket, the three policies, and `set_person_photo(fid, person, path|null)`, which checks permission, that the file is in that person's folder and already uploaded, and returns the previous path so the app deletes it. A refused set deletes the just-uploaded file.
- **App:** `photo.js` centre-crops to a square of at most 512 px and re-encodes as JPEG on the device (which drops location and other hidden details). Round photos or initials on tree cards, the phone focus view and the Members list; a larger photo with Add/Change/Remove in the person panel. `kinship.js` `mayPhoto` mirrors the rule; the demo keeps uploaded photos in the browser.
- Validation: syntax checks; 17 browser test files (new `tests/photos.test.js`) with a clean exit; all five PostgreSQL suites (new `supabase/tests/photos.sql`); build; end-to-end against a local Supabase with the real storage service in Chromium and WebKit (parent uploads, replaces, a relative sees the photo but is offered no upload for the child, a direct upload into the child's folder is refused with HTTP 400, the relative sets their own photo, the owner removes it, no files left behind).

## Connected family tree (2026-10-18)

The Family tree tab is now a connected tree instead of a list of cards.

- **Layout** (`tree-layout.js`): generations come from recorded parent links; people without recorded parents sit beside their partner or just above their children; rows keep siblings together and put someone who married in right after their partner. Lines (SVG attributes only, no inline styles, per the CSP) join parents to children (one line from between a couple) and partners; the selected person's lines are lit, pending ones dashed. Rows wider than the canvas scroll sideways with a hint; the tree tab lifts the 850px content limit, and the panel moves below the tree from 761–1023px.
- **Phones (≤760px)**: a focus view of the selected person's parents, partners, brothers and sisters, and children, plus an "Everyone in the tree" list. Tapping someone moves the focus.
- **Panel** for the selected person: dates in words and ages, relationships as links, keepers of memorials, source, life profile, pending edits with approve/decline, and Edit, Add parent, Add child, Add partner, This is me. The add/edit form opens in the panel, offers only parents that cannot make a loop, and says before saving whether the change applies at once or who must approve it (`approvalNote`).
- **Pending changes in place**: proposed new relatives are dashed cards marked "Awaiting approval"; records with a pending edit are marked. "Waiting for you" at the top lists claims to confirm and proposals you can approve, plus your own proposals.
- Search (dims others, Enter selects), branch filter (dims), and the rules in a short collapsible list. Motion is brief and off under reduced-motion.
- **Database** `20261022010000_add_parent.sql` (additive): `tree_action` accepts `parent_of` (any person), not only `my_parent`; the addition applies only when the caller may add the new person and change the child's record (`private.may_add`), otherwise it is a proposal (`child_of`) that someone who may do both approves. `kinship.js` (`mayAdd`) and `demo-backend.js` mirror it.

Validation: syntax checks, 15 browser test files (rewritten `tests/tree.test.js`, new layout/approval tests in `tests/tree-view.test.js`, updated demo and loading tests), all four PostgreSQL suites including the new add-parent cases, build, and the built demo in Chromium and WebKit at 1280 and 390 wide (six lines drawn, approval note, pending card, no overflow or errors).

## Email live; demo now runs the real app (2026-10-18)

- **Email:** Resend domain `mail.otfroots.com` (us-east-1) verified with DKIM, SPF MX/TXT and return-path CNAME records in Cloudflare (DNS only), plus `_dmarc.otfroots.com` `v=DMARC1; p=none;`. Supabase custom SMTP: `smtp.resend.com:465`, user `resend`, sender `OTF Roots <no-reply@mail.otfroots.com>`, password = a Resend send-only key restricted to that domain (created by CLI straight to the owner's clipboard, never displayed or stored; two lost copies were deleted). The owner set the token-hash templates from `supabase/templates/`; confirmation and reset links were confirmed working from a phone, including on a different device. The temporary Cloudflare DNS token was removed from the keychain; the owner should delete it in Cloudflare (it could see four zones). The "email onboarding is being set up" notices are removed.
- **Demo:** `/demo.html` loads the real `pilot.js` through `demo.js`, after `demo-backend.js` installs an in-browser stand-in for Supabase (`globalThis.otfDemoBackend`, picked up by `supabase-client.js`). It holds a fictional Bennett family in `localStorage` (`roots-demo-v1`), applies the same tree rules through `kinship.js`, "Start over" resets it, "Leave demo" returns to sign-in, and it never contacts Supabase. The app is loaded with a dynamic import because bundling otherwise ran the shared Supabase setup before the stand-in existed. The old stand-alone prototype (`app.js`, `model.js`, `model.test.js`, `demo-theme.css`) is removed; `npm test` now runs the browser tests. When database rules change, update `demo-backend.js` with them.
- Live: deployed as `dpl_4x4G5cmen83VHTt9SATs5VyjVsYR`; the demo checked on otfroots.com in Chromium and WebKit. WebKit logs a `style-src-attr` CSP warning whenever a page shows a `<select>` (its own control rendering; reproduced on a bare page with only a select). It is cosmetic, appears on signed-in pages too, and is not worth adding `'unsafe-inline'` for.
- Validation: syntax checks, 13 browser test files (new `tests/demo.test.js`), build; the built demo checked in Chromium and WebKit at 390 and 1280 wide (no overflow or errors, posts persist across reload, Start over resets, no Supabase requests).

## Cleaner sign-in artwork and layout (2026-10-18)

Recreated the sign-in tree as `public/brand/roots-signin-clean.png` with the built-in image-generation tool, using the supplied roots.png as a visual reference. Simplified branches and nodes, brighter emerald/teal colors, complete visible roots and crisp contours. Reserved a separate artwork area below the welcome text and beside the form, eliminating the oversized image behind the headline. Mobile stacks copy, artwork and form. Only welcome/sign-in styling changes; original logo, favicon and black family workspace remain unchanged. Exact prompt and provenance are in `docs/VISUAL_DESIGN.md`.

Syntax checks, five model tests, twelve UI tests, build and whitespace checks passed. Vercel `dpl_E8YUuKAarffLxTueafPkxCyaWLt2` reached READY at https://otfroots.com. Live desktop/390px browser review confirmed the full 1254px asset loaded, artwork did not overlap the headline or sign-in form, and no horizontal overflow. No database/auth changes.

## Static Roots logo login background (2026-10-18)

Replaced the login/welcome moving network tree with the supplied `/brand/roots.png` as a large static decorative background on black. Responsive positioning and a dark overlay keep the text and sign-in panel readable. Removed scenery animation initialization and pause controls; family pages still have plain black backgrounds with green outlines. Header logo and favicon unchanged. The source PNG is not edited.

Syntax checks, five model tests, twelve UI tests, build and whitespace checks passed. Updated the existing scene test for a single static logo background, removal on sign-in, return on sign-out and absence of signal paths/controls. Desktop and 390px browser review verified the PNG loaded with no horizontal overflow. Sites guidance informed responsive review; Vercel/Supabase retained and no database/auth changes made.

Released as Vercel `dpl_J72xXXh6b8kHVxG5jKbRPLyDZTRQ` (READY) at https://otfroots.com. Live browser verified the static roots.png background loaded, the sign-in form remained present and there were zero signal paths or motion controls.

## Family feed focus; Community website paused (2026-10-18)

User requested removing Community and focusing on posting within each family, similar to X. Removed the Community header link and Vite production entry. Vercel redirects `/community.html` and `/community` to `/` (temporary 307). Community source, database records, RPCs and public-read permissions remain retained; this is withdrawal of its website, not API decommissioning or data deletion.

Family home is now Family feed, with a family-only reminder, text composer, live 2,000-character counter, newest-first posts, per-post author/time, likes, reply counts, reply forms and older-post loading. Existing family membership/RLS and authorized RPCs still govern reads/writes. Extracted shared markup into `family-feed.js`; `tests/feed-preview.html` is a fictional visual fixture excluded from deployment. Existing failed-write drafts and focus preservation remain supported; count updates after a redraw.

Validation: syntax, five model tests, twelve UI tests, build and whitespace checks passed. Expanded existing integration test verifies counter/draft behavior and escaping. Disposable PostgreSQL suite passed family isolation, post access, invitation/member revocation and existing tree/profile policies. Desktop and 390px browser review used fictional data, with no horizontal overflow. Hosted authenticated posting/email round trips were not exercised. Sites guidance informed responsive validation while preserving Vercel/Supabase.

Released as Vercel `dpl_8FKBAhBrBYmp1j5ezvccB1SKriuV` (READY) at https://otfroots.com. Both old Community routes returned 307 to `/`; browser verified the redirect reaches family sign-in and there are no Community navigation links. Demo still returns 200. Built output contains only family and demo pages, with no Community HTML/JS bundle.

## Visible brand simplified to Roots (2026-10-18)

User requested removing OTF and leaving Roots on all pages. Updated all production page wordmarks, accessible home-link names, titles, descriptions, mobile demo header and on-page brand mentions (including invitation text and tree guidance). Removed the Only the Family header tagline. Preserved roots.png, otfroots.com, internal storage keys, package/project identifiers and authentication settings. Hosted email templates were not changed. Sites guidance informed visual verification; no data/access changes.

Syntax checks, five model tests, twelve UI tests, build and whitespace checks passed. Vercel `dpl_rNZmdKtMvJqBJT7bQK1wvSpkdAur` reached READY at https://otfroots.com; live browser verified Roots home label and page title. Production UI source scan found no remaining OTF/Only the Family brand text.

## Login-only animation and plain workspaces (2026-10-18)

User clarified that only the login/welcome page keeps the moving tree. Family workspaces (including onboarding), Community and demo now use solid black backgrounds and green outlines on cards, inputs, buttons and navigation. Their scene initialization removes the decorative SVG entirely and hides the motion toggle. Returning to welcome restores the animated tree and the saved pause preference. Logo unchanged. Sites guidance used for responsive verification; no database/auth changes.

Syntax checks, five model tests, twelve UI tests, build and whitespace checks passed. Scene regression tests cover welcome to member/public and back. Browser verified zero signal paths and black backgrounds in demo and the fictional member-tree fixture, including no horizontal overflow at 390px.

Released as Vercel `dpl_DXLvcCoxzjHffi9nLMmqsQDVhutC` (READY) at https://otfroots.com. Live checks: login retains 16 signal paths; Community loads with zero signals and computed black body background. Updated the existing login integration assertion to expect no member branch after sign-in.

## Roots PNG identity (2026-10-18)

Replaced all website logo and favicon references with `/brand/roots.png`, a byte-identical copy of the user's Downloads artwork. Adjusted CSS framing to fit the entire blue-green tree and its roots without modifying the original image. Previous `otf.png` remains unused; website colors, wordmark and behavior are unchanged. Sites guidance informed responsive checks; Vercel/Supabase retained.

Syntax checks, five model tests, twelve UI tests, build and whitespace checks passed. Vercel deployment `dpl_9GdeGpKuraAGd87Ssc9gmGJmBDvo` reached READY at https://otfroots.com. Live browser verified the PNG loaded, full tree framing, and no horizontal overflow at 390px. No database/auth changes.

## Supplied PNG brand replacement (2026-10-18, superseded by roots.png)

Replaced the connected-node logo with the user's `/Users/tevdev/Downloads/otf.png` (orange emblem with a flask). `public/brand/otf.png` is a byte-identical copy; original remains untouched. Applied to family/login and Community headers, desktop demo sidebar, phone demo header and all entry-page favicons. CSS frames the transparent margins without editing the image; the OTF Roots wordmark and green animated background remain unchanged. Removed the two superseded SVG logo/icon files from current source; they remain recoverable in Git history.

Sites guidance informed responsive validation while retaining Vercel/Supabase. Syntax checks, five model tests, twelve UI tests, production build and whitespace checks passed. Browser checked loaded PNG and desktop/mobile layout with no horizontal overflow. No authentication/database changes.

Published to Vercel as `dpl_79cL6J1phJZCgZhowAifnrYfCUXw` (READY), aliased to https://otfroots.com. Live browser verified `/brand/otf.png` loaded at its original 1000px resolution.

## Connected-node tree identity (2026-10-18, superseded by supplied PNG)

User chose a modern connected-node tree logo. Added an original, static SVG mark with green branches, a white central junction and three roots, paired with the OTF Roots wordmark and Only the Family tagline. Applied to the shared family header, Community and demo sidebar; the phone demo header gets the compact mark. All entry pages have a matching dark-backed SVG favicon. Source artwork: `public/brand/otf-roots-mark.svg`; small-size icon: `public/brand/favicon.svg`. These are vector assets without private data or external dependencies. Sites guidance informed responsive integration; existing Vercel/Supabase retained.

Validation: syntax checks, five model tests, twelve UI tests including logo accessibility/entry-page coverage and SVG parsing, production build and whitespace checks. Browser reviewed desktop and 390px headers plus the demo phone mark, with no horizontal overflow. No database/auth changes.

Published to Vercel: `dpl_CUzn3Xskh5T3wWCA74yeDvwrN1wX` reached READY at https://otfroots.com. The live browser confirmed the new header mark loaded alongside the existing sign-in form.

## Latest visual update: green connection theme across all pages (2026-10-18)

Applied the login screen's black/dark-panel and white-text theme across Family Circle, Community (feed, profiles, threads and forms), and the fictional demo (home, tree, gatherings and relative dialog). Tree lines, nodes, moving signals and accent colors are now green. Public/demo pages share the full decorative tree; authenticated family views retain the individual decorative branch. Neither artwork depicts private records or inferred ancestry. Removed the demo's photographic hero treatment in favor of the shared theme; no assets or family records were deleted.

Shared scene initialization retains a single background and motion control across redraws. Persistent pause/resume and OS reduced-motion rules remain supported. `network-shared.css` covers shared surfaces and public/demo-specific controls. Sites guidance informed consistent responsive styling while preserving Vercel/Supabase. No authentication, database or access-rule changes.

Validation: syntax checks, five model tests, eleven UI tests (expanded scene/green-palette coverage), production build and whitespace checks passed. Browser reviewed desktop demo and 390px demo relative dialog, Community and fictional authenticated tree fixture; no horizontal overflow. Hosted authenticated accounts/email journeys were not tested.

Published directly to Vercel as `dpl_GRRxmZYKUPEZnnP46e1xzMQNQ4gW` (READY), aliased to https://otfroots.com. Live browser confirmed green signals and dark surfaces on login and Community. The previous kinship deployment was verified before this release; no database migration was needed.

## Latest operational update: OTF Roots domain (2026-10-18)

- User selected `otfroots.com` and authorized configuration plus commit/push to `main`.
- Live canonical URL: https://otfroots.com. Both apex and www are verified Vercel project domains. Cloudflare has DNS-only A records for each pointing to `76.76.21.21` (TTL Auto); there were no prior DNS records to overwrite. No mail records or nameservers were changed.
- `https://www.otfroots.com` returns a 308 redirect to the apex. HTTPS at the apex returns 200; the live browser shows the existing dark animated tree and sign-in form.
- Hosted Supabase Auth Site URL is now `https://otfroots.com`, verified after reload. Added the exact `https://otfroots.com/` callback; retained the old Vercel and local 5174 callbacks. `supabase/config.toml` mirrors these settings. Email provider setup and hosted email round trips remain unverified.
- Production remains `dpl_A5hZNAu3zm1uwz6Fb4DJcTYUvkCV`, verified through Vercel project metadata. No new client deploy or database migration was performed. Vercel project metadata still has no GitHub link; pushing `main` does not release it automatically.
- **Released later the same day:** `20261021010000_kinship.sql` applied to hosted and `47c8fdc` deployed to production. See the kinship section under Next work.
- Sites and Cloudflare guidance informed domain verification while preserving the chosen Vercel/Supabase stack. See `docs/PILOT_SETUP.md` for the hosted configuration.
- Validation: syntax checks, five model tests, eleven UI tests, production build, and whitespace checks passed. Apex, Community and demo returned HTTP 200; www returned 308 to apex. No hosted accounts or family data were created or changed for testing.

## Previous milestone

The user selected mobile-friendly web. A local prototype now includes responsive home/feed, post creation, reactions, comments, gatherings, and a family tree grouped by generation. Relatives can be added and edited with unspecified parent links and story fields. The tree rejects self-links, duplicate parents, missing parents, and ancestry cycles.

Implementation: index.html, style.css, app.js, model.js, and a dependency-free local Node server. Run `npm run dev` at http://127.0.0.1:5173. The server binds to loopback only. No deployment, authentication, shared database, or actual family isolation exists. Data is fictional and browser-local under `otf-demo-v1`. Google Fonts is an optional external asset request.

## Verification

- `npm run check`: passed.
- `npm test`: all five tests passed, covering saved-state validation and tree integrity.
- Chrome UI: created a fictional update and confirmed it persisted after reload; added Alex Bennett under Maya and confirmed generation 3 appeared.
- Inspected the home screen at a 390 x 844 viewport with mobile bottom navigation. Physical phone testing remains open.

## Current milestone: Supabase + Vercel foundation

User chose Supabase and Vercel, then clarified they will create the **email service** themselves. They did not ask to create a second Supabase project. Do not repeat project creation.

- Live app: https://otf-theta.vercel.app
- Supabase: OTF, project ref `fmfsctqtnpjjfxmumolk`, region `us-east-2`, existing Zellar organization `grqvyehhehuqjlyekpna`.
- Vercel: `trbsmith179-9967/otf`, project `prj_nzMJhAMiEYG8puP1i0QRZgcsGtFp`.
- Stack: Vite + Supabase JS. `pilot.js` is the account-backed app; `app.js` remains the independent fictional demo at `/demo.html`. No demo data is uploaded automatically.
- Supabase schema applied transactionally through `supabase db query --linked --project-ref ... --file ...`. This is NOT recorded in the CLI migration ledger. Reconcile before adopting `db push`; do not rerun the initial migration against the existing tables.
- Browser-safe Supabase URL and publishable key configured in Vercel production and preview environments. No service-role key is shipped. No local credentials are retained. Vercel briefly generated an ignored local token file during linking; it was removed.
- Auth site/redirect URL configured for the live origin and local port 5174; password minimum is 12; email confirmation remains enabled and anonymous sign-ins remain disabled.
- Accounts have no family access until family creation or invitation acceptance. Database reads use RLS; writes use authorization-checked RPCs. Invitation codes are hashed, single-use, seven-day bearer codes; owners can revoke them and remove members.
- Tree writes are owner-only, validate parent links/cycles, reject stale versions, and retain prior records privately. UI restore and richer relationship types are not built yet.
- Vercel GitHub connection failed twice despite a public repository. Direct CLI deployment works; automatic deployment on GitHub pushes is NOT configured.

## New verification

- Syntax checks, five model tests, and the simulated UI account/family/post/invite/signout test passed. Failed writes retain drafts and content is escaped.
- Real PostgreSQL isolation suite passed in an isolated Docker container AND on hosted Supabase inside a rolled-back transaction. Synthetic test records and test functions did not persist.
- Anonymous REST reads of the family tables are rejected.
- Vite production build passed and Vercel deployment reached READY. Live home and demo returned HTTP 200; Chrome showed the connected sign-in form.
- Full hosted email signup/confirmation/recovery, two independent authenticated browsers, and physical-phone tests are NOT verified.

## Review and fixes (2026-10-17, after the pilot commit)

The whole pilot was run end to end against a LOCAL Supabase stack (this schema, Supabase's real Auth and the local mail catcher) in Chromium and WebKit at phone width: two accounts sign up and confirm by email, an owner creates a family, posts, builds a tree, plans a gathering and invites; the relative joins, reads and replies; the owner removes them; password recovery in the same and in another browser. The hosted project was not touched. Fixed:

- **Email links on another device.** Supabase's default links carry a one-time code that only works in the browser that asked for it, so a reset link opened from a phone's mail app silently showed the sign-in form. `supabase/templates/` now has confirmation and recovery emails whose links carry a token hash and work on any device; the app verifies them (`emailLink` in `pilot.js`) and strips them from the address bar. Used or expired links say so; an old-style link opened elsewhere explains what to do. **Hosted step:** set these two templates in the OTF project's Authentication → Email Templates when the email service is configured.
- **Pasted invitation codes.** The field cut pastes to 64 characters, so a code pasted with a leading space or line break failed as "invalid or expired". Spaces and line breaks are now removed, and an incomplete code is refused with a clear message before any request.
- **Unsent text and keyboard focus.** Every action re-renders the page, which erased half-written replies and posts and sent keyboard focus to the top. Drafts in the feed, reply and gathering forms (other than the one just saved) and the focused control are now kept.
- **Removed members** are told "You no longer have access to …" instead of silently landing on onboarding.
- **Status messages** floated over the reply box indefinitely on phones; confirmations now fade after six seconds, while errors and messages that need action stay.
- **Repeated buttons** ("Edit story", "Remove access", "Revoke") have names saying whom they are for.

Verified after the fixes: `npm run check`, `npm test` (5), `npm run test:ui` (4, including token-hash links, drafts, button names and pasted codes), `npm run test:db`, `npm run build`, the local end-to-end run in both browsers, and the built pages loading with no Content-Security-Policy violations. The live site still runs the earlier build until it is redeployed.

Noted, not changed (the initial migration is already applied to the hosted project; changes need a new migration): the family row is locked before the membership check in `family_action` and `create_invitation` (harmless but out of order); content authors reference `auth.users` without `on delete`, so deleting an account with posts will fail until account deletion is designed.

## Next work

### Deployment review (2026-10-18, after the kinship release)

- Vercel: production on https://otfroots.com, www 308 to apex, HSTS, CSP and the other security headers on every page; repository files (docs, config, tests, `.vercel`, `assets/source`) are not served. Codex's `dpl_GRRx…` had been deployed from uncommitted branding work; that work is now `cb74a81`.
- Supabase Auth (public settings): email sign-in only, confirmation required, anonymous sign-ins off. The email templates in `supabase/templates/` are still to be set when the email service exists.
- Hosted database, read-only audit: every table has row-level security, clients have SELECT only, every function is security definer with an empty search path, internal helpers are not executable by clients, the `private` schema is not exposed by the API. The four `supabase/tests` suites passed on hosted inside rolled-back transactions; afterwards no test users, families or helper functions remained (a deliberately failing probe confirmed failures are reported).
- Browser review of live pages (Chromium and WebKit, 390 and 1280 wide): no console errors, CSP violations or overflow; labels and image alternatives present; sensible keyboard order. Signed-in views checked against a local stack.
- Fixed: on the dark theme, link-styled light buttons ("Sign in to participate" in Community, "Open in your email app" in Members) had 1.23:1 text contrast (rule now in `network-shared.css`); the Invite card widened the Members page by about 59px at 390px (long option text and invitation link); the "Invitation ready" message no longer stays over the form.
- Deployed `791fd5d` as `dpl_6NKA69c35GJdDWJmpubHfhkmPdNB` on otfroots.com; live recheck: branding present, no text under 4.5:1 on any public page, no errors or overflow in either browser at either width.

### Kinship, memorial keepers, email-bound invitations and paged loading (2026-10-18, branch `fix/kinship-invites-loading`)

Fixes for four gaps found in review: memorials were open to every member and every owner; invitations were bearer codes not tied to a person; the tree had no relationship types, account links or profiles; the family page fetched everything in single requests that Supabase caps at 1,000 rows.

- `20261021010000_kinship.sql` (additive; **applied to hosted OTF on 2026-10-18**, see Release below): `people.parent_kinds` and `people.partners`; `memberships.person_id` / `claim_person_id`; `life_profiles`; invitation `email`, `person_id`, `invited_by`; new-person proposals (`tree_contributions.person_id` nullable). `private.may_apply` decides direct saves and approvals: memorial records and new links to them need a living immediate relative with a linked account (owners are not exempt); a linked record changes only with its person's agreement; otherwise anyone adds and owners edit. Deceased records need a source. Proposals are visible to the contributor, owners and whoever can approve them.
- Invitations: `create_invitation(fid, invite_email, invite_person)` (members may invite, but must name a person; at most 5 open each). `accept_invitation` requires the signed-in account's confirmed email to match and links the account to that person. Invitations made earlier, without an address, still work until they expire. Removing a member revokes their open invitations and deletes their profile. OTF still sends no email: the Members page opens the inviter's email app with the link and message. `?invite=` links are kept in the browser's local storage through sign-up and confirmation.
- Client: `kinship.js` (labels and a mirror of the database rules, for display only), tree "You in this tree", "This is me", owner confirmation of claims, relationship-to-you on new relatives ("they are my parent" also links the caller's record), parent types and partners, keepers shown on memorial cards, approvals shown to whoever may approve. Loading reads every relative, member, profile and pending proposal page by page; the feed shows 20 posts with "Show older posts"; replies and likes load only for shown posts; gatherings show upcoming plus the last 10.
- Not changed: the signed-in branch background is still decorative, not drawn from the member's ancestry.

Verified: `npm run check`, `npm test` (5), `npm run test:ui` (11, including the new kinship, loading and tree tests), `npm run test:db` (four suites, including the new `supabase/tests/kinship.sql`), `npm run build`, and a local Supabase end-to-end run in Chromium and WebKit at 390px (owner keeps their parent's memorial, unrelated memorial waits, missing source refused, email invitation to a tree position, a different account refused, the invited sibling keeps the memorial, profile, owner's edit to a linked record approved by its person, no overflow).

**Release (2026-10-18, user-approved):**
- Pre-checks on hosted, read-only: earlier migrations present, `public.life_profiles` absent, 0 families/members/people/proposals/open invitations. A dry run of the whole migration inside a rolled-back transaction succeeded and left nothing behind.
- Applied with `supabase db query --linked --project-ref fmfsctqtnpjjfxmumolk -f supabase/migrations/20261021010000_kinship.sql` (outside the CLI migration ledger, like the earlier ones; do not reapply). Verified: new table/columns/functions present, old `create_invitation(uuid)` gone, RLS on `life_profiles`, anonymous cannot run `tree_action` or read profiles, authenticated cannot call `private.may_apply` / `private.apply_person` or write profiles directly.
- Deployed `47c8fdc` from a clean checkout: `dpl_7xSbC4CevZVaSYcQwrHLnK7MLG4F`, aliased to https://otfroots.com. Live, read-only: apex 200, www 308 to apex, bundle contains the new client and points at the OTF project, an `?invite=` link is stored and stripped from the address bar with the invitation note shown, demo and Community load, no console errors or overflow in Chromium and WebKit at 390px, anonymous REST reads of `life_profiles`/`people`/`memberships` and anonymous `create_invitation` return 401. No hosted accounts or family data were created.
- Owners must choose "This is me" on their own record to keep their relatives' memorial records. Hosted sign-up and email round trips remain unverified until the email service is set up.

### Signed-in branch background

Extended the dark tree theme to all authenticated family workspace views, onboarding, and load-error screens. A single decorative branch replaces the full welcome tree after sign-in, with six blue signal paths. Cards, comments, forms, selectors, review tables, navigation, and header controls have dark readable surfaces. Scene redraws preserve the SVG; logout/recovery restore the welcome scene. Pause preference and reduced-motion behavior are shared. This does not yet depict a user's actual ancestry or link accounts to tree people. Community/demo are unchanged. No database migration.

Validation: syntax checks, five model tests, eight UI tests including mocked login/logout scene changes and branch redraw/pause persistence, production build, and whitespace checks. Desktop and 389px browser review used the fictional tree fixture; mobile had no horizontal overflow and all six signals ran. Hosted authenticated login remains unverified while email onboarding is pending. Sites skill guided responsive QA, preserving Vercel/Supabase.

Published directly to Vercel: `dpl_A5hZNAu3zm1uwz6Fb4DJcTYUvkCV` reached READY and was aliased to https://otf-theta.vercel.app. Initial deploy returned a transient authorization error; project access was checked and one retry succeeded without credential or permission changes.

### Dark connection-tree welcome page

User requested a black main page, white text, and a light-blue moving system of connections through a tree's branches and roots. Implemented a welcome-only dark theme and locally generated decorative SVG network in `tree-network.js` / `network-welcome.css`. The welcome headline is “Different branches. One family.” A stationary dark sign-in panel keeps controls readable. No real genealogy, identities, network status, or telemetry populates the background. No database/access changes are part of this update.

Pause/Resume signals persists the existing local motion preference; reduced-motion CSS disables animation. The authenticated family pages and Community retain their previous appearance. The fictional demo retains the earlier garden photograph. Main welcome no longer loads that image. Desktop and approximately 390px browser checks verified layout, running/paused animation state, and no horizontal overflow. Tests cover single backdrop creation, motion preference persistence, redraws, and reduced-motion CSS. Actual OS reduced-motion emulation is not part of the browser check.

Syntax checks, five model tests, eight UI tests, production build, and whitespace checks passed. Vercel deployment `dpl_CsDSa8kTYbrsiGSUt8dcpM3QKffb` reached READY at https://otf-theta.vercel.app; the live browser showed the dark theme and 16 running signal paths. No database migration was needed. Sites skill guidance informed responsive validation while preserving the existing hosting stack.

The earlier memorial-steward restrictions and relationship-bound email invitations remain design requests, NOT implemented by this UI change. Current member tree additions and owner-reviewed edits still follow the deployed contribution milestone below.

### Public Community milestone (2026-10-17)

User approved public reading with sign-in required to post/interact. Implemented a text-first `/community.html` beside private Family Circle. Community has separate opt-in public profiles, an 18+ self-attestation (not independently verified age), 500-character posts, single-level replies, likes, chronological keyset pagination, own-post soft removal, private reports, signed-in bilateral blocking, operator suspension, and per-account posting/report limits. No private-family data is copied or exposed. Photos, following, reposts, and automatic moderation remain deferred; scope was communicated during implementation.

The additive `20261019010000_community.sql` migration was applied through the Supabase Management API, outside the CLI migration ledger, after confirming the function was absent. Do not reapply it or the initial family migration blindly. No hosted family rows were read or modified. Hosted anonymous-role checks verified Community reads and denied anonymous family-post/tree reads and Community writes. No synthetic public posts or real account material were created on the hosted service.

Validation: syntax checks, five model tests, five UI tests (including Community mocked opt-in/post/like/report/block/signout, escaped text and retained failed drafts), both real PostgreSQL suites in a disposable local container, production build, and whitespace checks passed. Browser checked public empty-feed state and mobile layout; caught and fixed a fixed-height-header overlap. Hosted authenticated multi-account browser interactions are NOT verified; email onboarding remains pending. Moderation is manual via the operator instructions in `docs/COMMUNITY.md`, with no notifications or response SLA. This is a supervised pilot, not broad-launch readiness.

Sites skill implementation/validation guidance was used while preserving the existing Supabase/Vercel hosting choice. Direct Vercel deployment, not automatic GitHub deployment, remains the release mechanism.

### Extended-family contribution milestone

User selected immediate member additions with owner review of edits to existing records, and explicitly requested commit/push to main. Implemented in the account-backed Family tree, not the independent browser-local demo. New relatives (including memorial records) save immediately. Edits by members, including edits to relatives they added, become proposals. Owner edits apply directly. Review shows original/proposed fields; owners approve/reject with optional notes, and contributors can withdraw. Stale versions, cross-family links, current ancestry cycles, removed contributors, repeated reviews, and unauthorized direct writes are rejected by PostgreSQL.

Added household branch labels/filter, unknown/living/deceased status, optional exact birth/death dates, stories, and source notes. Unknown dates remain blank; approximate dates go in the story. Branch labels do not merge private family spaces or create narrower access boundaries. No tree data is exposed through Community. Personal accounts and tree people are still separate; self-managed life profiles and typed kinship links are future work.

`20261020010000_tree_contributions.sql` is additive. It moves the old `family_action` implementation into a non-client-callable private function and installs a compatible wrapper routing every old/new tree save through review-aware `tree_action`. Clients cannot invoke the legacy implementation or write helpers directly. Existing family posting/invitation/member flows remain unchanged. Legacy clients omit new fields without clearing their saved values. A signed-in member sees only their own proposals; owners see all in their family. Prior records remain in private history; UI restore is not added.

Validation: syntax checks, five model tests, seven UI tests, three real PostgreSQL suites in a disposable Docker container, and Vite build pass. UI tests cover immediate memorial addition, pending edits, owner comparison/approval, draft preservation (including cleared fields and parent checkboxes), branch filtering, escaping, and disabled stale/removed-contributor approval. Local browser reviewed owner/member views and phone-width layout using fictional `tests/tree-preview.html`, which has no backend writes and is excluded from deployment. Hosted authenticated two-account interaction remains unverified while email onboarding is pending.

Deployment: applied only the new migration to OTF after checking that its RPC/table were absent. Hosted privilege checks confirm the authenticated tree RPC is enabled while anonymous RPC/proposal access, direct person updates, and the private legacy bypass are denied. Vercel deployment `dpl_5tff2T8CY4yRsUsBLpwXnzQbZTdd` reached READY at https://otf-theta.vercel.app. No real family content was used for testing or copied into source. Like earlier migrations, this migration must not be blindly reapplied or assumed present in the Supabase CLI migration ledger. Sites skill validation guidance informed the local review while retaining Supabase/Vercel.

### Next requested design: genealogy placement and personal profiles

While finishing the contribution milestone, user asked to map relationship-based placement across children, grandchildren, cousins, aunts/uncles, plus private individual life/work profiles. This is a design request, not yet implemented. The proposed model and privacy/claim boundaries are in `docs/PRODUCT.md`. Birth dates/age can check plausibility, but heritage and dates cannot establish kinship. Explicit parent/child links produce derived relationship labels. Do not infer relationships, auto-merge duplicates, link separate private family spaces, or grant account access based on tree identity alone.

### Living tree visual update

User selected earthy/rooted and cozy/nostalgic scrapbook styling, then requested a photographic living-tree background. The welcome page now uses an AI-generated golden-hour oak with hanging keepsakes, slow CSS camera drift and soft light motion, with stationary cream-paper forms. The demo hero uses the same photograph. This is an animated still, not video or a webcam feed. A persistent Pause scenery control and `prefers-reduced-motion` support stop animation. Authenticated reading areas retain quiet paper backgrounds. No real family images are used.

Assets and the exact built-in image-generation prompt are documented in `docs/VISUAL_DESIGN.md`. Desktop and narrow-screen browser checks verified the image and pause state. The four UI tests and production build pass. This update also includes the previously pushed `bb95f4e` email-link/draft fixes; the hosted email templates still need to be applied when email delivery is configured.


1. User creates an email service. Configure its SMTP and sender domain in OTF Supabase without exposing credentials in chat or source, and set the two email templates from `supabase/templates/`. Do not disable confirmation to bypass email delivery.
2. Verify hosted signup, confirmation, login, password recovery, two-browser sharing, and removed-member denial before onboarding relatives. Remove the pending-email banner when this is actually complete.
3. Resolve Vercel GitHub integration access if automatic deployment is wanted.
4. Add relationship types, restore/deletion/export, privacy/consent decisions, and private photos/birthdays in subsequent work. Family Council and shared finances remain deferred.

Public source code is authorized. Real family data must not be included in the repository or a public demo.
