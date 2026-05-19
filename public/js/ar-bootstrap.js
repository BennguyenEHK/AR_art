(function () {
  'use strict';

  var REALITY_TIMEOUT = 60000;

  var stages = [];
  var announced = false;
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

  function boot() {
    log('bootstrap running');

    if (!window.AFRAME) {
      showUnsupported('The AR framework failed to load.');
      return;
    }

    var scene = document.getElementById('ar-scene');
    if (!scene) {
      showUnsupported('AR scene could not be found.');
      return;
    }
    log('scene found');
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

  window.addEventListener('error', function (e) {
    log('window error: ' + (e && e.message ? e.message : 'unknown'));
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
