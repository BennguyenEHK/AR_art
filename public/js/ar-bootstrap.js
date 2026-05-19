/* ar-bootstrap.js — 8th Wall engine bootstrap + session bridge.
 *
 * THE TIMING PROBLEM THIS SOLVES
 * The 8th Wall A-Frame component `xrweb` is built from
 * `XR8.AFrame.xrwebComponent()`, so it can only be registered once the engine
 * binary (xr.js) has loaded and defined `window.XR8`. xr.js loads `async`, so
 * a `<a-scene xrweb>` placed statically in the document would initialise
 * BEFORE `xrweb` exists — and A-Frame does NOT retro-initialise a component
 * registered after an element has loaded. The scene therefore lives in an
 * inert <template id="tmpl-ar-scene"> and is cloned into #ar-stage only after
 * the `xrloaded` event, with `xrweb` guaranteed present.
 *
 * It then bridges 8th Wall's `realityready` event into the engine-agnostic
 * `ar-session-started` CustomEvent that the HUD + healing-sync layer consume.
 *
 * The page has no device console, so every boundary is logged to a `stages`
 * trail that is rendered onto the #ar-unsupported screen if anything fails.
 */
(function () {
  'use strict';

  var ENGINE_LOAD_TIMEOUT = 30000;  // xr.js must fire `xrloaded` within this
  var REALITY_TIMEOUT     = 45000;  // after mount, `realityready` must follow

  var stages = [];
  var announced = false;
  var engineTimer = null;
  var realityTimer = null;

  function log(msg) {
    stages.push(msg);
    try { console.log('[ar-bootstrap] ' + msg); } catch (e) {}
  }

  function showUnsupported(msg) {
    var el = document.getElementById('ar-unsupported');
    var errEl = document.getElementById('ar-error-msg');
    var diagEl = document.getElementById('ar-diag');
    if (errEl && msg) errEl.textContent = msg;
    if (diagEl) diagEl.textContent = 'diagnostic · ' + stages.join(' → ');
    if (el) el.classList.add('visible');
    log('shown #ar-unsupported');
  }

  function fadeLoadingOverlay() {
    var ov = document.getElementById('loading-overlay');
    if (!ov || ov.classList.contains('fade-out')) return;
    ov.classList.add('fade-out');
    setTimeout(function () { ov.classList.add('hidden'); }, 900);
  }

  function announceSession() {
    if (announced) return;
    announced = true;
    if (realityTimer) { clearTimeout(realityTimer); realityTimer = null; }
    log('ar-session-started');
    document.dispatchEvent(new CustomEvent('ar-session-started', {
      detail: { engine: 'eighthwall' }
    }));
  }

  function mountScene() {
    var tmpl = document.getElementById('tmpl-ar-scene');
    var stageEl = document.getElementById('ar-stage');
    if (!tmpl || !tmpl.content || !stageEl) {
      showUnsupported('AR scene could not be prepared.');
      return;
    }
    stageEl.appendChild(tmpl.content.cloneNode(true));
    var scene = stageEl.querySelector('a-scene');
    if (!scene) {
      showUnsupported('AR scene failed to mount.');
      return;
    }
    log('scene mounted');
    fadeLoadingOverlay();

    scene.addEventListener('realityready', function () {
      log('realityready');
      announceSession();
    });
    scene.addEventListener('xrerror', function (e) {
      var d = e && e.detail;
      log('xrerror: ' + (d && (d.message || d.error) ? (d.message || d.error) : 'unknown'));
    });

    realityTimer = setTimeout(function () {
      if (!announced) {
        showUnsupported('AR is taking longer than expected to start. Make ' +
          'sure camera permission is granted, then reload.');
      }
    }, REALITY_TIMEOUT);
  }

  function onEngineReady() {
    if (engineTimer) { clearTimeout(engineTimer); engineTimer = null; }
    log('engine ready (XR8)');

    // 8frame registers `xrweb` only if XR8 already existed at its load time —
    // which it does not, because xr.js is async. xrextras re-registers it on
    // `xrloaded`, but listener order across libraries is not contractual, so
    // register it here too, idempotently, before the scene mounts.
    try {
      if (window.AFRAME && window.AFRAME.components &&
          window.AFRAME.components.xrweb) {
        log('xrweb already registered');
      } else if (window.AFRAME && window.XR8 && window.XR8.AFrame &&
                 typeof window.XR8.AFrame.xrwebComponent === 'function') {
        window.AFRAME.registerComponent('xrweb', window.XR8.AFrame.xrwebComponent());
        log('xrweb registered by bootstrap');
      } else {
        log('WARN xrweb factory unavailable');
      }
    } catch (err) {
      log('ERROR registering xrweb: ' + (err && err.message));
    }

    // Diagnostic: record which 8th Wall A-Frame components are registered so
    // on-device failures can be reported without a console.
    var knownComponents = ['xrweb', 'landing-pages', 'xrextras-loading', 'xrextras-runtime-error'];
    var missing = [];
    if (window.AFRAME && window.AFRAME.components) {
      knownComponents.forEach(function (c) {
        if (!window.AFRAME.components[c]) missing.push(c);
      });
    }
    if (missing.length) log('missing components: ' + missing.join(', '));

    mountScene();
  }

  function boot() {
    log('bootstrap running');
    if (!window.AFRAME) {
      showUnsupported('The AR framework failed to load.');
      return;
    }
    // The engine binary signals readiness with the `xrloaded` window event.
    // If `window.XR8` is already set, `xrloaded` fired before we got here.
    if (window.XR8) {
      onEngineReady();
    } else {
      window.addEventListener('xrloaded', onEngineReady);
      engineTimer = setTimeout(function () {
        if (!window.XR8) {
          showUnsupported('The AR engine could not load. Check your internet ' +
            'connection and reload.');
        }
      }, ENGINE_LOAD_TIMEOUT);
    }
  }

  window.addEventListener('error', function (e) {
    log('window error: ' + (e && e.message ? e.message : 'unknown'));
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
