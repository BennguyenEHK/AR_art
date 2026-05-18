/* ar-bootstrap.js — dual-engine AR loader.
 *
 * Picks the AR engine for this device, loads its script chain in the right
 * order, injects the matching <a-scene> from a <template>, wires the Enter-AR
 * gateway, and dispatches a single unified 'ar-session-started' CustomEvent on
 * `document` once the immersive session begins.
 *
 * Engine boundary: everything below the CustomEvent layer (the inline HUD
 * script, healing-sync.js, end-sequence.js) is engine-agnostic. This file is
 * the ONLY place that knows which engine is running.
 */
(function () {
  'use strict';

  /* ── DOM handles ────────────────────────────────────────────────── */
  var gateway       = document.getElementById('enter-gateway');
  var gatewayStatus = document.getElementById('gateway-status');
  var enterARBtn    = document.getElementById('enter-ar-btn');
  var arUnsupported = document.getElementById('ar-unsupported');
  var arErrorMsg    = document.getElementById('ar-error-msg');
  var arStage       = document.getElementById('ar-stage');

  var engine = null;        // 'webxr' | 'eighthwall'
  var sessionAnnounced = false;

  /* ── Unsupported fallback ───────────────────────────────────────── */
  function showUnsupported(msg) {
    if (arErrorMsg && msg) arErrorMsg.textContent = msg;
    if (arUnsupported) arUnsupported.classList.add('visible');
    if (gateway) gateway.classList.add('hidden');
  }

  /* ── Sequential <script> loader ─────────────────────────────────── */
  // Loads `srcs` in order — each <script> appended only after the previous
  // one's onload — then calls `done`. Engine scripts have ordering
  // dependencies (components.js must register before <a-scene> parses), so
  // parallel loading is not safe here.
  function loadSequential(srcs, done) {
    var i = 0;
    function next() {
      if (i >= srcs.length) { done(); return; }
      var src = srcs[i++];
      var s = document.createElement('script');
      s.src = src;
      s.onload = next;
      s.onerror = function () {
        console.error('[ar-bootstrap] failed to load script:', src);
        showUnsupported('A required AR component failed to load. Check your connection and retry.');
      };
      document.body.appendChild(s);
    }
    next();
  }

  /* ── Scene injection ────────────────────────────────────────────── */
  // Clone the engine's <template> into #ar-stage. Called ONLY after the
  // A-Frame build + components.js + the placement adapter have loaded, so
  // every custom component is registered before A-Frame parses the scene.
  function injectScene(templateId) {
    var tmpl = document.getElementById(templateId);
    if (!tmpl) {
      console.error('[ar-bootstrap] missing scene template:', templateId);
      showUnsupported('AR scene template missing.');
      return null;
    }
    arStage.appendChild(tmpl.content.cloneNode(true));
    return arStage.querySelector('a-scene');
  }

  /* ── Unified session-start signal ───────────────────────────────── */
  // Both engines funnel here. Fires once; the inline HUD script and the
  // healing-sync init hook listen for 'ar-session-started'.
  function announceSession() {
    if (sessionAnnounced) return;
    sessionAnnounced = true;
    document.dispatchEvent(new CustomEvent('ar-session-started', {
      detail: { engine: engine }
    }));
  }

  /* ── WebXR engine ───────────────────────────────────────────────── */
  function startWebXR() {
    engine = 'webxr';
    loadSequential([
      'https://aframe.io/releases/1.6.0/aframe.min.js',
      'js/components.js',
      'js/webxr-placement.js',
      'js/healing-sync.js',
      'js/end-sequence.js'
    ], function () {
      var scene = injectScene('tmpl-scene-webxr');
      if (!scene) return;

      // Enter-AR is the single required user gesture — WebXR cannot start an
      // immersive session without a gesture inside this document.
      enterARBtn.removeAttribute('disabled');
      if (gatewayStatus) gatewayStatus.textContent = 'device ready · tap to enter';
      // Reveal the gateway now the engine is ready (it ships hidden; the
      // loading overlay fades away on top of it via the inline HUD script).
      if (gateway) gateway.classList.remove('hidden');

      enterARBtn.addEventListener('click', function () {
        gateway.classList.add('hidden');
        var p = scene.enterAR();
        if (p && typeof p.catch === 'function') {
          p.catch(function (err) {
            console.warn('[ar-bootstrap] enterAR failed:', err);
            if (gatewayStatus) {
              gatewayStatus.textContent = 'could not start ar · tap to retry';
            }
            gateway.classList.remove('hidden');
          });
        }
      });

      // WebXR signals session start with 'enter-vr'.
      scene.addEventListener('enter-vr', announceSession);
      // Session end → return the user to the gateway to re-enter.
      scene.addEventListener('exit-vr', function () {
        if (gatewayStatus) {
          gatewayStatus.textContent = 'session ended · tap to re-enter';
        }
        gateway.classList.remove('hidden');
      });
    });
  }

  /* ── 8th Wall engine ────────────────────────────────────────────── */
  function startEighthWall() {
    engine = 'eighthwall';

    // The 8th Wall engine binary loads in parallel (async). The page is
    // unusable without it, so a load failure falls back to #ar-unsupported.
    var xrEngine = document.createElement('script');
    xrEngine.src = 'https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js';
    xrEngine.async = true;
    xrEngine.crossOrigin = 'anonymous';
    xrEngine.setAttribute('data-preload-chunks', 'slam');
    xrEngine.onerror = function () {
      console.error('[ar-bootstrap] 8th Wall engine binary failed to load');
      showUnsupported('The AR engine failed to load. Check your connection and retry.');
    };
    document.body.appendChild(xrEngine);

    // 8frame replaces stock A-Frame entirely — never load both. The chain
    // ends with the placement adapter so components register before the
    // scene template is cloned in.
    loadSequential([
      'vendor/8thwall/aframe-v1.5.0.min.js',
      'https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js',
      'https://cdn.jsdelivr.net/npm/@8thwall/landing-page@1/dist/landing-page.js',
      'js/components.js',
      'js/eighth-wall-placement.js',
      'js/healing-sync.js',
      'js/end-sequence.js'
    ], function () {
      var scene = injectScene('tmpl-scene-eighthwall');
      if (!scene) return;

      enterARBtn.removeAttribute('disabled');
      if (gatewayStatus) gatewayStatus.textContent = 'device ready · tap to enter';
      if (gateway) gateway.classList.remove('hidden');

      // 8th Wall's landing-page component owns the iOS user-gesture
      // getUserMedia start. Tapping Enter-AR just hands off to it.
      enterARBtn.addEventListener('click', function () {
        gateway.classList.add('hidden');
        var landing = document.getElementById('landing-page')
          || document.querySelector('.landing-page, #landingPage');
        if (landing) {
          landing.classList.remove('hidden');
          landing.style.display = '';
        }
      });

      // 8th Wall signals the tracking session is live with 'realityready'.
      scene.addEventListener('realityready', announceSession);
    });
  }

  /* ── Engine detection ───────────────────────────────────────────── */
  // WebXR is primary (Android Chrome / native ARCore). 8th Wall world
  // tracking is the fallback for iOS and any non-WebXR device. If neither
  // a camera nor WebXR is available, show #ar-unsupported.
  function detectAndStart() {
    if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
      navigator.xr.isSessionSupported('immersive-ar').then(function (supported) {
        if (supported) {
          startWebXR();
        } else {
          chooseFallback();
        }
      }).catch(function () {
        chooseFallback();
      });
    } else {
      chooseFallback();
    }
  }

  function chooseFallback() {
    if (navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function') {
      startEighthWall();
    } else {
      showUnsupported('AR is not available on this device. Requires a camera.');
    }
  }

  /* ── Boot ───────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', detectAndStart);
  } else {
    detectAndStart();
  }

})();
