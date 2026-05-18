# 8th Wall Migration — Design Spec

**Date:** 2026-05-18
**Status:** Approved (brainstorming → writing-plans)
**Author:** brainstorming session, AR_art project

## 1. Motivation

iOS Safari does not support the WebXR Device API, and Chrome/Firefox/Edge on iOS inherit the same restriction (all WebKit underneath). The project's recent migration to WebXR hit-test (commit `e63e7b4`) therefore makes the AR experience **unreachable on iPhones and iPads**.

The art installation requires a cross-platform AR path. Native AR (Apple Quick Look) is not viable because the project needs custom interactivity (tap-to-place, healing animations, multi-user sync). We are migrating the AR engine layer to the **open-source 8th Wall engine** (`@8thwall/engine-binary`), which provides JS-based computer-vision SLAM over `getUserMedia` and runs on both iOS Safari and Android Chrome.

### Context: 8th Wall went open source

Niantic shut down the 8th Wall hosted service on **2026-02-28**. New signups are closed, hosted projects are sunset by 2027-02-28. **However**, in January 2026 Niantic open-sourced the engine: the framework code is MIT-licensed at `github.com/8thwall/8thwall`, and the SLAM binary is distributed under a free binary-only license via npm as `@8thwall/engine-binary` (with a jsdelivr CDN mirror). For our use case this is strictly better than the original hosted product:

- No App Key, no authorized domains, no device authorization
- No subscription cost — ever
- No vendor-shutdown risk (worst case already played out)
- Same SLAM, same A-Frame component names (`xrweb`, `xrextras-*`)

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Tracking mode | 8th Wall OSS World Tracking (SLAM) | Matches current tap-to-place UX from WebXR hit-test. No printed marker needed. |
| Multiplayer | Keep Ably | Cheaper, portable, no lock-in. Existing `healing-sync.js` keeps working. |
| SDK source | `@8thwall/engine-binary` via jsdelivr CDN | Free, no signup, MIT framework + free binary SLAM. Loaded as a static `<script>` tag. |
| SDK flavor | 8th Wall + A-Frame integration | Smallest migration diff. Keeps `<a-scene>`, components, HUD, end sequence. |
| Hosting | Self-host on Vercel under project's own domain | One codebase. Next.js home page and AR page stay together. |
| App Key / accounts | None required | OSS distribution does not gate by domain or device. |
| Migration shape | Big-bang swap of `ar.html` | Smallest diff. Old code preserved on `pre-8thwall` git tag for emergency revert. |

## 3. Architecture

The current AR page has a natural boundary at the CustomEvent layer:

```
┌─────────────────────────────────────────────────┐
│  HUD + multiplayer layer  (UNCHANGED)           │
│  - DOM overlay (healing arc, pills, end seq)    │
│  - healing-sync.js (Ably)                       │
│  - end-sequence.js                              │
│  - character-animator, tornado, barbed-wire,    │
│    explosion-flash components (components.js)   │
└─────────────────────────────────────────────────┘
              ▲ CustomEvents (the boundary)
              │  surface-detected, surface-lost,
              │  object-placed, placement-broadcast
              ▼
┌─────────────────────────────────────────────────┐
│  AR engine layer  (REPLACED)                    │
│  BEFORE: webxr-placement.js + <a-scene webxr=…> │
│  AFTER:  eighth-wall-placement.js + xrweb       │
└─────────────────────────────────────────────────┘
```

The HUD layer talks to the AR engine only through DOM CustomEvents. The migration replaces the bottom box and preserves the contract. No behavior in the top box changes.

**Why this runs on iOS:** 8th Wall's `xrweb` is not WebXR. It uses `getUserMedia` (camera) plus a JS computer-vision SLAM library to estimate ground plane and pose. iOS Safari has supported `getUserMedia` since 11, so the same code runs on iOS and Android.

## 4. File changes

```
public/
├── ar.html                          [EDIT]   swap <a-scene> attrs + scripts
├── js/
│   ├── webxr-placement.js           [DELETE] replaced
│   ├── eighth-wall-placement.js     [NEW]    8th Wall engine adapter
│   ├── healing-sync.js              [UNCHANGED]
│   ├── end-sequence.js              [UNCHANGED]
│   └── components.js                [UNCHANGED]
├── ar.css                           [UNCHANGED]
├── markers/board.png                [KEEP-but-unused] gallery print reference
├── targets/board.mind               [DELETE] MindAR-specific, dead code
└── models/                          [UNCHANGED]

src/app/api/ar-config/route.ts       [UNCHANGED] no App Key needed
src/app/ar/page.tsx                  [UNCHANGED] still redirects to /ar.html
.env.local / .env.example            [UNCHANGED] no new env var needed
next.config.ts                       [EDIT]   CSP for cdn.jsdelivr.net
```

