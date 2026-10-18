# OTF handoff

## Direction

OTF means Only the Family. Build an app for families to connect, socialize, stay in touch, and record their family tree. Begin with the founder's family and eventually support separate family spaces for others.

## Current milestone

The user selected mobile-friendly web. A local prototype now includes responsive home/feed, post creation, reactions, comments, gatherings, and a family tree grouped by generation. Relatives can be added and edited with unspecified parent links and story fields. The tree rejects self-links, duplicate parents, missing parents, and ancestry cycles.

Implementation: index.html, style.css, app.js, model.js, and a dependency-free local Node server. Run `npm run dev` at http://127.0.0.1:5173. The server binds to loopback only. No deployment, authentication, shared database, or actual family isolation exists. Data is fictional and browser-local under `otf-demo-v1`. Google Fonts is an optional external asset request.

## Verification

- `npm run check`: passed.
- `npm test`: all five tests passed, covering saved-state validation and tree integrity.
- Chrome UI: created a fictional update and confirmed it persisted after reload; added Alex Bennett under Maya and confirmed generation 3 appeared.
- Inspected the home screen at a 390 x 844 viewport with mobile bottom navigation. Physical phone testing remains open.

## Next work

1. Review the local prototype with the user.
2. Add relationship types, undo/history, and record management before real family use.
3. Select authentication, database, private-media storage, and hosting for the private family pilot.
4. Implement and test server-enforced family isolation before inviting real relatives.

Public source code is authorized. Real family data must not be included in the repository or a public demo.
