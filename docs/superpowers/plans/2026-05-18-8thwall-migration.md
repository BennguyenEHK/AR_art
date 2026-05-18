# 8th Wall Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WebXR hit-test AR engine with 8th Wall World Tracking so the AR experience works on iOS Safari (currently broken because iOS does not support WebXR).

**Architecture:** Big-bang swap of the AR engine layer in `public/ar.html`. Preserve the existing CustomEvent boundary (`surface-detected`, `surface-lost`, `object-placed`, `placement-broadcast`) so HUD, healing-sync (Ably), and effect components touch zero lines. App Key is fetched at runtime from the existing `/api/ar-config` endpoint.

**Tech Stack:** Next.js 16 (App Router) + React 19 (home page only); A-Frame 1.6.0 + 8th Wall xrweb (AR engine in `public/ar.html`); Three.js (Three baked into A-Frame); Ably (multiplayer healing sync).

**Spec:** `docs/superpowers/specs/2026-05-18-8thwall-migration-design.md`

---

## Prerequisites (USER actions before any code work)

Before Task 1, the user must complete the 8th Wall account setup. The plan assumes a real App Key is in hand by the time Task 2 runs.

- [ ] Sign up at `8thwall.com` and create a workspace (Dev tier is enough for build/test).
- [ ] Create a new project → **type: "Self-Hosted"** (NOT "Hosted on 8th Wall").
- [ ] Copy the **App Key** from the project dashboard.
- [ ] Authorize domains for the App Key:
  - `localhost`
  - `*.vercel.app` (or the specific preview-URL pattern Vercel emits for this project)
  - the production domain (whatever Vercel resolves to in prod)
- [ ] Authorize test devices — visit a one-time activation URL from the 8th Wall console on each iPhone / Android used for testing.
- [ ] Save the App Key locally; it will be pasted into `.env.local` in Task 2.

---

## Task 1: Tag the pre-migration state for rollback

**Files:** none (creates a git tag)

**Why:** The spec mandates an `pre-8thwall` tag so that if the migration breaks on launch day, the WebXR path can be restored with one `git checkout`. Doing this *before* any change guarantees the tag points at known-working code.

- [ ] **Step 1: Verify current branch is `main` and tree is clean enough**

Run: `git status`
Expected: on `main`. Untracked image files (`AR.js_test.jpg`, `Our_AR.jpg`) and deleted images from earlier work are acceptable. No tracked-but-modified files should remain — if any do, stop and ask the user.

- [ ] **Step 2: Create the tag**

Run: `git tag pre-8thwall HEAD`
Expected: no output.

- [ ] **Step 3: Verify the tag exists locally**

Run: `git tag --list pre-8thwall`
Expected: output `pre-8thwall`

- [ ] **Step 4: Push the tag (ASK USER FIRST)**

Pushing a tag publishes it to the remote. Ask the user before running. If approved:

Run: `git push origin pre-8thwall`
Expected: `* [new tag] pre-8thwall -> pre-8thwall`

If the user declines or there's no remote configured, leave the tag local-only — it still serves rollback purposes from this machine.

---

