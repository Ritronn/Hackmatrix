/**
 * Atmos Twin — Tablet Bento Dashboard
 * Interactions, animations, and live telemetry matching the reference design.
 */
import './style.css';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  initNavRail();
  initMapControls();
  initHeroCountUp();
  initDriftAlert();
});

// ─── Left Nav Rail Interaction ───
function initNavRail() {
  const buttons = document.querySelectorAll('.rail-btn:not(.rail-btn--alert)');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('rail-btn--active'));
      btn.classList.add('rail-btn--active');
    });
  });
}

// ─── Hero AQI Count-Up Animation ───
function initHeroCountUp() {
  const aqiEl = document.getElementById('hero-aqi');
  if (!aqiEl) return;

  const target = 187;
  const duration = 1200;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    aqiEl.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Map Controls & Location Chips ───
function initMapControls() {
  // Location Chips
  const chips = document.querySelectorAll('.loc-chip');
  const heroStation = document.getElementById('hero-station');
  const heroAqi = document.getElementById('hero-aqi');

  const stationsData = {
    'Delhi NCR, IN': { aqi: 187, cond: 'Poor Air Quality • Haze' },
    'Noida, UP': { aqi: 178, cond: 'Poor Air Quality • High PM2.5' },
    'Gurugram, HR': { aqi: 165, cond: 'Moderate to Poor • Smog' },
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('loc-chip--active'));
      chip.classList.add('loc-chip--active');

      const locName = chip.querySelector('span')?.textContent?.trim();
      if (locName && stationsData[locName]) {
        if (heroStation) heroStation.textContent = locName;
        if (heroAqi) heroAqi.textContent = stationsData[locName].aqi;
      }
    });
  });

  // Map Zoom Controls
  const mapSurface = document.getElementById('map-surface');
  let zoomLevel = 1;

  const btnZoomIn = document.getElementById('ctrl-zoom-in');
  const btnZoomOut = document.getElementById('ctrl-zoom-out');
  const btnLocate = document.getElementById('ctrl-locate');

  if (btnZoomIn && mapSurface) {
    btnZoomIn.addEventListener('click', () => {
      if (zoomLevel < 1.3) {
        zoomLevel += 0.1;
        mapSurface.style.transform = `scale(${zoomLevel})`;
        mapSurface.style.transition = 'transform 0.3s ease';
      }
    });
  }

  if (btnZoomOut && mapSurface) {
    btnZoomOut.addEventListener('click', () => {
      if (zoomLevel > 0.9) {
        zoomLevel -= 0.1;
        mapSurface.style.transform = `scale(${zoomLevel})`;
        mapSurface.style.transition = 'transform 0.3s ease';
      }
    });
  }

  if (btnLocate && mapSurface) {
    btnLocate.addEventListener('click', () => {
      zoomLevel = 1;
      mapSurface.style.transform = 'scale(1)';
      mapSurface.style.transition = 'transform 0.3s ease';
    });
  }
}

// ─── Twin Drift Alert Notification ───
function initDriftAlert() {
  const alertBtn = document.getElementById('drift-alert-trigger');
  if (!alertBtn) return;

  alertBtn.addEventListener('click', () => {
    alert(
      '⚠️ Twin Drift Alert Detected:\n\n' +
      'Station: Anand Vihar\n' +
      'Observed PM2.5: 218 µg/m³\n' +
      'Forecast Model: 165 µg/m³ (+32% divergence)\n' +
      'Likely Cause: Stubble burning plume & localized inversion'
    );
  });
}
