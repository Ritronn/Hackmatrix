/**
 * views/dashboard.js
 * Dashboard view: hero AQI count-up, mini-map location chips, zoom controls.
 */

/**
 * Animate the hero AQI number from its current value to targetVal.
 * Exposed globally so other modules (modals, settings) can call it.
 * @param {number} targetVal
 */
export function initHeroCountUp(targetVal = 187) {
  const aqiEl = document.getElementById('hero-aqi');
  if (!aqiEl) return;

  const duration = 1000;
  const start    = performance.now();
  const startVal = parseInt(aqiEl.textContent, 10) || 0;

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    aqiEl.textContent = Math.round(startVal + (targetVal - startVal) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  // Make accessible to other modules via global
  window.initHeroCountUp = initHeroCountUp;
}

/**
 * Location chips on the mini-map, and zoom/recenter controls.
 */
export function initMapControls() {
  const chips      = document.querySelectorAll('.loc-chip');
  const heroStation = document.getElementById('hero-station');

  const stationsData = {
    'Delhi NCR, IN': { aqi: 187 },
    'Noida, UP':     { aqi: 178 },
    'Gurugram, HR':  { aqi: 165 },
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('loc-chip--active'));
      chip.classList.add('loc-chip--active');
      const name = chip.querySelector('span')?.textContent?.trim();
      if (name && stationsData[name]) {
        if (heroStation) heroStation.textContent = name;
        initHeroCountUp(stationsData[name].aqi);
      }
    });
  });

  // Zoom controls on the mini-map surface
  const mapSurface = document.getElementById('map-surface');
  let zoomLevel = 1;

  document.getElementById('ctrl-zoom-in')?.addEventListener('click', () => {
    if (zoomLevel < 1.3) {
      zoomLevel = parseFloat((zoomLevel + 0.1).toFixed(1));
      if (mapSurface) { mapSurface.style.transform = `scale(${zoomLevel})`; mapSurface.style.transition = 'transform 0.3s ease'; }
    }
  });

  document.getElementById('ctrl-zoom-out')?.addEventListener('click', () => {
    if (zoomLevel > 0.9) {
      zoomLevel = parseFloat((zoomLevel - 0.1).toFixed(1));
      if (mapSurface) { mapSurface.style.transform = `scale(${zoomLevel})`; mapSurface.style.transition = 'transform 0.3s ease'; }
    }
  });

  document.getElementById('ctrl-locate')?.addEventListener('click', () => {
    zoomLevel = 1;
    if (mapSurface) { mapSurface.style.transform = 'scale(1)'; mapSurface.style.transition = 'transform 0.3s ease'; }
  });
}
