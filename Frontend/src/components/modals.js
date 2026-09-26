/**
 * components/modals.js
 * Global modal system: Drift Alert, City Search, Daily Briefing.
 * Relies on .modal-backdrop / .modal-backdrop--active CSS pattern.
 */

function openModal(id) {
  document.getElementById(id)?.classList.add('modal-backdrop--active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('modal-backdrop--active');
}

export function initGlobalModals() {
  // ── Generic close on backdrop click or close buttons ──
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('modal-backdrop--active');
    });
  });

  document.querySelectorAll('.modal-close-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-backdrop')?.classList.remove('modal-backdrop--active');
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop--active').forEach((m) =>
        m.classList.remove('modal-backdrop--active')
      );
    }
  });

  // ── 1. Twin Drift Alert Modal ──
  document.getElementById('drift-alert-trigger')?.addEventListener('click', () =>
    openModal('modal-drift-backdrop')
  );
  document.getElementById('btn-dismiss-drift')?.addEventListener('click', () =>
    closeModal('modal-drift-backdrop')
  );

  const btnRecal = document.getElementById('btn-recalibrate');
  if (btnRecal) {
    btnRecal.addEventListener('click', () => {
      const icon = btnRecal.querySelector('i');
      const label = btnRecal.querySelector('span');
      icon?.classList.add('spin-animation');
      if (label) label.textContent = 'Recalibrating Kalman Filter...';

      setTimeout(() => {
        if (label) label.textContent = '✓ Model Recalibrated (Residual < 4%)';
        // Hide the badge dot once resolved
        document.querySelector('.alert-badge-dot')?.style.setProperty('display', 'none');
        setTimeout(() => {
          closeModal('modal-drift-backdrop');
          if (label) label.textContent = 'Trigger Kalman Recalibration';
          icon?.classList.remove('spin-animation');
        }, 1200);
      }, 900);
    });
  }

  // ── 2. City Search Modal ──
  const citySearchBtn  = document.getElementById('city-search-btn');
  const searchInput    = document.getElementById('station-search-input');
  const searchItems    = document.querySelectorAll('.search-item');

  citySearchBtn?.addEventListener('click', () => {
    openModal('modal-search-backdrop');
    setTimeout(() => searchInput?.focus(), 100);
  });

  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    searchItems.forEach((item) => {
      item.style.display = item.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  });

  searchItems.forEach((item) => {
    item.addEventListener('click', () => {
      const station = item.querySelector('strong')?.textContent;
      const aqiStr  = item.querySelector('.badge-status')?.textContent;
      const heroEl  = document.getElementById('hero-station');
      if (station && heroEl) heroEl.textContent = station;
      if (aqiStr) {
        const num = parseInt(aqiStr, 10);
        if (!isNaN(num) && window.initHeroCountUp) window.initHeroCountUp(num);
      }
      closeModal('modal-search-backdrop');
    });
  });

  // ── 3. Daily Briefing Modal ──
  document.getElementById('btn-open-briefing-map')?.addEventListener('click', () =>
    openModal('modal-briefing-backdrop')
  );

  document.getElementById('btn-copy-briefing')?.addEventListener('click', () => {
    const content = document.getElementById('briefing-content')?.innerText ?? '';
    navigator.clipboard.writeText(content).then(() => {
      const btn = document.getElementById('btn-copy-briefing');
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Briefing Copied!';
      setTimeout(() => (btn.innerHTML = orig), 2000);
    });
  });

  document.getElementById('btn-print-briefing')?.addEventListener('click', () => window.print());
}
