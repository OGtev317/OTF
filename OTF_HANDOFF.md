# OTF handoff

## Direction

OTF means Only the Family. Build an app for families to connect, socialize, stay in touch, and record their family tree. Begin with the founder's family and eventually support separate family spaces for others.

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

### Living tree visual update

User selected earthy/rooted and cozy/nostalgic scrapbook styling, then requested a photographic living-tree background. The welcome page now uses an AI-generated golden-hour oak with hanging keepsakes, slow CSS camera drift and soft light motion, with stationary cream-paper forms. The demo hero uses the same photograph. This is an animated still, not video or a webcam feed. A persistent Pause scenery control and `prefers-reduced-motion` support stop animation. Authenticated reading areas retain quiet paper backgrounds. No real family images are used.

Assets and the exact built-in image-generation prompt are documented in `docs/VISUAL_DESIGN.md`. Desktop and narrow-screen browser checks verified the image and pause state. The four UI tests and production build pass. This update also includes the previously pushed `bb95f4e` email-link/draft fixes; the hosted email templates still need to be applied when email delivery is configured.


1. User creates an email service. Configure its SMTP and sender domain in OTF Supabase without exposing credentials in chat or source, and set the two email templates from `supabase/templates/`. Do not disable confirmation to bypass email delivery.
2. Verify hosted signup, confirmation, login, password recovery, two-browser sharing, and removed-member denial before onboarding relatives. Remove the pending-email banner when this is actually complete.
3. Resolve Vercel GitHub integration access if automatic deployment is wanted.
4. Add relationship types, restore/deletion/export, privacy/consent decisions, and private photos/birthdays in subsequent work. Family Council and shared finances remain deferred.

Public source code is authorized. Real family data must not be included in the repository or a public demo.
