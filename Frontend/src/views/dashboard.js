/**
 * views/dashboard.js
 * Dashboard: hero AQI + weather pulled live from backend.
 * Falls back to static values if backend is unreachable.
 */
import { getCityAQI } from '../api/aqi.js';
import { getWeather }  from '../api/weather.js';

// ── AQI band → CSS class ──────────────────────────────────────────────────────
const BAND_CLASS = {
  'Good':         'badge-status--good',
  'Satisfactory': 'badge-status--good',
  'Moderate':     'badge-status--moderate',
  'Poor':         'badge-status--poor',
  'Very Poor':    'badge-status--severe',
  'Severe':       'badge-status--severe',
};

/**
 * Animate the hero AQI number to targetVal.
 * Exposed globally so settings/modals can call window.initHeroCountUp().
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
  window.initHeroCountUp = initHeroCountUp;
}

/** Update hero card DOM with live AQI data from backend. */
function applyAQIData(data) {
  const station  = data.dominant_station;
  const band     = data.band;

  // AQI number (animated)
  initHeroCountUp(Math.round(data.avg_aqi));

  // Station name
  const stationEl = document.getElementById('hero-station');
  if (stationEl) stationEl.textContent = `${station.station_name}, ${data.city}, IN`;

  // Condition text + badge
  const condEl = document.querySelector('.hero-card__condition span');
  if (condEl) condEl.textContent = `${band.label} Air Quality`;

  // Live badge dot tooltip
  const liveBadge = document.querySelector('.hero-card__badge-live span:last-child');
  if (liveBadge) liveBadge.textContent = 'Live Sensor Twin';

  // Timestamp
  const dateEl = document.getElementById('hero-date');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // Store current city AQI globally for advisor context
  window._currentAqi  = data.avg_aqi;
  window._currentCity = data.city;
}

/** Update hero card with live weather data. */
function applyWeatherData(data) {
  const condEl = document.querySelector('.hero-card__condition span');
  if (condEl && condEl.textContent) {
    condEl.textContent += ` • ${data.description}`;
  }

  // Update wind sub-metric in highlight card 1
  const windNumEl = document.querySelector('.highlight-num');
  if (windNumEl && windNumEl.closest('.highlight-card')) {
    windNumEl.textContent = data.wind_speed_kmh.toFixed(1);
    const unitEl = windNumEl.nextElementSibling;
    if (unitEl) unitEl.textContent = `km/h ${data.wind_direction_label}`;
  }

  // Humidity sub-metric
  const subMetrics = document.querySelectorAll('.sub-metric__val');
  subMetrics.forEach((el) => {
    if (el.previousElementSibling?.textContent === 'Humidity') {
      el.textContent = `${data.humidity_pct}%`;
    }
  });

  // Store wind vectors globally for map particle animation
  window._windU = data.wind_u;
  window._windV = data.wind_v;
  window._windAngle = (data.wind_direction_deg * Math.PI) / 180;
}

/** Load live data for a given city and update the hero card. */
export async function loadCityData(city = 'Pune') {
  try {
    const [aqiData, weatherData] = await Promise.all([
      getCityAQI(city),
      getWeather(city),
    ]);
    applyAQIData(aqiData);
    applyWeatherData(weatherData);
  } catch (err) {
    console.warn('[dashboard] Backend unreachable, using static fallback.', err);
    // Static fallback — keeps default values
    initHeroCountUp(142);
    window._currentAqi  = 142;
    window._currentCity = city;
  }
}

/** Mini-map location chips + zoom controls. */
export function initMapControls() {
  const chips       = document.querySelectorAll('.loc-chip');
  const heroStation = document.getElementById('hero-station');

  chips.forEach((chip) => {
    chip.addEventListener('click', async () => {
      chips.forEach((c) => c.classList.remove('loc-chip--active'));
      chip.classList.add('loc-chip--active');
      const name = chip.querySelector('span')?.textContent?.trim() ?? '';
      // Parse "Pune, MH" → "Pune"
      const cityName = name.split(',')[0].trim();
      if (heroStation) heroStation.textContent = name;
      await loadCityData(cityName);
    });
  });

  // Zoom controls
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
