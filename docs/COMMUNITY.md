# Community pilot

Status (2026-10-18): paused while Roots focuses on private family posting. This page describes the retained implementation. Community is excluded from the production build; `/community` and `/community.html` redirect to `/`. Existing database records and RPCs are retained, including public read permissions; this update does not decommission the Community API.

Public route: `/community.html`. Anyone may read. Authentication plus a separate public profile and an explicit 18+ self-attestation are required to participate. This is self-declaration, not verified age assurance; no birth date or identity document is collected. Do not onboard children into public participation.

Implemented: 500-character text posts and single-level replies, public display name/bio, likes, chronological cursor pagination, own-post removal, private reports, bilateral signed-in blocking, and operator-controlled suspension. No family records or family names are copied into Community. Public IDs are independent of Auth account IDs; the public RPC never returns email, account IDs, block lists belonging to someone else, or reports. Profile pages can include replies, linked back to their conversation.

Deferred: photos/media, following, reposts, direct messages, search/trending, automated moderation, report notifications, and an operator moderation UI. Keep this a supervised pilot, not an unrestricted general launch. Email onboarding is still pending separately.

## Access and limits

- Community records live in `private.community_*` with RLS enabled and no client table grants. Public `community_read` returns an explicit allowlist; authenticated `community_action` authorizes every mutation. Security-definer functions use an empty search path and explicit execution grants, following [Supabase database function guidance](https://supabase.com/docs/guides/database/functions).
- Family RLS and family RPCs are unchanged. No reference to family tables exists in Community functions.
- Posts/replies are limited to 20 per account per hour, including removed posts; reports to 20 per day. Per-account advisory locks serialize concurrent writes.
- Blocking prevents signed-in interaction and hides posts in both directions. It cannot prevent signed-out reading of public content. It does not change private-family membership or permissions.
- Reports are queued privately for manual review. There is no immediate response guarantee, automatic removal, or notification delivery.
- Removing a root post also hides its replies from public reads. Removal is soft deletion, not erasure: an authorized operator can restore it. Account deletion cascades through Community records; older family-content account-deletion limitations remain unchanged.
- No media uploads or rendering of HTML/links from user posts. Profile/post text is escaped.

## Manual moderation (project operator only)

Use the authenticated Supabase SQL editor or CLI. Never expose a service key or moderation access in the browser. Do not paste report content or account information into public issues, logs, or Git. Reports have no notifications: the operator must check the queue during the supervised pilot.

Inspect the private queue:

```sql
select r.id as report_id, r.reason, r.created_at, r.post_id,
       p.body, p.author_id, a.display_name
from private.community_reports r
join private.community_posts p on p.id=r.post_id
join private.community_profiles a on a.id=p.author_id
where r.resolved_at is null
order by r.created_at limit 50;
```

After reviewing and validating the exact target IDs, the operator can remove a post (`update private.community_posts set removed_at=now() where id='<post UUID>';`), suspend a public profile (`update private.community_profiles set suspended=true where id='<profile UUID>';`), or mark a report reviewed (`update private.community_reports set resolved_at=now() where id='<report UUID>';`). Reversal uses `removed_at=null` or `suspended=false`. These are operator actions, not permissions granted to family owners. Do not run broad updates.

## Deployment and verification

Apply only `20261019010000_community.sql` to the existing project after checking that its functions/tables are absent. The initial family migration was applied outside the Supabase migration ledger: do not run `db push` or reapply the family migration blindly. Deploy the Vite build only after the new RPCs are ready.

`npm run test:db` applies all migrations in order to a uniquely named disposable PostgreSQL container, then runs both family isolation and Community tests. Test fixtures are fictional; test transactions roll back. UI tests use mocked API responses and do not establish hosted authenticated end-to-end behavior. Hosted signup/confirmation and multi-account browser verification still depend on completing email onboarding.
