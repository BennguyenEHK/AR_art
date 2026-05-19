/* ar-bootstrap.js — 8th Wall session bridge.
 *
 * The 8th Wall engine scripts and the <a-scene xrweb> are declared statically
 * in ar.html, so this file no longer loads scripts or injects scenes. Its only
 * job is to bridge 8th Wall's 'realityready' event into the engine-agnostic
 * 'ar-session-started' CustomEvent that the inline HUD script and
 * healing-sync.js listen for. Everything below that event stays engine-agnostic.
 */
(function () {
  'use strict';

  var arUnsupported = document.getElementById('ar-unsupported');
  var arErrorMsg    = document.getElementById('ar-error-msg');
  var announced     = false;

  /* Surface the unsupported screen. 8th Wall's landing-page already handles
     unsupported browsers; this covers the harder failure where the engine
     binary never loads at all (offline / CDN unreachable). */
  function showUnsupported(msg) {
    if (arErrorMsg && msg) arErrorMsg.textContent = msg;
    if (arUnsupported) arUnsupported.classList.add('visible');
  }

  function announceSession() {
    if (announced) return;
    announced = true;
    document.dispatchEvent(new CustomEvent('ar-session-started', {
      detail: { engine: 'eighthwall' }
    }));
  }

  function wire() {
    var scene = document.getElementById('ar-scene');
    if (!scene) {
      showUnsupported('AR scene failed to load.');
      return;
    }

    // 8th Wall signals the world-tracking session is live with 'realityready'.
    scene.addEventListener('realityready', announceSession);

    // Safety net: if the engine binary never initialises, 'realityready' never
    // fires. Surface the unsupported screen instead of hanging on the loader.
    setTimeout(function () {
      if (!announced) {
        showUnsupported('The AR engine could not start. Check your connection ' +
          'and camera permission, then reload.');
      }
    }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

})();
