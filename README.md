# OTF — Only the Family

A place for families to connect, stay in touch, share everyday life, and preserve their family tree across generations.

OTF starts with the founder's own family, with a longer-term goal of welcoming other families into their own separate spaces.

## Project status

The first mobile-friendly web prototype is implemented using HTML, CSS, and browser JavaScript with no package dependencies. It includes a family feed with posts, reactions and replies; editable relatives grouped by generation; and gatherings. Fictional sample data and edits are stored in this browser's local storage. There is no deployed app, authentication service, or shared family database yet.

## Run locally

With a recent Node.js installation, run `npm run dev` and open http://127.0.0.1:5173 on this computer. The server binds to loopback only; this is not a phone-accessible or hosted URL. Run `npm run check` for syntax checks and `npm test` for relationship and saved-state tests.

The responsive layout adapts to phone widths. Google Fonts is an optional external request with system-font fallbacks. Family records and updates are not sent to a backend. Browser storage is not an encrypted family vault and may be cleared by the browser. Use fictional data only.

The prototype supports unspecified parent relationships; richer relationship types, deletion/undo, invitations, media, and account access controls remain future work.

## First release direction

- **Family space:** an invitation-based home for each family, with member and administrator roles.
- **Family feed:** share updates and memories, comment, and react.
- **Family tree:** record relatives and their relationships, including relatives who do not have app accounts.
- **Family profiles:** preserve stories and optional biographical information.
- **Gatherings:** keep track of family events and important dates.

Start with one family and validate the experience before opening enrollment to more families. Direct messaging, genealogy imports, and public profiles are later candidates.

## Public code, private family spaces

This repository is public. Family content is intended to be private by default, visible only to authorized members of that family. Public repository visibility does not make family records public.

Use fictional people and stories for development. Never commit real family records, private media, credentials, or database exports. Privacy and access controls are requirements for the future app, not implemented capabilities today.

## Project documents

- [Product plan](docs/PRODUCT.md)
- [Implementation handoff](OTF_HANDOFF.md)

## License

No open-source license has been selected. Public visibility alone does not grant an open-source license.
