# Dual-Engine AR — WebXR primary + 8th Wall fallback

**Date:** 2026-05-18
**Status:** Approved (Option A)
**Supersedes:** the reverted `2026-05-18-8thwall-migration-design.md` attempt

## Problem

`public/ar.html` runs A-Frame 1.6.0 + WebXR hit-test. WebXR `immersive-ar` is
unsupported on every iOS browser (all WebKit) — the experience is unreachable on
iPhone/iPad. The earlier full migration to 8th Wall was reverted because 8frame
was loaded from `cdn.8thwall.com` (Niantic's hosted CDN, offline since
2026-02-28) and the page hung.

## Goal

Keep **WebXR as the primary engine** (Android Chrome, native ARCore). Add the
**open-source 8th Wall world-tracking engine as a fallback** for iOS and any
non-WebXR device. Both engines are markerless — the place-anywhere UX is
preserved on every platform. No marker / `board.mind` regression.

## Architecture — the CustomEvent boundary

The HUD + multiplayer layer (`healing-sync.js`, `end-sequence.js`,
`components.js`) talks to the AR engine ONLY through DOM `CustomEvent`s. Both
engine adapters emit the same contract, so those three files are **untouched**.

Boundary events (on `document`):
- `surface-detected` — no detail — tracking found a placeable surface
- `surface-lost` — no detail — surface tracking lost
- `object-placed` — `{ x, y, z, autoPlaced }` — witness placed
- `placement-broadcast` — consumed by adapters — remote user placed; auto-place locally

Each placement adapter is an A-Frame component exposing `autoPlace()` and
emitting the three events above. Identical contract for both engines.

## File ownership

| File | Owner | New? |
|------|-------|------|
| `public/vendor/8thwall/aframe-v1.5.0.min.js` | Stream A | new (vendored) |
| `public/js/eighth-wall-placement.js` | Stream A | new (corrected rewrite) |
| `public/ar.html` | Stream B | restructured |
| `public/js/ar-bootstrap.js` | Stream B | new |
| `next.config.ts` | Stream B | edited (CSP) |
| `public/js/webxr-placement.js` | — | unchanged (already correct on main) |
| `public/js/components.js` / `healing-sync.js` / `end-sequence.js` | — | unchanged |

Streams A and B touch **disjoint files** and run in parallel.

## ar.html structure (Stream B)

```
<body>
  #loading-overlay        (static, unchanged)
  #enter-gateway          (static, unchanged)
  #ar-unsupported         (static, unchanged)
  #ar-overlay             (static HUD, unchanged)
  <div id="ar-stage"></div>             <!-- scene mount point, empty -->
  <template id="tmpl-scene-webxr">...</template>
  <template id="tmpl-scene-eighthwall">...</template>
  <script src="https://cdn.ably.com/lib/ably.min-2.js" defer></script>
  <script src="js/ar-bootstrap.js"></script>
  <script> /* engine-AGNOSTIC HUD logic, inline */ </script>
</body>
```

- No static `<a-scene>`. No A-Frame `<script>` in static HTML.
- `<template>` content is inert — A-Frame does not parse it until cloned.
- The inline HUD script keeps ONLY engine-agnostic logic: status pills, healing
  arc, `healing-update` listener, `surface-detected`/`surface-lost`/`object-placed`
  listeners. It must NOT reference the scene at parse time — look up
  `#scene-root` lazily inside the `object-placed` handler. It listens for the
  unified `ar-session-started` event instead of `enter-vr`/`realityready`.
- All engine-specific logic (support check, Enter-AR button, session start)
  moves into `ar-bootstrap.js`.

### `#tmpl-scene-webxr` — current WebXR scene, lifted verbatim
`<a-scene webxr="requiredFeatures: hit-test; optionalFeatures: dom-overlay,local-floor; overlayElement: #ar-overlay" ...>` with the two lights, `<a-entity id="placement-reticle" webxr-placement>`, `#scene-root` + children, `<a-entity camera>`.

### `#tmpl-scene-eighthwall` — 8th Wall scene
```html
<a-scene
  xrweb="allowedDevices: any"
  landing-page
  xrextras-loading
  xrextras-runtime-error
  renderer="antialias: true; alpha: true; logarithmicDepthBuffer: false; colorManagement: true"
  vr-mode-ui="enabled: false">
  <a-entity light="type: ambient; color: #ffffff; intensity: 0.8"></a-entity>
  <a-entity light="type: directional; color: #ffffff; intensity: 0.6" position="1 2 1"></a-entity>

  <!-- invisible ground plane: the raycast target for placement (.cantap) -->
  <a-entity id="ar-ground" class="cantap"
            geometry="primitive: plane; width: 1000; height: 1000"
            rotation="-90 0 0"
            material="visible: false"></a-entity>

  <a-entity id="placement-reticle" eighth-wall-placement></a-entity>

  <a-entity id="scene-root" visible="false">
    <a-entity id="character-root" character-animator="healingPercent: 0; mode: a" position="0 -0.18 0"></a-entity>
    <a-entity tornado-effect="intensity: 1" position="0 0 0"></a-entity>
    <a-entity barbed-wire="intensity: 1" position="0 0 0"></a-entity>
    <a-entity explosion-flash="intensity: 1" position="0 0 0"></a-entity>
  </a-scene>

  <!-- camera Y MUST be non-zero (8th Wall: sets content scale + ground ref) -->
  <a-camera position="0 8 0"
            cursor="rayOrigin: mouse; fuse: false"
            raycaster="objects: .cantap"></a-camera>
</a-scene>
```
Stream A confirms the exact `xrweb` config and camera Y against the official
`8thwall/aframe-world-effects-example` (`src/index.html`) and messages Stream B
if the placeholder values above need adjustment.

