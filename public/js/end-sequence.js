(function() {
  'use strict';
  let triggered = false;

  document.addEventListener('healing-complete', function() {
    if (triggered) return;
    triggered = true;
    const charEl = document.getElementById('character-root');
    if (charEl) charEl.setAttribute('character-animator', 'mode', 'b');
  });

  document.addEventListener('mode-b-complete', function() {
    revealEndMessage();
  });

  function revealEndMessage() {
    const overlay = document.getElementById('end-overlay');
    if (!overlay) return;
    overlay.classList.add('visible');

    // Healing is done — freeze the HUD bars so they stop updating
    const hudBars = document.getElementById('hud-bars');
    if (hudBars) hudBars.style.display = 'none';

    // Reveal all timed elements (lines, separator, tagline, restart button)
    const els = overlay.querySelectorAll('[data-delay]');
    els.forEach(function(el) {
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(function() { el.classList.add('revealed'); }, delay);
    });

    // Wire restart button — LOCAL reload only, no broadcast to other users
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', function() {
        window.location.reload();
      });
    }
  }
})();
