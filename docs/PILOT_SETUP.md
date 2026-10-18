# Supabase + Vercel pilot

## Architecture

Vite builds the mobile web app for Vercel. The browser uses Supabase Auth and a browser-safe publishable key. PostgreSQL enforces family membership for reads using row-level security. All writes go through narrowly scoped database functions that check membership and lock the family row for the duration of the operation.

The browser never receives a service-role key. New families contain no fictional seed records. The previous browser-local prototype is separate at `/demo.html`; there is no automatic import of demo data into a family.

## Configuration

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel for the appropriate environment. Never use a secret or service-role key in either variable. Rebuild after changing environment variables. For local work, inject the same browser-safe settings into the Vite process environment.

The initial schema is `supabase/migrations/20261018010000_family_pilot.sql`. It is transactional. Apply once to an empty OTF project, not to an unrelated project's database. Subsequent changes require new migrations. The hosted bootstrap uses the Supabase Management API through the CLI; its application is recorded in the handoff rather than Supabase's CLI migration ledger. Do not blindly run `db push` against an already bootstrapped project without reconciling that ledger first.

Set Supabase Auth's site URL to the production origin and allow that exact origin as an authentication redirect. Keep email confirmation enabled. Use the confirmation and recovery templates in `supabase/templates/` (also wired into `supabase/config.toml` for local stacks): their links carry a token hash, so they work when opened on a different device from the one that asked, such as a phone's mail app. Supabase's default links only work in the original browser. Password recovery returns to the root page and presents a new-password form. Avoid wildcard redirect rules for production.

## Production domain (configured 2026-10-18)

- Canonical origin: `https://otfroots.com`, attached to the existing Vercel `otf` project.
- Cloudflare DNS: A records for `@` and `www`, both `76.76.21.21`, DNS only (proxy off), TTL Auto. Vercel verified both; its newer recommended IP is optional, not a configuration failure. Re-inspect Vercel's current recommendations before future DNS changes.
- Vercel project-domain setting: `www.otfroots.com` redirects permanently (308) to `otfroots.com`. This is hosted configuration, not a client build redirect.
- Supabase Auth Site URL: `https://otfroots.com`. Exact allowed callbacks: `https://otfroots.com/`, `https://otf-theta.vercel.app/`, and `http://127.0.0.1:5174/`. Existing callbacks remain valid. The checked-in config mirrors the hosted values; editing it alone does not update hosted Auth.
- No email provider or mail DNS records were configured. Hosted signup, confirmation, and recovery still need end-to-end testing with the intended email service.

GitHub automatic deployment is not connected. The kinship migration was applied to hosted and the client on `main` deployed to the domain on 2026-10-18; see `OTF_HANDOFF.md`. Apply any future migration to hosted before deploying a client that depends on it.

## Accounts and invitations

An account alone grants no family access. A user can create a family as its owner or redeem an invitation to become a member. Invitations are high-entropy bearer codes: share privately. The database stores only their hashes, accepts them once, and rejects revoked or expired codes. The app does not send invitation messages; the owner shares the code themselves. Owners can remove a member, which blocks subsequent reads and writes. Previously viewed or copied content cannot be recalled.

Members can post, comment, react, and create all-day gatherings. Owners manage invitations, membership, and tree records. Tree records are independent of accounts. Parent links are currently unspecified, bounded to eight, and validated for family membership, duplicates, self-links, and cycles. Version numbers reject stale edits. Prior records are retained in a private history table; a user-facing restore flow is not implemented yet.

## Verification

- `npm run check`: JavaScript syntax.
- `npm test`: original demo model tests.
- `npm run test:ui`: simulated Supabase client tests for the account/family/post/invite journey, draft preservation on errors, escaping, and sign-out cleanup. This does not establish hosted Auth/email behavior.
- `npm run test:db`: real PostgreSQL tests in an isolated disposable Docker container. Tests use synthetic identities and roll back their data. No host port or volume is mounted; only the exact container created by the runner is removed. Requires Docker and `postgres:17`.
- `npm run build`: production Vite bundle.

Supabase Auth is simulated by a minimal `auth.uid()` function in the local database suite. Hosted tests, when recorded in the handoff, use the real database roles and run within a rolled-back transaction.

## Before inviting real relatives

1. Verify hosted email confirmation, sign-in, recovery, and session expiry using the intended email delivery setup. Supabase's default email sender has delivery restrictions; configure a suitable custom SMTP service for external relatives.
2. Verify two independent signed-in browsers can share records and that a removed member loses access on refresh.
3. Agree on consent, profiles for children, deletion/export, tree-edit restoration, and backup/recovery procedures.
4. Test on physical phones and review accessibility.

Private photo uploads, birthday fields, real-time subscriptions, paginated history, account deletion, family export, restore UI, and automated email delivery are not part of this foundation. Use Refresh to fetch another member's updates. Family Council, voting, wallets, and shared money are outside this milestone.

## Primary references

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
