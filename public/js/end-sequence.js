(function() {
  'use strict';
  let triggered = false;

  document.addEventListener('healing-complete', function() {
    if (triggered) return;
    triggered = true;
    // Start Mode B character animation
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
    const els = overlay.querySelectorAll('[data-delay]');
    els.forEach(el => {
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('revealed'), delay);
    });
  }
})();
