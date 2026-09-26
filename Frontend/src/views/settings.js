/**
 * views/settings.js
 * Multi-city switcher — clicking a card fetches real live data for that city.
 */
import { loadCityData } from './dashboard.js';

export function initSettingsAndCities() {
  const cityCards   = document.querySelectorAll('.city-card');
  const heroStation = document.getElementById('hero-station');
  const heroCond    = document.querySelector('.hero-card__condition span');

  // City name → what we send to the backend
  const CITY_API_NAME = {
    pune:      'Pune',
    mumbai:    'Mumbai',
    nashik:    'Nashik',
    akurdi:    'Akurdi',
    thane:     'Thane',
    nagpur:    'Nagpur',
    delhi:     'Delhi',
  };

  cityCards.forEach((card) => {
    card.addEventListener('click', async () => {
      cityCards.forEach((c) => {
        c.classList.remove('city-card--active');
        c.querySelector('.active-indicator')?.remove();
      });
      card.classList.add('city-card--active');

      const ind = document.createElement('span');
      ind.className = 'active-indicator';
      ind.textContent = '● Active Twin';
      card.appendChild(ind);

      const key     = card.getAttribute('data-city');
      const apiName = CITY_API_NAME[key] ?? key;

      // loadCityData handles the fetch + DOM update + fallback
      await loadCityData(apiName);
    });
  });

  // Anomaly threshold slider
  const driftSlider  = document.getElementById('drift-thresh-slider');
  const driftDisplay = document.getElementById('drift-thresh-display');
  driftSlider?.addEventListener('input', (e) => {
    if (driftDisplay) driftDisplay.textContent = `${e.target.value}% Divergence`;
  });

  // API key copy
  document.getElementById('btn-copy-apikey')?.addEventListener('click', function () {
    const key = 'atm_live_d7a89f31c4b829e04fc8192a01';
    navigator.clipboard.writeText(key).then(() => {
      const orig = this.innerHTML;
      this.innerHTML = '✓ API Key Copied!';
      setTimeout(() => (this.innerHTML = orig), 2200);
    });
  });

  // Stream speed radio pills
  document.querySelectorAll('input[name="sim-speed"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const speed = parseFloat(e.target.value);
      if (window._mapSetSpeed) window._mapSetSpeed(speed);
    });
  });
}
