# OTF product plan

## Purpose

Help families maintain everyday connections while preserving the people, relationships, and memories that make up their shared history.

## First users

The founder's family is the initial pilot. The experience should work for relatives with different levels of technical comfort: readable text, clear navigation, simple invitations, and accessible forms.

## First useful journey

1. Create an account and a family space.
2. Invite a relative, who joins only that family space.
3. Share an update and respond to another family member.
4. Add relatives to the tree and connect their relationships.
5. Open a relative's profile to see their story and connections.

## Initial screens

| Screen | Purpose |
| --- | --- |
| Home | Family updates, a post composer, and upcoming gatherings |
| Family tree | Browse relationships and add relatives |
| Person | Read and edit permitted profile information and stories |
| Gatherings | View and create family events |
| Family settings | Manage invitations, membership, and roles |

## Data model direction

- **User:** an authenticated account.
- **Family:** a separately authorized family space.
- **Membership:** a user's role within a family; users may belong to more than one family.
- **Person:** a family-tree record, optionally linked to an account. Deceased relatives and relatives without accounts remain representable.
- **Relationship:** a typed link between two people within a family. Parent-child links should support biological, adoptive, step, guardian, and unspecified relationships without assuming a single household structure.
- **Post and comment:** family-scoped social content.
- **Event:** a family gathering with its date, time zone, and optional location.
- **Media:** private files authorized through the associated family and content record.

Tree editing must prevent self-links, duplicate links, and ancestry cycles. Unknown dates and incomplete relationships should be valid. Do not infer sensitive relationship facts from names or profile details.

## Privacy and release requirements

Database family isolation, expiring single-use invitations, member removal, and private prior-version retention are implemented in the pilot foundation. Email onboarding, export/deletion, and a user-facing restore flow remain open.

- Enforce family membership on the server for every read and write, including media access.
- Use expiring invitations with explicit acceptance and membership removal.
- Keep living relatives' information private by default and collect only necessary details.
- Provide clear editing permissions, deletion, and an export path for family records.
- Decide how profiles for children, consent, and disputed tree edits work before using real family information.
- Verify that a member of family A cannot access family B's records by changing identifiers.
- Preserve recoverability for mistaken tree edits through an appropriate history or undo design.

## Milestones

1. **Foundation:** public Git repository, product direction, and platform choice.
2. **Local prototype:** usable navigation, fictional family feed, and an editable fictional tree. Label any device-only persistence explicitly.
3. **Private family pilot:** accounts, invitation flow, persistent storage, server-enforced family isolation, and access-control validation.
4. **Family feedback:** improve sharing, gatherings, accessibility, and tree maintenance.
5. **Multiple families:** verify isolation and onboarding before wider availability.

## Open implementation decisions

### Public Community

Alongside private Family Circle, a separate `/community.html` provides public chronological text posts, replies, profiles, and likes. Reading is anonymous; participation requires sign-in, explicit public-profile opt-in, and an 18+ self-attestation. No private family content is published automatically. Reports and signed-in blocking are available; moderation is operator-managed during the pilot. See [Community scope and operator guide](COMMUNITY.md). Photos, following, reposts, and automated moderation are deferred.

### Extended-family contributions (requested next)

The user wants multiple household branches within a shared extended-family tree, with individual contributions and memorial records for deceased relatives. Approval policy is awaiting the user's choice. Do not merge existing separate family spaces, expose their records to one another, or infer who is deceased. Design memorial dates, stories, sources, and relationship types with unknown dates and non-account relatives supported. Existing tree edits remain owner-only until the contribution workflow is implemented and verified.

- First client selected: mobile-friendly web. The initial local prototype uses dependency-free HTML/CSS/JavaScript.
- Hosting selected: Vercel. Authentication and database selected: Supabase. Private media uploads are deferred.
- Visual identity and pilot invitation policy.

The web app and database are deployed. The user is setting up an email service before relatives can complete email onboarding. Family connection is first; Family Council and shared finances are later phases, outside this milestone.
