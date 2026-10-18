# OTF living family tree

## Current sign-in artwork: clean Roots tree (2026-10-18)

The sign-in page uses a new static tree illustration on black, displayed in a reserved area beneath the welcome copy and beside the form. The tree is no longer enlarged beyond its source resolution or placed behind text. Other pages retain plain black backgrounds and green outlines; the header logo and favicon continue using the user's original roots.png.

- Asset: `public/brand/roots-signin-clean.png` (1254 × 1254 PNG).
- Created with the built-in image-generation tool, using `public/brand/roots.png` as a visual reference. Original artwork remains unchanged.
- Layout: `memory-scene.js`, `network-welcome.css`, `network-shared.css`. Static, without animation or pause controls.
- Exact generation prompt:

> Use case: logo-brand / sign-in background illustration. Input image 1 is a reference for the Roots family app's current tree identity, not a website screenshot. Recreate a much sharper, cleaner, refined rendition of this connected family tree for the sign-in page ONLY. Single centered complete tree with spreading canopy and visible symmetrical roots, elegant trunk formed of a few parallel circuit-like lines, evenly spaced connected nodes and restrained geometric leaf forms. Preserve the recognizable tree-and-roots silhouette and emerald, mint and subtle teal color family. Simplify the noisy tiny leaf facets into crisp deliberate branches and nodes. Strong clear contours, exceptionally clean polished vector-like graphic rendered at high resolution. Flat pure black background. Tree occupies 80 percent of a square canvas vertically, generous margins, all roots and tips fully visible. Bright but tasteful green lines, restrained highlights, NO blur, NO bloom, NO haze, NO grain, NO shadow, NO texture, NO text, NO letters, NO UI, NO border, NO mockup. This is a background illustration asset; do not add login controls. Static image, modern and calm.

## Earlier welcome page: connection tree

The user replaced the photographic welcome direction with a black page, white text, and light-blue signals moving through the branches, trunk, and roots of a tree. `tree-network.js` generates deterministic decorative SVG geometry; `network-welcome.css` supplies the welcome-only dark theme and CSS stroke-dash animations. The tree has no real family records, account identities, live network status, or data connections. No new image generation, video, or animation dependency is used.

The form stays stationary on a dark panel. Pause/Resume signals shares the existing local `otf-motion-paused` preference. OS reduced-motion disables the signal animation. The fictional demo retains its garden photograph. The welcome page no longer requests the garden image. The Sites skill guided responsive layout and validation while retaining the existing Vercel workflow.

## Signed-in individual branch

Authenticated family pages (onboarding, feed, tree, gatherings, members, and load errors) use `network-member.css`: black backgrounds, white text, readable dark panels, and one decorative branch with six moving blue signals. The branch is shared artwork, not the user's verified pedigree; accounts are not yet linked to genealogical people. Section redraws preserve the existing SVG and motion preference. Sign-out and password recovery restore the whole-tree welcome scene. Community keeps its separate appearance. No permissions, family records, or backend behavior changed.

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
