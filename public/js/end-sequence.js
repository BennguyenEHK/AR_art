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

    // Reveal all timed elements (lines, separator, tagline, restart button)
    const els = overlay.querySelectorAll('[data-delay]');
    els.forEach(function(el) {
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(function() { el.classList.add('revealed'); }, delay);
    });

    // Wire restart button click — broadcast reset to all users then reload
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', function() {
        if (window.HealingSync && window.HealingSync.reset) {
          window.HealingSync.reset();
        } else {
          window.location.reload();
        }
      });
    }
  }
})();