### 4.1 `public/ar.html` (edit)

**Remove:**
- The `<script>` block that does WebXR support detection (`navigator.xr`, `isSessionSupported('immersive-ar')`)
- `webxr="requiredFeatures: hit-test; optionalFeatures: dom-overlay,local-floor; overlayElement: #ar-overlay"` attribute on `<a-scene>`
- `<script src="js/webxr-placement.js">`
- `webxr-placement` component reference on `#placement-reticle`

**Add:**
- A single static script tag for the OSS engine binary (loads from jsdelivr CDN, includes SLAM via the `data-preload-chunks` attribute):
  ```html
  <script src="https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js"
          async crossorigin="anonymous"
          data-preload-chunks="slam"></script>
  ```
- A-Frame loaded after `XR8` (the SDK's global) is available — script ordering uses `defer` + a small ready check, no `fetch` or App Key required
- `xrweb` system attribute on `<a-scene>` (e.g., `xrweb="allowedDevices: any"`)
- `xrextras-tap-recenter`, `xrextras-loading`, `xrextras-runtime-error` for UX helpers
- `<script src="js/eighth-wall-placement.js">`
- `eighth-wall-placement` component on `#placement-reticle`

Self-hosting note: if Niantic ever yanks the jsdelivr-mirrored package (very unlikely — it's an open-source binary), we can `npm install @8thwall/engine-binary` and serve `dist/xr.js` ourselves from `public/vendor/8thwall/`. Defer this until/unless that happens.

**Keep:** the entry gateway (`#enter-gateway`) — 8th Wall still needs a user-gesture for `getUserMedia`, so the existing "tap to enter AR" button serves the same purpose. The gateway's *support check* changes: instead of `navigator.xr.isSessionSupported`, we feature-detect `getUserMedia` and let 8th Wall's own startup error reporting handle the rest.

### 4.2 `public/js/eighth-wall-placement.js` (new)

A single A-Frame component mirroring the public contract of `webxr-placement`:

- **Listens to:** 8th Wall events (`xrweb.found`, `xrweb.lost`, ground anchor callbacks) plus DOM `touchstart`/`click` on the canvas
- **Emits (existing CustomEvents):**
  - `surface-detected` when ground anchor stable
  - `surface-lost` when tracking lost
  - `object-placed` with `{x, y, z, autoPlaced: false}` on user tap
  - `object-placed` with `autoPlaced: true` when triggered remotely
- **Exposes:** `component.autoPlace()` method — same name and semantics as the old `webxr-placement.autoPlace()` so `healing-sync.js` does not change
- **Owns:** a reticle mesh that follows the ground hit and hides on placement

### 4.3 `next.config.ts` (edit)

Add a `Content-Security-Policy` response header so the OSS engine script loads:

```
script-src 'self' cdn.jsdelivr.net https://aframe.io https://cdn.ably.com 'unsafe-eval';
connect-src 'self' cdn.jsdelivr.net *.ably.io wss://*.ably.io;
worker-src 'self' blob:;
img-src 'self' data: blob:;
media-src 'self' blob:;
```

`'unsafe-eval'` is required by 8th Wall's runtime VM (same as the hosted version — the requirement is in the engine itself, not the delivery mechanism). No `'unsafe-inline'` is needed because the SDK loads via a regular `<script src=...>` tag, not an inline bootstrap. Scope this header to the AR page only (`source: '/ar.html'`) so the rest of the site keeps a stricter policy.

### 4.4 No env variable, no API key

The OSS engine is anonymous — there is no key, no domain authorization, no device authorization. `/api/ar-config` is **not modified** for this migration; it keeps returning only the Ably config it already does. `.env.example` and `.env.local` gain no new entries.

If `cdn.jsdelivr.net` becomes unreachable or undesirable, the fallback is `npm install @8thwall/engine-binary` + serve `dist/xr.js` from `public/vendor/8thwall/`. This is a one-line change to the `<script src=…>` in `ar.html`. Not done up front to avoid checking ~2 MB of vendored bundle into git.

## 5. Runtime data flow

### Page load
```
/ar.html (static)
 ├─► <script async src="cdn.jsdelivr.net/.../@8thwall/engine-binary/.../xr.js"
 │            data-preload-chunks="slam">
 │     └─ registers `xrweb`, `xrextras-*` A-Frame components on global XR8
 ├─► <script defer src="https://aframe.io/.../aframe.min.js">
 ├─► <script defer src="js/components.js">   (character-animator, tornado, etc.)
 ├─► <script defer src="js/eighth-wall-placement.js">
 ├─► <script defer src="js/healing-sync.js">
 └─► <script defer src="js/end-sequence.js">

window.onload waits for XR8 global to be defined (small ready-poll), then
inserts <a-scene> into the DOM so A-Frame sees `xrweb` / `xrextras-*`
attributes at parse time.
```

### Session start (the single user-gesture)
```
user taps "enter ar"
 └─► scene.systems.xrweb.run()           (or equivalent start call)
      └─► 8th Wall runtime calls getUserMedia
           ├─► granted ──► tracking starts
           │   └─► xrweb fires `realityready`
           │        └─► adapter emits `surface-detected`
           └─► denied  ──► adapter shows #ar-unsupported overlay
```

### Local placement
```
user taps screen
 └─► eighth-wall-placement reads reticle position
      └─► emits CustomEvent `object-placed` {x, y, z, autoPlaced: false}
           ├─► scene-root.visible = true, position = (x, y, z)   (existing in ar.html)
           └─► healing-sync.notifyPlaced()                        (existing)
                └─► Ably publishes "placement" message
```

### Remote placement
```
Ably receives "placement" message
 └─► healing-sync emits `placement-broadcast`
      └─► eighth-wall-placement.autoPlace()
           └─► emits `object-placed` {x, y, z, autoPlaced: true}
                └─► (same handlers fire; no Ably re-publish)
```

### Healing sync (UNCHANGED end-to-end)
```
any user's local increment
 └─► healing-sync ──Ably──► all clients
      └─► document dispatches 'healing-update' {percent, userCount}
           └─► HUD updates arc + characters + effects (existing)
```

The boundary CustomEvents are unchanged — that is why HUD/multiplayer code touches zero lines.

## 6. Prerequisites (very short)

The OSS engine has no signup, no key, no console. The "setup" is reduced to two operational checks:

1. **Network reachability:** confirm `cdn.jsdelivr.net` is reachable from the test devices and from the gallery's installation network. Most networks let CDN traffic through, but corporate / gallery wifi sometimes doesn't — worth checking before the opening, not during.
2. **HTTPS:** AR requires HTTPS for `getUserMedia`. `next dev --experimental-https` (already in `package.json`) gives HTTPS locally; Vercel gives HTTPS in prod. No extra work.

### Notes
- **iOS user-gesture rule:** iOS Safari only grants `getUserMedia` from a user gesture in the same document. The existing entry gateway (`#enter-gateway`) already satisfies this — same reason it was added for WebXR.
- **Bundle size:** `xr.js` is ~2–3 MB minified+gzipped including the SLAM chunk. First load on a slow gallery wifi can take a few seconds — the "preparing the witness" overlay covers this.

## 7. Error handling

| Failure | User-facing | Code path |
|---|---|---|
| jsdelivr CDN unreachable (offline / blocked) | `#ar-unsupported` with "could not load AR engine" | `<script>` onerror → adapter shows overlay |
| Camera permission denied | `#ar-unsupported` with "camera access required" | Adapter catches permissions-denied event |
| Tracking lost mid-session | HUD pill returns to "scanning" | Adapter emits `surface-lost` → existing handler |
| Ably disconnect | Existing healing-sync behavior | No change |
| WebGL / camera unsupported | `#ar-unsupported` | 8th Wall emits runtime error → adapter catches |

We do not add custom retry logic on top of 8th Wall's startup. Their failure UI is well-designed; wrapping it adds noise.

## 8. Testing

1. **Manual smoke test, three devices:**
   - iPhone (Safari, iOS 16+) — the point of this migration
   - Android (Chrome)
   - Desktop Chrome — must show `#ar-unsupported` gracefully
2. **Multi-device shared session:** two phones simultaneously, verify:
   - First placement auto-places witness on the second device
   - Healing % increments mirror across devices
   - User count pill updates on both
3. **No automated tests.** The repo has no test harness today; adding one is out of scope for this migration.

If automated tests are added later, the right boundary is `healing-sync.js` (pure logic, easy to mock Ably). The AR engine adapter is integration-only.

## 9. Rollback

Before the migration commit:
```
git tag pre-8thwall
git push --tags
```

If the migration breaks on launch day:
```
git revert <migration-commit>
# OR
git checkout pre-8thwall -- public/ar.html public/js/webxr-placement.js
```

WebXR path returns intact. Android users keep working; iOS users still can't use AR (the pre-migration state we accept as a known fallback).

## 10. Out of scope (YAGNI, flagged for possible future)

- 8th Wall image-target mode
- Niantic Shared AR co-location
- Engine adapter abstraction (single-engine for now)
- New characters / effects / HUD work
- Migrating Next.js routes
- AR session telemetry / analytics
- Self-test page for App Key validation
