# OTF living family tree

## Current welcome page: connection tree

The user replaced the photographic welcome direction with a black page, white text, and light-blue signals moving through the branches, trunk, and roots of a tree. `tree-network.js` generates deterministic decorative SVG geometry; `network-welcome.css` supplies the welcome-only dark theme and CSS stroke-dash animations. The tree has no real family records, account identities, live network status, or data connections. No new image generation, video, or animation dependency is used.

The form stays stationary on a dark panel. Pause/Resume signals shares the existing local `otf-motion-paused` preference. OS reduced-motion disables the signal animation. Authenticated family pages and Community retain their existing styles; the fictional demo retains its garden photograph. The welcome page no longer requests the garden image. The Sites skill guided responsive layout and validation while retaining the existing Vercel workflow.

## Earlier photographic direction (retained for the demo)

Direction selected by the user: earthy and rooted, cozy and nostalgic, a living family tree mixed with a scrapbook. The follow-up asked for a photographic live-view background.

The earlier welcome page used an animated still photograph: slow CSS pan/zoom and changing sunlight, with a fixed, readable form. It was not video, a live camera, or an interactive genealogical visualization. The fictional demo still uses this asset in its hero. The real family tree remains a separate app feature.

- Served asset: `public/images/family-tree-garden.jpg` (JPEG delivery copy).
- Original source: `assets/source/family-tree-garden.png` (excluded from Vercel upload).
- Generated using the built-in image-generation tool. No uploaded or real family photographs were used.
- Rendering: `memory-scene.js`, `earthy.css`, and `living-photo.css`. CSS layers keep the theme consistent in development and production.
- Pause scenery stores only a local motion preference. Operating-system reduced-motion preference disables the animations automatically.

## Exact generation prompt

Use case: photorealistic-natural. Asset type: landscape photographic background for OTF Only the Family, a warm nostalgic family connection web app. Create a cinematic realistic photograph of one magnificent old oak tree in a peaceful garden at golden hour, broad low branches and a lush olive-green canopy, textured trunk, warm meadow grass, soft sunlight filtering through leaves. Several small vintage wooden photo frames and cream scrapbook cards hang naturally on thin twine from the lower branches, showing subtle indistinct sepia landscape memories, not identifiable people, not legible text. Earthy forest green, honey sunlight, warm cream, gently faded nostalgic film character. The whole central tree and its lower trunk should be visible, framed at comfortable distance, with leafy background depth and calm atmosphere. Wide landscape composition suitable for full-page cover background with room for interface overlay, rich natural detail, soft contrast, believable garden photography rather than cartoon or illustration. No lettering, logos, watermarks, UI, diagrams or borders.
