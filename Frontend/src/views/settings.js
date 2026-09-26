/**
 * views/settings.js
 * Digital Twin Settings: multi-city switcher, stream simulation speed,
 * anomaly threshold slider, public API key copy.
 */
export function initSettingsAndCities() {
  const cityCards    = document.querySelectorAll('.city-card');
  const heroStation  = document.getElementById('hero-station');
  const heroCond     = document.querySelector('.hero-card__condition span');

  const CITY_PROFILES = {
    delhi:     { name: 'ITO, Delhi NCR, IN',            aqi: 187, cond: 'Poor Air Quality • Haze' },
    mumbai:    { name: 'BKC, Mumbai, IN',               aqi: 92,  cond: 'Good Air Quality • Coastal Breeze' },
    bengaluru: { name: 'Whitefield, Bengaluru, IN',     aqi: 74,  cond: 'Good Air Quality • High-Elevation Dispersion' },
    kolkata:   { name: 'Victoria, Kolkata, IN',         aqi: 168, cond: 'Poor Air Quality • High Humidity Inversion' },
    lucknow:   { name: 'Lalbagh, Lucknow, IN',          aqi: 204, cond: 'Severe Air Quality • Thermal Trapping' },
    hyderabad: { name: 'Sanathnagar, Hyderabad, IN',    aqi: 112, cond: 'Moderate Air Quality • Hazy Sunshine' },
  };

  // ── City cards ──
  cityCards.forEach((card) => {
    card.addEventListener('click', () => {
      cityCards.forEach((c) => {
        c.classList.remove('city-card--active');
        c.querySelector('.active-indicator')?.remove();
      });

      card.classList.add('city-card--active');
      const ind = document.createElement('span');
      ind.className   = 'active-indicator';
      ind.textContent = '● Active Twin';
      card.appendChild(ind);

      const key  = card.getAttribute('data-city');
      const prof = CITY_PROFILES[key];
      if (!prof) return;
      if (heroStation) heroStation.textContent = prof.name;
      if (heroCond)    heroCond.textContent    = prof.cond;
      if (window.initHeroCountUp) window.initHeroCountUp(prof.aqi);
    });
  });

  // ── Anomaly threshold slider ──
  const driftSlider  = document.getElementById('drift-thresh-slider');
  const driftDisplay = document.getElementById('drift-thresh-display');
  driftSlider?.addEventListener('input', (e) => {
    if (driftDisplay) driftDisplay.textContent = `${e.target.value}% Divergence`;
  });

  // ── Public API key copy ──
  document.getElementById('btn-copy-apikey')?.addEventListener('click', function () {
    const key = 'atm_live_d7a89f31c4b829e04fc8192a01';
    navigator.clipboard.writeText(key).then(() => {
      const orig = this.innerHTML;
      this.innerHTML = '✓ API Key Copied!';
      setTimeout(() => (this.innerHTML = orig), 2200);
    });
  });

  // ── Stream simulation speed radio pills ──
  // The radio pills are pure CSS — no JS needed unless you want to sync with map playback.
  document.querySelectorAll('input[name="sim-speed"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      // Optionally propagate speed to map time-scrub player
      const speed = parseFloat(e.target.value);
      if (window._mapSetSpeed) window._mapSetSpeed(speed);
    });
  });
}
