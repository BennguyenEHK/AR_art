# 8th Wall Migration — Design Spec

**Date:** 2026-05-18
**Status:** Approved (brainstorming → writing-plans)
**Author:** brainstorming session, AR_art project

## 1. Motivation

iOS Safari does not support the WebXR Device API, and Chrome/Firefox/Edge on iOS inherit the same restriction (all WebKit underneath). The project's recent migration to WebXR hit-test (commit `e63e7b4`) therefore makes the AR experience **unreachable on iPhones and iPads**.

The art installation requires a cross-platform AR path. Native AR (Apple Quick Look) is not viable because the project needs custom interactivity (tap-to-place, healing animations, multi-user sync). We are migrating the AR engine layer to **8th Wall (Niantic)**, which provides JS-based computer-vision SLAM over `getUserMedia` and runs on both iOS Safari and Android Chrome.

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Tracking mode | 8th Wall World Tracking (SLAM) | Matches current tap-to-place UX from WebXR hit-test. No printed marker needed. |
| Multiplayer | Keep Ably | Cheaper, portable, no lock-in. Existing `healing-sync.js` keeps working. |
| SDK flavor | 8th Wall + A-Frame integration | Smallest migration diff. Keeps `<a-scene>`, components, HUD, end sequence. |
| Hosting | Self-host on Vercel under project's own domain | One codebase. Next.js home page and AR page stay together. |
| 8th Wall account | New workspace, Dev tier for build, paid tier at launch | User will create. App Key tied to authorized domains. |
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
│   ├── config.js                    [NEW, GENERATED] exposes window.__APP_KEY__
│   ├── healing-sync.js              [UNCHANGED]
│   ├── end-sequence.js              [UNCHANGED]
│   └── components.js                [UNCHANGED]
├── ar.css                           [UNCHANGED]
├── markers/board.png                [KEEP-but-unused] gallery print reference
├── targets/board.mind               [DELETE] MindAR-specific, dead code
└── models/                          [UNCHANGED]

src/app/ar/page.tsx                  [UNCHANGED] still redirects to /ar.html
.env.local / .env.example            [EDIT]   add NEXT_PUBLIC_8THWALL_APP_KEY
next.config.ts                       [EDIT]   CSP for apps.8thwall.com / cdn.8thwall.com
package.json                         [EDIT]   add prebuild script that generates public/js/config.js
.gitignore                           [EDIT]   add public/js/config.js
```

### 4.1 `public/ar.html` (edit)

**Remove:**
- The `<script>` block that does WebXR support detection (`navigator.xr`, `isSessionSupported('immersive-ar')`)
- `webxr="requiredFeatures: hit-test; optionalFeatures: dom-overlay,local-floor; overlayElement: #ar-overlay"` attribute on `<a-scene>`
- `<script src="js/webxr-placement.js">`
- `webxr-placement` component reference on `#placement-reticle`

**Add:**
- `<script src="js/config.js">` (generated; appends the 8th Wall `<script>` tag to `<head>` with the App Key embedded, so no inline script is needed in `ar.html`)
- `xrweb` system attribute on `<a-scene>` (e.g., `xrweb="enabled: true"`)
- `xrextras-tap-recenter` for re-centering UX
- `<script src="js/eighth-wall-placement.js">`
- `eighth-wall-placement` component on `#placement-reticle`

The generated `config.js` does two jobs: (1) embed the App Key, (2) inject the 8th Wall bootstrap script tag. Folding both into one external file avoids needing `'unsafe-inline'` in CSP.

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

Add a `Content-Security-Policy` response header so 8th Wall's scripts load:

```
script-src 'self' apps.8thwall.com cdn.8thwall.com 'unsafe-eval';
connect-src 'self' apps.8thwall.com cdn.8thwall.com *.ably.io wss://*.ably.io;
worker-src 'self' blob:;
img-src 'self' data: blob:;
media-src 'self' blob:;
```

`unsafe-eval` is required by 8th Wall's runtime VM. No `'unsafe-inline'` because all scripts are external (see §4.1).

### 4.4 Env + App Key injection

```
.env.example:  NEXT_PUBLIC_8THWALL_APP_KEY=put-your-key-here
.env.local:    NEXT_PUBLIC_8THWALL_APP_KEY=<the real key>
```

`package.json` gets a `prebuild` and a `predev` script that generates `public/js/config.js`:

```js
// public/js/config.js (generated, gitignored)
(function () {
  var key = "<NEXT_PUBLIC_8THWALL_APP_KEY value>";
  window.__APP_KEY__ = key;
  if (!key) return; // empty key → ar.html shows #ar-unsupported
  var s = document.createElement('script');
  s.src = 'https://apps.8thwall.com/xrweb?appKey=' + encodeURIComponent(key);
  document.head.appendChild(s);
})();
```

This keeps `ar.html` static, works identically in `next dev` and Vercel prod, and avoids introducing a Next.js route just for one inline value.

## 5. Runtime data flow

### Page load
```
/ar.html (static)
 ├─► <script src="js/config.js">       (generated; sets __APP_KEY__ AND injects 8th Wall <script>)
 │     └─► <script src="apps.8thwall.com/xrweb?appKey=..."> appended to <head>
 │          └─ registers `xrweb`, `xrextras-*` A-Frame components
 ├─► <script src="https://aframe.io/.../aframe.min.js">
 ├─► <script src="js/components.js">   (character-animator, tornado, etc.)
 ├─► <script src="js/eighth-wall-placement.js">
 ├─► <script src="js/healing-sync.js">
 └─► <script src="js/end-sequence.js">
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

## 6. 8th Wall account setup (user actions, before code ships)

1. Sign up at `8thwall.com` and create a workspace. Dev tier is enough to build and test.
2. Create a project → choose type **"Self-Hosted"** (not "Hosted on 8th Wall").
3. Copy the **App Key** from the project dashboard.
4. Authorize domains for the App Key:
   - `localhost`
   - `*.vercel.app` (or the specific preview-URL pattern Vercel emits)
   - Your production domain
5. Authorize test devices — visit a one-time activation URL on each iPhone / Android you'll test with. Dev tier limits sessions to authorized devices.
6. Paste the App Key into `.env.local` as `NEXT_PUBLIC_8THWALL_APP_KEY`. Commit `.env.example` with the placeholder.

At launch day, upgrade to a paid plan — that removes the device-authorization requirement. No code change required; the App Key stays the same.

### Notes
- **HTTPS / mixed content:** 8th Wall CDN is HTTPS. `next dev --experimental-https` (already in `package.json`) gives HTTPS locally. No mixed-content issue.
- **iOS user-gesture rule:** iOS Safari only grants `getUserMedia` from a user gesture in the same document. The existing entry gateway (`#enter-gateway`) already satisfies this — same reason it was added for WebXR.

## 7. Error handling

| Failure | User-facing | Code path |
|---|---|---|
| App Key missing | `#ar-unsupported` with "AR not configured" | `config.js` writes empty key; bootstrap fails fast |
| App Key wrong / domain unauthorized | 8th Wall's own error screen | Delegated to 8th Wall |
| Device not authorized (Dev tier) | 8th Wall's "not authorized" screen with QR | Delegated to 8th Wall |
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