## ar-bootstrap.js (Stream B)

Runs at page load. Responsibilities:

1. **Detect:** `webxr` if `navigator.xr` && `await navigator.xr.isSessionSupported('immersive-ar')` resolves true; else `eighthwall` if `navigator.mediaDevices?.getUserMedia` exists; else unsupported → show `#ar-unsupported`.
2. **Load scripts sequentially** (each appended `<script>` chained on `onload`):
   - **WebXR:** `aframe.io/releases/1.6.0/aframe.min.js` → `js/components.js` → `js/webxr-placement.js` → `js/healing-sync.js` → `js/end-sequence.js`
   - **8th Wall:** `vendor/8thwall/aframe-v1.5.0.min.js` (self-hosted 8frame) → `@8thwall/xrextras` (jsDelivr) → `@8thwall/landing-page` (jsDelivr) → `js/components.js` → `js/eighth-wall-placement.js` → `js/healing-sync.js` → `js/end-sequence.js`; AND `@8thwall/engine-binary@1/dist/xr.js` from jsDelivr with `async`, `crossorigin`, `data-preload-chunks="slam"`, and an `onerror` that shows `#ar-unsupported`.
   - 8frame replaces stock A-Frame entirely — never load both.
3. **Inject scene:** clone the matching `<template>` into `#ar-stage` AFTER the A-Frame build + components + adapter scripts have loaded (so components are registered before the scene parses).
4. **Gateway wiring:**
   - WebXR: Enter-AR button → `scene.enterAR()`; on `enter-vr` dispatch `ar-session-started`.
   - 8th Wall: Enter-AR button → hide gateway, reveal `landing-page` (it owns the iOS user-gesture `getUserMedia` start); on `realityready` dispatch `ar-session-started`.
5. Emit `ar-session-started` (CustomEvent on `document`) — the unified signal the inline HUD script and `healing-sync` init hook listen for.

## eighth-wall-placement.js (Stream A)

Corrected rewrite of the reverted adapter. Fixes vs the reverted version:
- **Use the documented placement pattern**, not a hand-rolled screen-center ray
  against a math `y=0` plane. The `#ar-ground.cantap` entity + the camera's
  `raycaster="objects: .cantap"` are the placement mechanism. Tap → A-Frame
  fires `click` carrying `evt.detail.intersection.point` → emit `object-placed`.
- **Reticle:** each `tick()`, read the camera raycaster's current `.cantap`
  intersection; position the reticle there; show/hide it; edge-detect to emit
  `surface-detected` / `surface-lost`.
- **Tracking lifecycle:** treat `realityready` as ready. Verify the correct
  tracking-loss event/status against the 8th Wall docs — do not guess.
- `autoPlace()` unchanged in contract: places at `{0,0,-1.5}`, `autoPlaced:true`.
- Never throws when `XR8` is absent (desktop / WebXR path never loads this file,
  but stay defensive).

## next.config.ts (Stream B)

Add a `Content-Security-Policy` header scoped to `/ar.html` allowing:
- `script-src` / `connect-src`: `'self'`, `cdn.jsdelivr.net`, `cdn.ably.com`,
  and Ably's realtime hosts (`*.ably.io`, `*.ably-realtime.com`) for `connect-src`.
- NOT `cdn.8thwall.com` — 8frame is now self-hosted; the dead CDN must not appear.
- Keep existing `Permissions-Policy`, `X-Frame-Options`, `Referrer-Policy`.

## 8frame source (Stream A)

`8thwall/8frame` repo, `dist/aframe-v1.5.0.min.js`:
`https://raw.githubusercontent.com/8thwall/8frame/master/dist/aframe-v1.5.0.min.js`
→ vendored to `public/vendor/8thwall/aframe-v1.5.0.min.js`.

## Verification (post-integration)

No automated test harness exists (AR needs a device/camera). Verification gate:
`npm run lint` clean + `npm run build` succeeds + manual review of the load
flow for both engine branches. On-device testing (Android Chrome + iOS Safari)
is the user's follow-up.

## Out of scope

`src/app/ar/page.tsx` redirect, `src/app/api/ar-config/route.ts`, the Blender
pipeline, marker/`board.mind` assets (orphaned; left in place, not used).
