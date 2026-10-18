# OTF — Only the Family

A place for families to connect, stay in touch, share everyday life, and preserve their family tree across generations.

OTF starts with the founder's own family, with a longer-term goal of welcoming other families into their own separate spaces.

## Project status

The mobile web pilot uses Vite, Supabase Auth/PostgreSQL, and Vercel. It includes accounts, family creation, single-use invitations, membership removal, shared posts/replies/reactions, tree records, and gatherings. The original fictional browser-local prototype remains at `/demo.html`.

Review: https://otfroots.com (`www.otfroots.com` redirects here; the original Vercel URL remains available).

Roots is focusing on private family spaces. The Family feed provides text posts (up to 2,000 characters), replies, likes, newest-first ordering and older-post loading. Posts stay inside the selected family. Community is paused: its website is excluded from production and old Community links redirect to sign-in. Existing Community source and database records remain available for a future decision; its database API has not been decommissioned.

The Supabase schema is deployed and its isolation tests passed locally and on the hosted database. Email delivery is not configured for external relatives; the user is setting up an email service. Full hosted sign-up, confirmation, recovery, and two-browser account testing remain open. This is a pilot foundation, not a completed family launch.

## Run locally

Use Node.js 24+, run `npm ci`, then `npm run dev`. Open the printed local URL. The server binds to loopback only. Without Supabase environment settings the home page explains that account access is unconfigured; `/demo.html` still works. See `.env.example` for browser-safe variable names and [pilot setup](docs/PILOT_SETUP.md) for deployment and authentication details.

Run `npm run check`, `npm test`, `npm run test:ui`, and `npm run build`. `npm run test:db` runs PostgreSQL isolation tests in a disposable Docker container. Google Fonts is an optional external request with system-font fallbacks. Supabase handles shared pilot records; only `/demo.html` uses browser-local fictional records. Use fictional data until the remaining pilot checks are complete.

In the account-backed family tree, anyone in the family can add living relatives immediately. Memorial records (people who have died), and new links to them, are added and changed only by their immediate family—a parent, child, brother or sister, or partner whose account is linked to their place in the tree—and need a source; anyone else's additions and edits wait for one of them to approve. A record linked to someone's account changes only with that person's agreement; owners change other records, confirm who people are ("This is me"), and can decline any proposal. Parent links have a type (biological, adoptive, step, guardian, not specified), partners are recorded, and each member sees relationships from their own place (grandparent, aunt or uncle, second cousin once removed…). Members keep a private life profile for their family. Invitations name one email address and usually one person in the tree; they open in the inviter's own email app and work only for that address. The family page loads every relative and pending proposal page by page, and the feed 20 posts at a time. Duplicate review, deletion/export, private photos, and a restore interface remain future work. There are no DAO, voting, wallet, or shared-funds features.

## First release direction

- **Family space:** an invitation-based home for each family, with member and administrator roles.
- **Family feed:** share updates and memories, comment, and react.
- **Family tree:** record relatives and their relationships, including relatives who do not have app accounts.
- **Family profiles:** preserve stories and optional biographical information.
- **Gatherings:** keep track of family events and important dates.

Start with one family and validate the experience before opening enrollment to more families. Direct messaging and genealogy imports are later candidates. Public Community profiles are separate from family-tree records.

## Public code, private family spaces

This repository is public. Family content is intended to be private by default, visible only to authorized members of that family. Public repository visibility does not make family records public.

Use fictional people and stories for development. Never commit real family records, private media, credentials, or database exports. Database access controls are implemented and tested; that does not establish email delivery, production readiness, or end-to-end encryption.

## Project documents

- [Product plan](docs/PRODUCT.md)
- [Implementation handoff](OTF_HANDOFF.md)

## License

No open-source license has been selected. Public visibility alone does not grant an open-source license.
