# OTF — Only the Family

A place for families to connect, stay in touch, share everyday life, and preserve their family tree across generations.

OTF starts with the founder's own family, with a longer-term goal of welcoming other families into their own separate spaces.

## Project status

The mobile web pilot uses Vite, Supabase Auth/PostgreSQL, and Vercel. It includes accounts, family creation, single-use invitations, membership removal, shared posts/replies/reactions, tree records, and gatherings. The original fictional browser-local prototype remains at `/demo.html`.

Review: https://otf-theta.vercel.app

The public [Community pilot](https://otf-theta.vercel.app/community.html) is separate from private family spaces: anonymous reading, adult public-profile opt-in, text posts/replies, likes, reporting, and signed-in blocking. See [Community scope and manual moderation](docs/COMMUNITY.md). Media, following, and reposts are deferred; this is a supervised pilot with manual report review, not a general-launch readiness claim.

The Supabase schema is deployed and its isolation tests passed locally and on the hosted database. Email delivery is not configured for external relatives; the user is setting up an email service. Full hosted sign-up, confirmation, recovery, and two-browser account testing remain open. This is a pilot foundation, not a completed family launch.

## Run locally

Use Node.js 24+, run `npm ci`, then `npm run dev`. Open the printed local URL. The server binds to loopback only. Without Supabase environment settings the home page explains that account access is unconfigured; `/demo.html` still works. See `.env.example` for browser-safe variable names and [pilot setup](docs/PILOT_SETUP.md) for deployment and authentication details.

Run `npm run check`, `npm test`, `npm run test:ui`, and `npm run build`. `npm run test:db` runs PostgreSQL isolation tests in a disposable Docker container. Google Fonts is an optional external request with system-font fallbacks. Supabase handles shared pilot records; only `/demo.html` uses browser-local fictional records. Use fictional data until the remaining pilot checks are complete.

In the account-backed family tree, members can add relatives immediately; changes to existing people require owner approval. Owners can edit directly, compare proposals, approve/reject with a note, and members can withdraw their pending edits. Household branch labels, explicit living/deceased/unknown status, optional birth/death dates, stories, and source notes are supported. Branches do not merge separate families or create new privacy boundaries. Tree relationships remain unspecified parent links. Typed relationships, account-linked life profiles, duplicate review, deletion/export, private photos, and a restore interface remain future work. There are no DAO, voting, wallet, or shared-funds features.

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