## Task 2: Add the 8th Wall App Key env var

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (gitignored — won't be committed)

- [ ] **Step 1: Edit `.env.example`**

Append after the existing Ably block:

```
# ─── 8th Wall (Niantic) AR engine ───────────────────────────────────────────
# Get an App Key at https://www.8thwall.com (Dev tier is free for build/test).
# Project type must be "Self-Hosted". Authorize localhost, *.vercel.app, and
# your production domain in the 8th Wall console.
NEXT_PUBLIC_8THWALL_APP_KEY=
```

- [ ] **Step 2: Edit `.env.local`**

Add the same key with the real value from the 8th Wall console:

```
NEXT_PUBLIC_8THWALL_APP_KEY=<paste real App Key here>
```

- [ ] **Step 3: Verify env loads in dev**

Run: `npm run dev` (it'll start on port 3000; leave it running for the next step)

Then in a second terminal:

Run (PowerShell): `Invoke-WebRequest -Uri https://localhost:3000/api/ar-config -SkipCertificateCheck | Select-Object -ExpandProperty Content`
Or (bash): `curl -k https://localhost:3000/api/ar-config`

Expected (after Task 3 — for now `appKey` will be absent; that's OK at this step). The point of running it now is just to confirm the dev server starts cleanly with the new env var.

Kill the dev server (Ctrl+C) when done.

- [ ] **Step 4: Commit**

Note: `.env.local` is gitignored (the `.env*` rule in `.gitignore`), so only `.env.example` is staged.

```bash
git add .env.example
git commit -m "feat(ar): add NEXT_PUBLIC_8THWALL_APP_KEY env var

Adds the 8th Wall App Key placeholder to .env.example ahead of the
WebXR-to-8thWall migration. The real key lives in .env.local (gitignored)
and on Vercel as a project env var."
```

---

## Task 3: Expose `appKey` from `/api/ar-config`

**Files:**
- Modify: `src/app/api/ar-config/route.ts`

- [ ] **Step 1: Edit the route to include `appKey` in the JSON response**

Replace the entire file contents with:

```ts
import { NextResponse } from 'next/server';

export const runtime = 'edge'; // optional for speed

export async function GET() {
  return NextResponse.json({
    ablyKey: process.env.NEXT_PUBLIC_ABLY_KEY ?? '',
    channelName: process.env.NEXT_PUBLIC_ABLY_CHANNEL ?? 'ar-art:peace-board:v1',
    ablyEnabled: process.env.NEXT_PUBLIC_ABLY_ENABLED === 'true',
    appKey: process.env.NEXT_PUBLIC_8THWALL_APP_KEY ?? '',
  });
}
```

(The only change is the additional `appKey` field. Keep `runtime = 'edge'` and existing fields unchanged.)

- [ ] **Step 2: Start dev server and verify the new field is returned**

Run: `npm run dev`

Then in a second terminal:

Run (bash): `curl -k https://localhost:3000/api/ar-config`

Expected JSON includes `"appKey":"<your real key value>"`. If `appKey` is empty, check `.env.local` and restart the dev server (Next.js doesn't hot-reload env files).

Kill the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ar-config/route.ts
git commit -m "feat(ar): expose 8th Wall App Key via /api/ar-config

Adds appKey to the existing config endpoint so the AR page can fetch
it at runtime alongside the Ably config it already retrieves."
```

---

## Task 4: Update CSP in `next.config.ts` for AR page

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Edit `next.config.ts`**

Replace the entire file contents with:

```ts
import type { NextConfig } from "next";

// CSP scoped to /ar.html only. 8th Wall's xrweb runtime needs:
//   - script-src apps.8thwall.com cdn.8thwall.com + 'unsafe-eval' (their VM)
//   - 'unsafe-inline' for the small bootstrap that fetches /api/ar-config
//     and injects the 8th Wall <script> tag dynamically
//   - connect-src for Ably realtime + 8th Wall telemetry
//   - worker-src blob: + media-src blob: for the camera/WASM pipeline
const AR_CSP = [
  "default-src 'self'",
  "script-src 'self' apps.8thwall.com cdn.8thwall.com https://aframe.io https://cdn.ably.com 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' apps.8thwall.com cdn.8thwall.com *.ably.io wss://*.ably.io",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
].join("; ");

const nextConfig: NextConfig = {
  // Next 16's React Compiler — enabled by template
  reactCompiler: true,

  async headers() {
    return [
      // Site-wide headers (unchanged)
      {
        source: "/:path*",
        headers: [
          // Grant camera to this origin only; mic stays off (we don't use audio in v1)
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
          // Basic clickjacking guard
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Slightly stricter referrer
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // CSP narrowed to the AR page. Keeps the rest of the site stricter.
      {
        source: "/ar.html",
        headers: [
          { key: "Content-Security-Policy", value: AR_CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify the header is served**

Run: `npm run dev`

Then in a second terminal:

Run (PowerShell):
```
Invoke-WebRequest -Uri https://localhost:3000/ar.html -SkipCertificateCheck | Select-Object -ExpandProperty Headers
```
Or (bash):
```
curl -k -I https://localhost:3000/ar.html
```

Expected: response includes a `Content-Security-Policy` header whose value contains `apps.8thwall.com` and `cdn.8thwall.com`. The home page `/` should NOT include the AR CSP — verify with a second curl:

Run (bash): `curl -k -I https://localhost:3000/ | grep -i "content-security"`
Expected: no CSP header on the home page.

Kill the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(ar): add CSP for /ar.html to allow 8th Wall SDK

Scoped to the AR page only so the rest of the site keeps a stricter
policy. Allows apps.8thwall.com + cdn.8thwall.com for scripts and
connections, 'unsafe-eval' for 8th Wall's runtime VM, and 'unsafe-inline'
for the bootstrap script that fetches the App Key and injects the SDK."
```

---

## Task 5: Create the 8th Wall placement adapter

**Files:**
- Create: `public/js/eighth-wall-placement.js`

This task lands the new file without touching `ar.html`, so the codebase still runs the old WebXR path after the commit. This isolates the new component for review and keeps the next commit (the actual swap) minimal.

- [ ] **Step 1: Create `public/js/eighth-wall-placement.js`** with this exact contents:

```js
(function () {
  'use strict';

  // 8th Wall World Tracking placement adapter.
  // Public contract — mirrors the old webxr-placement component:
  //   - DOM event 'surface-detected' fired when ground tracking is stable
  //   - DOM event 'surface-lost' fired when tracking degrades
  //   - DOM event 'object-placed' {x, y, z, autoPlaced} fired on tap or autoPlace()
  //   - Public method autoPlace() — used by healing-sync for remote placement
  //
  // Why ground-plane raycasting instead of 8th Wall's surface-detection helpers:
  // 8th Wall World Tracking anchors the world coordinate system so y=0 is the
  // discovered floor plane. Casting a ray from the camera through the screen
  // center down to y=0 is the canonical way to find a placement point and
  // doesn't depend on the specific surface-detection event names that have
  // changed across 8th Wall SDK versions.
  //
  // For exact 8th Wall A-Frame event/component names, see:
  //   https://www.8thwall.com/docs/web/

  AFRAME.registerComponent('eighth-wall-placement', {
    schema: {
      placed: { type: 'boolean', default: false }
    },

    init: function () {
      this.placed = false;
      this.hasHit = false;
      this._wasHit = false;
      this.reticleMesh = null;
      this._tapHandler = null;
      this._realityReadyHandler = null;
      this._trackingLostHandler = null;

      var THREE = AFRAME.THREE;

      // Reticle: identical look to the WebXR version for visual continuity.
      var geometry = new THREE.RingGeometry(0.08, 0.12, 32).rotateX(-Math.PI / 2);
      var material = new THREE.MeshBasicMaterial({
        color: 0xd4a843,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });
      this.reticleMesh = new THREE.Mesh(geometry, material);
      this.reticleMesh.matrixAutoUpdate = false;
      this.reticleMesh.visible = false;
      this.el.object3D.add(this.reticleMesh);

      var self = this;

      // 8th Wall fires 'realityready' on the scene when SLAM is stable.
      this._realityReadyHandler = function () {
        self._setSurfaceDetected();
      };
      this.el.sceneEl.addEventListener('realityready', this._realityReadyHandler);

      // 8th Wall tracking-status changes. Event name has varied; use a
      // permissive handler that reads `event.detail.status` when present.
      this._trackingLostHandler = function (e) {
        var status = e && e.detail && e.detail.status;
        if (status === 'NOT_TRACKING' || status === 'LIMITED') {
          self._setSurfaceLost();
        } else if (status === 'NORMAL') {
          self._setSurfaceDetected();
        }
      };
      this.el.sceneEl.addEventListener('xrtrackingstatus', this._trackingLostHandler);

      // Tap-to-place: 8th Wall is NOT WebXR, so use DOM touch/click on the
      // canvas. We listen on 'touchend' (with click as desktop fallback).
      this._tapHandler = function (ev) {
        if (self.placed || !self.hasHit) return;
        // Ignore taps on HUD elements (dom-overlay equivalents). The HUD
        // listeners in ar.html call preventDefault on touchend/click for
        // their controls.
        if (ev && ev.defaultPrevented) return;
        self._placeAtReticle();
      };
      var canvas = this.el.sceneEl.canvas;
      if (canvas) {
        canvas.addEventListener('touchend', this._tapHandler);
        canvas.addEventListener('click', this._tapHandler);
      }
    },

    tick: function (time) {
      if (this.placed || !this.hasHit) return;
      var camera = this.el.sceneEl.camera;
      if (!camera) return;

      var THREE = AFRAME.THREE;
      var origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

      // Ground plane y=0 (8th Wall anchors world origin to discovered floor).
      // Skip if the user is looking nearly parallel to the ground.
      if (Math.abs(dir.y) < 0.01) {
        this.reticleMesh.visible = false;
        return;
      }
      var t = -origin.y / dir.y;
      if (t < 0.3 || t > 5) {
        // Too close or absurdly far — hide reticle until the user re-aims.
        this.reticleMesh.visible = false;
        return;
      }

      var hitX = origin.x + dir.x * t;
      var hitY = 0;
      var hitZ = origin.z + dir.z * t;

      this.reticleMesh.matrix.makeTranslation(hitX, hitY, hitZ);
      this.reticleMesh.material.opacity = 0.7 + Math.sin(time * 0.004) * 0.15;
      this.reticleMesh.visible = true;
    },

    _setSurfaceDetected: function () {
      this.hasHit = true;
      if (!this._wasHit) {
        document.dispatchEvent(new CustomEvent('surface-detected'));
        this._wasHit = true;
      }
    },

    _setSurfaceLost: function () {
      this.hasHit = false;
      if (this.reticleMesh) this.reticleMesh.visible = false;
      if (this._wasHit) {
        document.dispatchEvent(new CustomEvent('surface-lost'));
        this._wasHit = false;
      }
    },

    _placeAtReticle: function () {
      var THREE = AFRAME.THREE;
      var pos = new THREE.Vector3();
      pos.setFromMatrixPosition(this.reticleMesh.matrix);
      this.placed = true;
      this.reticleMesh.visible = false;
      document.dispatchEvent(new CustomEvent('object-placed', {
        detail: { x: pos.x, y: pos.y, z: pos.z, autoPlaced: false }
      }));
    },

    autoPlace: function () {
      if (this.placed) return;
      this.placed = true;
      if (this.reticleMesh) this.reticleMesh.visible = false;
      // Same default position as the WebXR adapter: 1.5m in front of camera
      // at floor height. healing-sync's placement-state message carries no
      // position, so remote auto-placement uses this default.
      document.dispatchEvent(new CustomEvent('object-placed', {
        detail: { x: 0, y: 0, z: -1.5, autoPlaced: true }
      }));
    },

    remove: function () {
      var sceneEl = this.el.sceneEl;
      if (this._realityReadyHandler && sceneEl) {
        sceneEl.removeEventListener('realityready', this._realityReadyHandler);
      }
      if (this._trackingLostHandler && sceneEl) {
        sceneEl.removeEventListener('xrtrackingstatus', this._trackingLostHandler);
      }
      var canvas = sceneEl && sceneEl.canvas;
      if (this._tapHandler && canvas) {
        canvas.removeEventListener('touchend', this._tapHandler);
        canvas.removeEventListener('click', this._tapHandler);
      }
      if (this.reticleMesh) {
        this.el.object3D.remove(this.reticleMesh);
        this.reticleMesh.geometry.dispose();
        this.reticleMesh.material.dispose();
        this.reticleMesh = null;
      }
    }
  });

})();
```

- [ ] **Step 2: Verify the file is syntactically valid JavaScript**

Run: `node --check public/js/eighth-wall-placement.js`
Expected: no output (success). Any output is a syntax error to fix before committing.

- [ ] **Step 3: Verify the codebase still serves the old WebXR page (no regression)**

Run: `npm run dev`. Open the home page in a browser. Confirm nothing visibly changed. The new file isn't loaded yet by `ar.html`, so the AR page should still behave exactly as before this task.

Kill the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add public/js/eighth-wall-placement.js
git commit -m "feat(ar): add 8th Wall placement adapter

New A-Frame component that mirrors the public CustomEvent contract of
webxr-placement (surface-detected, surface-lost, object-placed, plus
autoPlace() for remote placement). Not yet wired into ar.html — that
swap happens in the next commit so this file can be reviewed in
isolation."
```

---

## Task 6: Swap `public/ar.html` to use 8th Wall

This is the breaking change. After this commit, the AR page no longer runs WebXR — it runs 8th Wall.

**Files:**
- Modify: `public/ar.html`

- [ ] **Step 1: Replace the entire `public/ar.html` file** with this exact contents:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <title>The Power of Many — AR</title>
  <link rel="stylesheet" href="ar.css" />

  <!-- 8th Wall bootstrap: fetch App Key from existing config endpoint,
       then inject the xrweb SDK. Fires '8thwall-ready' once registered. -->
  <script>
    (function () {
      window.__8thwallReady = false;
      fetch('/api/ar-config')
        .then(function (r) { return r.json(); })
        .then(function (cfg) {
          if (!cfg.appKey) {
            window.dispatchEvent(new CustomEvent('8thwall-missing-key'));
            return;
          }
          var s = document.createElement('script');
          s.src = 'https://apps.8thwall.com/xrweb?appKey=' + encodeURIComponent(cfg.appKey);
          s.async = false;
          s.onload = function () {
            window.__8thwallReady = true;
            window.dispatchEvent(new CustomEvent('8thwall-ready'));
          };
          s.onerror = function () {
            window.dispatchEvent(new CustomEvent('8thwall-load-error'));
          };
          document.head.appendChild(s);
        })
        .catch(function () {
          window.dispatchEvent(new CustomEvent('8thwall-load-error'));
        });
    })();
  </script>
</head>
<body>

  <!-- Loading overlay -->
  <div id="loading-overlay">
    <div id="loading-spinner"></div>
    <span>preparing the witness</span>
  </div>

  <!-- Entry gateway: the single user-gesture threshold. 8th Wall (like WebXR)
       requires a user gesture in this document to call getUserMedia. -->
  <div id="enter-gateway" class="hidden">
    <div class="gateway-grain"></div>
    <div class="gateway-inner">
      <span class="gateway-eyebrow">environment ar · place the witness</span>
      <h1 class="gateway-title">Cross the<br /><em>threshold</em></h1>
      <p class="gateway-desc">Find any flat surface — floor, table, ground. Tap once to place the witness. Everyone present heals together, in real time.</p>
      <button id="enter-ar-btn" disabled>
        <span class="gateway-btn-ring"></span>
        <span class="gateway-btn-label">◉ enter ar</span>
      </button>
      <span class="gateway-status" id="gateway-status">checking device…</span>
    </div>
  </div>

  <!-- AR unsupported overlay -->
  <div id="ar-unsupported">
    <h2>device not supported</h2>
    <p id="ar-error-msg">AR is not available</p>
    <p>requires Safari on iOS 15+ or Chrome on Android 8+ with a working camera</p>
    <a href="/">← return home</a>
  </div>

  <!-- HUD overlay (unchanged from the WebXR version) -->
  <div id="ar-overlay">
    <div id="hud-top">
      <div id="user-count-pill" class="hud-pill">
        <span id="user-dot" style="font-size:8px; color: rgba(120,200,120,0.7)">●</span>
        <span id="user-count-text">1 soul present</span>
      </div>
      <div id="status-pill" class="hud-pill">
        <span id="status-dot">○</span>
        <span id="status-text">scanning</span>
      </div>
      <div id="healing-hud">
        <svg id="healing-arc" viewBox="0 0 44 44">
          <circle id="arc-bg" cx="22" cy="22" r="18" />
          <circle id="arc-progress" cx="22" cy="22" r="18" />
          <text id="arc-percent" x="22" y="22">0%</text>
        </svg>
        <div id="arc-label">healing</div>
      </div>
    </div>

    <div id="hud-bottom">
      <div id="hint-pill" class="hud-pill">preparing...</div>
      <a id="back-pill" class="hud-pill" href="/">← return</a>
    </div>

    <div id="end-overlay">
      <div class="end-message">
        <div class="end-line" data-delay="400">With many people speaking up —</div>
        <div class="end-line" data-delay="1800">gun violence will be under control</div>
        <div class="end-line" data-delay="3200">and reduced significantly.</div>
        <div class="end-separator" data-delay="4400"></div>
        <div class="end-tagline" data-delay="4800">The power of many.</div>
        <button id="restart-btn" data-delay="8500">↩ press to restart</button>
      </div>
    </div>
  </div>

  <!-- Scripts: A-Frame loads after the 8th Wall bootstrap fires '8thwall-ready'.
       Custom components MUST be registered before <a-scene> is parsed; we gate
       A-Frame insertion on the ready event below. -->
  <script src="https://cdn.ably.com/lib/ably.min-2.js" defer></script>

  <script>
    // Wait for 8th Wall SDK to register its A-Frame components, THEN load A-Frame
    // and our own component scripts, THEN insert <a-scene>. This ordering is
    // critical: A-Frame parses <a-scene> attributes the moment it sees the
    // element, and any unrecognized component name (xrweb, xrextras-*) silently
    // becomes a no-op if registered too late.
    function loadScript(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function () { reject(new Error('failed: ' + src)); };
        document.body.appendChild(s);
      });
    }

    function showUnsupported(msg) {
      document.getElementById('loading-overlay').classList.add('hidden');
      document.getElementById('enter-gateway').classList.add('hidden');
      var msgEl = document.getElementById('ar-error-msg');
      if (msgEl) msgEl.textContent = msg;
      document.getElementById('ar-unsupported').classList.add('visible');
    }

    window.addEventListener('8thwall-missing-key', function () {
      showUnsupported('AR is not configured. (Missing App Key.)');
    });
    window.addEventListener('8thwall-load-error', function () {
      showUnsupported('Could not load the AR engine. Check your connection and try again.');
    });

    function bootAR() {
      // Load A-Frame, then our scripts, then insert <a-scene>.
      loadScript('https://aframe.io/releases/1.6.0/aframe.min.js')
        .then(function () { return loadScript('js/components.js'); })
        .then(function () { return loadScript('js/eighth-wall-placement.js'); })
        .then(function () { return loadScript('js/healing-sync.js'); })
        .then(function () { return loadScript('js/end-sequence.js'); })
        .then(insertScene)
        .catch(function (err) {
          console.error('[ar] boot failed:', err);
          showUnsupported('Could not start AR. Reload to retry.');
        });
    }

    function insertScene() {
      var scene = document.createElement('a-scene');
      scene.id = 'ar-scene';
      scene.setAttribute('xrweb', 'allowedDevices: any');
      scene.setAttribute('renderer', 'antialias: true; alpha: true; logarithmicDepthBuffer: false');
      scene.setAttribute('xrextras-loading', '');
      scene.setAttribute('xrextras-runtime-error', '');
      scene.setAttribute('xrextras-tap-recenter', '');
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      scene.setAttribute('background', 'color: #000000');

      scene.innerHTML = [
        '<a-entity light="type: ambient; color: #ffffff; intensity: 0.8"></a-entity>',
        '<a-entity light="type: directional; color: #ffffff; intensity: 0.6" position="1 2 1"></a-entity>',
        '<a-entity id="placement-reticle" eighth-wall-placement></a-entity>',
        '<a-entity id="scene-root" visible="false">',
        '  <a-entity id="character-root" character-animator="healingPercent: 0; mode: a" position="0 -0.18 0"></a-entity>',
        '  <a-entity tornado-effect="intensity: 1" position="0 0 0"></a-entity>',
        '  <a-entity barbed-wire="intensity: 1" position="0 0 0"></a-entity>',
        '  <a-entity explosion-flash="intensity: 1" position="0 0 0"></a-entity>',
        '</a-entity>',
        '<a-entity camera></a-entity>'
      ].join('');

      document.body.appendChild(scene);
      wireSceneEvents(scene);
    }

    // 8th Wall SDK is ready (or already was at fetch resolve time)
    if (window.__8thwallReady) {
      bootAR();
    } else {
      window.addEventListener('8thwall-ready', bootAR, { once: true });
    }

    /* ─────────────────────────────────────────────────────────────────────
       Scene wiring: HUD updates, healing sync, placement event handlers.
       Same logic as the WebXR version; only the AR engine layer changed.
       ───────────────────────────────────────────────────────────────────── */
    function wireSceneEvents(scene) {
      var overlay        = document.getElementById('loading-overlay');
      var gateway        = document.getElementById('enter-gateway');
      var gatewayStatus  = document.getElementById('gateway-status');
      var statusPill     = document.getElementById('status-pill');
      var statusDot      = document.getElementById('status-dot');
      var statusText     = document.getElementById('status-text');
      var hintPill       = document.getElementById('hint-pill');
      var arcProgress    = document.getElementById('arc-progress');
      var arcPercent     = document.getElementById('arc-percent');
      var arcSvg         = document.getElementById('healing-arc');
      var userCountText  = document.getElementById('user-count-text');
      var enterARBtn     = document.getElementById('enter-ar-btn');
      var backPill       = document.getElementById('back-pill');
      var sceneRoot      = function () { return document.getElementById('scene-root'); };
      var placementReticle = function () { return document.getElementById('placement-reticle'); };

      var ARC_CIRCUMFERENCE = 2 * Math.PI * 18;
      var healingSyncStarted = false;

      function setSearching() {
        statusDot.textContent = '○';
        statusText.textContent = 'scanning';
        statusPill.className = 'hud-pill scanning';
        hintPill.textContent = 'move phone to find a surface';
        hintPill.className = 'hud-pill';
        hintPill.classList.remove('hidden');
      }
      function setSurfaceDetected() {
        statusDot.textContent = '◎';
        statusText.textContent = 'surface found';
        statusPill.className = 'hud-pill surface-detected';
        hintPill.textContent = 'tap anywhere to place';
        hintPill.className = 'hud-pill tap-to-place';
        hintPill.classList.remove('hidden');
      }
      function setPlaced() {
        statusDot.textContent = '●';
        statusText.textContent = 'placed';
        statusPill.className = 'hud-pill placed';
        hintPill.classList.add('hidden');
      }

      function updateHealingArc(percent) {
        var filled = (percent / 100) * ARC_CIRCUMFERENCE;
        arcProgress.style.strokeDasharray = filled + ' ' + ARC_CIRCUMFERENCE;
        arcPercent.textContent = Math.round(percent) + '%';
        var t = percent / 100;
        var r = Math.round(196 + (212 - 196) * t);
        var g = Math.round(98  + (168 - 98)  * t);
        var b = Math.round(45  + (67  - 45)  * t);
        arcProgress.style.stroke = 'rgb(' + r + ',' + g + ',' + b + ')';
        arcPercent.style.fill = percent > 50
          ? 'rgba(212,168,67,' + (0.4 + t * 0.4) + ')'
          : 'rgba(240,228,200,0.38)';
        arcSvg.classList.toggle('glowing', percent > 40);
      }
      function updateUserCount(count) {
        userCountText.textContent = count === 1
          ? '1 soul present'
          : count + ' souls present';
      }

      document.addEventListener('healing-update', function (e) {
        var percent   = e.detail.percent;
        var userCount = e.detail.userCount;
        updateHealingArc(percent);
        updateUserCount(userCount);
        var intensity = Math.max(0, 1 - percent / 100);
        var tornado   = document.querySelector('[tornado-effect]');
        var wire      = document.querySelector('[barbed-wire]');
        var explosion = document.querySelector('[explosion-flash]');
        var character = document.getElementById('character-root');
        if (tornado)   tornado.setAttribute('tornado-effect',   'intensity', intensity);
        if (wire)      wire.setAttribute('barbed-wire',         'intensity', intensity);
        if (explosion) explosion.setAttribute('explosion-flash','intensity', intensity);
        if (character) character.setAttribute('character-animator', 'healingPercent', percent);
      });

      // Reveal the gateway as soon as character GLBs are ready (or after 8 s)
      var overlayCleared = false;
      function clearOverlay() {
        if (overlayCleared) return;
        overlayCleared = true;
        overlay.classList.add('fade-out');
        setTimeout(function () {
          overlay.classList.add('hidden');
          gateway.classList.remove('hidden');
          // Feature-check getUserMedia; 8th Wall does its own deeper checks once started
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showUnsupported('Your browser does not support camera access.');
            return;
          }
          enterARBtn.removeAttribute('disabled');
          gatewayStatus.textContent = 'device ready · tap to enter';
        }, 900);
      }
      document.addEventListener('character-ready', clearOverlay);
      setTimeout(clearOverlay, 8000);

      // Enter AR — the single required user gesture for getUserMedia on iOS
      enterARBtn.addEventListener('click', function () {
        gateway.classList.add('hidden');
        // 8th Wall starts automatically once the scene is loaded; the user
        // gesture is satisfied by this click. If you ever switch to a
        // gated-start config, call scene.systems.xrweb.run() here.
      });

      // Surface detection — drives the HUD pill/hint
      document.addEventListener('surface-detected', setSurfaceDetected);
      document.addEventListener('surface-lost',     setSearching);

      // Initial state while 8th Wall is still warming up
      setSearching();

      // Object placed (local tap OR remote auto-place)
      document.addEventListener('object-placed', function (e) {
        var pos = e.detail;
        var root = sceneRoot();
        root.object3D.position.set(pos.x, pos.y, pos.z);
        root.setAttribute('visible', 'true');
        setPlaced();
        if (!pos.autoPlaced && window.HealingSync) {
          window.HealingSync.notifyPlaced();
        }
      });

      // Remote placement broadcast → auto-place this user
      document.addEventListener('placement-broadcast', function () {
        var rec = placementReticle();
        var comp = rec && rec.components && rec.components['eighth-wall-placement'];
        if (comp && !comp.placed) { comp.autoPlace(); }
      });

      // Start healing-sync once the scene is up
      if (!healingSyncStarted && window.HealingSync) {
        healingSyncStarted = true;
        window.HealingSync.init().then(function () {
          var ps = window.HealingSync.getPlacementState();
          if (ps && ps.placed) {
            var rec = placementReticle();
            var comp = rec && rec.components && rec.components['eighth-wall-placement'];
            if (comp && !comp.placed) { comp.autoPlace(); }
          }
        }).catch(console.error);
      }

      // Stop taps on HUD controls from also placing the witness.
      // (Listeners are on the canvas; HUD lives outside the canvas so
      // most cases are already fine, but keep the guard for safety.)
      function blockTap(e) { e.preventDefault(); }
      if (backPill) {
        backPill.addEventListener('touchend', blockTap);
        backPill.addEventListener('click', blockTap);
      }
      var restartBtn = document.getElementById('restart-btn');
      if (restartBtn) {
        restartBtn.addEventListener('touchend', blockTap);
        restartBtn.addEventListener('click', blockTap);
      }
    }
  </script>

</body>
</html>
```

- [ ] **Step 2: Verify the file is valid HTML (script blocks parse)**

Run: `node --check -e "require('fs').readFileSync('public/ar.html','utf8')"`

(That command only validates the JS literal load; it does NOT check the JS inside `<script>` tags. Manual inspection in the next step is the real gate.)

- [ ] **Step 3: Start dev server and load the AR page in a real browser**

Run: `npm run dev`

On a phone authorized in the 8th Wall console (Task 0 prerequisite), navigate to `https://<your-machine-LAN-IP>:3000/ar.html`. Accept the self-signed cert.

Expected flow:
1. "preparing the witness" loader shows briefly
2. Entry gateway appears with "device ready · tap to enter"
3. Tap "◉ enter ar" → camera permission prompt appears → grant
4. Camera feed visible, HUD says "scanning"
5. Once 8th Wall finds a ground plane: HUD changes to "surface found · tap anywhere to place"
6. Tap the screen → witness appears at the tap location, HUD says "placed"

If any step fails, capture the browser console output (you can attach Safari/Chrome remote DevTools to a real device) and debug before committing.

- [ ] **Step 4: Commit**

```bash
git add public/ar.html
git commit -m "feat(ar): swap AR engine from WebXR to 8th Wall

ar.html now loads the 8th Wall xrweb SDK at runtime (App Key from
/api/ar-config), gates A-Frame on the SDK being registered, and uses
the new eighth-wall-placement component. HUD, healing sync, and effect
components are unchanged — the migration only touches the AR engine
layer below the existing CustomEvent boundary.

Closes: iOS Safari AR unreachability after the WebXR migration in e63e7b4."
```

---

## Task 7: Remove dead WebXR code

**Files:**
- Delete: `public/js/webxr-placement.js`
- Delete: `public/targets/board.mind`

`board.mind` is a MindAR target file from an even earlier iteration; nothing references it after the WebXR migration. `webxr-placement.js` is no longer loaded by `ar.html`.

- [ ] **Step 1: Verify nothing else references these files**

Run: `git -C . grep -l "webxr-placement"`
Expected: only `docs/superpowers/specs/2026-05-18-8thwall-migration-design.md` (the spec references it as the file being replaced — that's fine). If `public/ar.html` or any other live file shows up, stop and investigate.

Run: `git -C . grep -l "board\.mind"`
Expected: no matches (or only docs).

- [ ] **Step 2: Delete the files**

Run (PowerShell):
```
Remove-Item public/js/webxr-placement.js
Remove-Item public/targets/board.mind
```
Or (bash):
```
rm public/js/webxr-placement.js public/targets/board.mind
```

- [ ] **Step 3: Update `public/targets/README.txt`** to note the directory is now unused

Read the current contents first:

```bash
cat public/targets/README.txt
```

If it references AR.js or MindAR, replace its contents with a short note:

```
This directory previously held tracking targets for AR.js / MindAR.
The current AR engine (8th Wall World Tracking) does not use printed
targets — placement is via on-device SLAM.

The printed board (public/markers/board.png) remains as a physical
installation reference but is not consumed by the runtime.
```

If the README is already minimal or unrelated, leave it.

- [ ] **Step 4: Smoke-test the AR page still works**

Run: `npm run dev`. Open `/ar.html` on an authorized device. Run through the same flow from Task 6 Step 3. Expected: identical behavior. (Deleting unreferenced files should not change anything; this step is a sanity check.)

- [ ] **Step 5: Commit**

```bash
git add -u public/js/webxr-placement.js public/targets/board.mind public/targets/README.txt
git commit -m "chore(ar): remove dead WebXR + MindAR target files

webxr-placement.js is unreferenced after the 8th Wall swap.
board.mind is a MindAR target from a pre-WebXR iteration and was already
unused. Updates targets/README.txt to reflect the new tracking model.
The printed board image in public/markers/board.png is kept as a
physical installation reference, even though it's not used for tracking."
```

---

## Task 8: Manual cross-device verification matrix

This is the final gate before declaring the migration complete. No code changes. Document the results in the PR description.

**Test matrix:**

- [ ] **iPhone (Safari, iOS 16+)** — the whole point of this migration
  - Navigate to AR page on a device authorized in the 8th Wall console
  - Gateway shows, camera permission prompt appears, granted
  - Surface found within ~3–5 seconds of pointing at floor
  - Tap places witness; witness stays anchored as user walks around
  - HUD healing arc updates as time passes (assuming Ably is enabled and one user is present)

- [ ] **Android (Chrome)** — must continue working
  - Same flow as iPhone, expected to behave identically
  - Bonus: confirm performance is similar to the pre-migration WebXR version (anecdotal — frame rate should look smooth)

- [ ] **Desktop Chrome** — graceful degradation
  - Navigate to `/ar.html`
  - Expected: `#ar-unsupported` overlay appears OR 8th Wall shows its own "device not supported" screen. The user must NOT see a broken half-rendered AR scene.

- [ ] **Multi-device shared session** — co-presence works
  - Open the AR page on two phones simultaneously (both authorized)
  - On phone A, tap to place the witness
  - On phone B, the witness should auto-appear (no tap required) at the default forward position — this is the `placement-broadcast` → `autoPlace()` path
  - On both phones, the user-count pill should show "2 souls present"
  - Healing % should increment in sync on both devices

- [ ] **Tracking-loss recovery**
  - With AR running, cover the camera with your hand for 3–5 seconds, then uncover
  - Expected: HUD pill returns to "scanning" while covered, then re-acquires once camera sees the floor again. Scene root should stay anchored at the original placement.

If any cell fails, file a follow-up issue (or rollback per §9 of the spec) — do NOT mark the migration done.

- [ ] **Document results** in a PR description (template):

```markdown
## 8th Wall migration test report

| Device | Result | Notes |
|---|---|---|
| iPhone 14 / iOS 17 / Safari | ✓ / ✗ |  |
| Pixel 7 / Android 14 / Chrome | ✓ / ✗ |  |
| MacBook / Chrome | ✓ / ✗ | unsupported overlay shows correctly |
| 2-phone shared session | ✓ / ✗ | placement broadcast works in both directions |
| Camera occlusion recovery | ✓ / ✗ |  |
```

---

## Final commit + PR

Once Task 8 passes and the results are documented:

- [ ] Open a PR titled: `feat(ar): migrate AR engine from WebXR to 8th Wall (iOS support)`
- [ ] Paste the test report into the PR description
- [ ] Link the spec: `docs/superpowers/specs/2026-05-18-8thwall-migration-design.md`
- [ ] Link this plan: `docs/superpowers/plans/2026-05-18-8thwall-migration.md`

Rollback path (per §9 of the spec): `git revert <merge-sha>` or `git checkout pre-8thwall -- public/ar.html public/js/webxr-placement.js` if reverts get tangled.
