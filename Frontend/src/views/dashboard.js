/**
 * views/dashboard.js
 * Dashboard: hero AQI + weather pulled live from backend.
 * Falls back to static values if backend is unreachable.
 */
import { getCityAQI } from '../api/aqi.js';
import { getWeather }  from '../api/weather.js';
import * as maptilersdk from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

// ── AQI band → CSS class ──────────────────────────────────────────────────────
const BAND_CLASS = {
  'Good':         'badge-status--good',
  'Satisfactory': 'badge-status--good',
  'Moderate':     'badge-status--moderate',
  'Poor':         'badge-status--poor',
  'Very Poor':    'badge-status--severe',
  'Severe':       'badge-status--severe',
};

// ── City centre coordinates (shared with map.js) ──────────────────────────────
const CITY_CENTRES = {
  pune:    [73.8567, 18.5204],
  mumbai:  [72.8777, 19.0760],
  delhi:   [77.2090, 28.6139],
  nashik:  [73.7898, 19.9975],
  thane:   [72.9781, 19.2183],
  nagpur:  [79.0882, 21.1458],
  akurdi:  [73.7741, 18.6480],
};

/**
 * Animate the hero AQI number to targetVal.
 * Exposed globally so settings/modals can call window.initHeroCountUp().
 */
export function initHeroCountUp(targetVal) {
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
  if (liveBadge) {
    liveBadge.textContent = data.data_source === 'replayed'
      ? 'Cached Sensor Data'
      : 'Live Sensor Twin';
  }

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

  // ── Radar bubble / station pill updates on dashboard mini-map ────────────
  const RADAR_KEYWORDS = {
    'radar-aqi-ito':    ['Shivaji', 'Shivajinagar', 'Swargate', 'Pune'],
    'radar-pill-anand': ['Akurdi', 'Nigdi', 'Pimpri', 'Chinchwad'],
    'radar-pill-dwarka':['Bhosari', 'Chakan', 'MIDC', 'Alandi'],
  };

  for (const [elId, keywords] of Object.entries(RADAR_KEYWORDS)) {
    const el = document.getElementById(elId);
    if (!el) continue;
    const matched = data.stations.find((s) =>
      keywords.some((kw) => s.station_name.toLowerCase().includes(kw.toLowerCase()))
    );
    const aqi = matched ? matched.aqi : Math.round(data.avg_aqi);
    if (elId === 'radar-aqi-ito') {
      el.textContent = `${aqi}°`;
    } else {
      // station-pill span: keep the label prefix, update the value
      const label = elId === 'radar-pill-anand' ? 'Akurdi PCMC' : 'Bhosari MIDC';
      el.textContent = `${label} ${aqi}°`;
    }
  }
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
  // Show loading state
  const aqiEl = document.getElementById('hero-aqi');
  if (aqiEl) aqiEl.textContent = '—';
  const condEl = document.querySelector('.hero-card__condition span');
  if (condEl) condEl.textContent = 'Fetching live data…';

  // Clear station name so it doesn't show last city's name during load
  const stationEl = document.getElementById('hero-station');
  if (stationEl) stationEl.textContent = `${city}…`;

  try {
    const [aqiData, weatherData] = await Promise.all([
      getCityAQI(city),
      getWeather(city),
    ]);
    applyAQIData(aqiData);
    applyWeatherData(weatherData);
  } catch (err) {
    console.error('[dashboard] Failed to fetch live AQI data.', err);
    if (aqiEl) aqiEl.textContent = 'N/A';
    if (condEl) condEl.textContent = `No sensor data available for ${city}`;
    if (stationEl) stationEl.textContent = `${city} — no station data`;
    window._currentCity = city;
  }
}

/** Mini-map (real MapTiler) + location chips + zoom controls. */
export function initMapControls() {
  // ── MapTiler mini-map setup ─────────────────────────────────────────────────
  const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
  if (!maptilersdk.config.apiKey) maptilersdk.config.apiKey = MAPTILER_KEY;

  let miniMap = null;
  const container = document.getElementById('dashboard-minimap');
  if (container) {
    miniMap = new maptilersdk.Map({
      container: 'dashboard-minimap',
      style: maptilersdk.MapStyle.DATAVIZ.DARK,
      center: CITY_CENTRES.pune,
      zoom: 10,
      pitch: 0,
      interactive: true,
      attributionControl: false,
    });
    miniMap.addControl(new maptilersdk.AttributionControl({ compact: true }), 'bottom-right');
    // Expose for city switches
    window._dashboardMiniMap = miniMap;
  }

  // ── Location chips ────────────────────────────────────────────────────────
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

      // Fly minimap to city
      if (miniMap) {
        const centre = CITY_CENTRES[cityName.toLowerCase()] ?? CITY_CENTRES.pune;
        miniMap.flyTo({ center: centre, zoom: 10, speed: 1.2 });
      }

      await loadCityData(cityName);
    });
  });

  // ── Zoom controls (operate on real map) ─────────────────────────────────
  document.getElementById('ctrl-zoom-in')?.addEventListener('click', () => {
    if (miniMap) miniMap.zoomIn({ duration: 300 });
  });

  document.getElementById('ctrl-zoom-out')?.addEventListener('click', () => {
    if (miniMap) miniMap.zoomOut({ duration: 300 });
  });

  document.getElementById('ctrl-locate')?.addEventListener('click', () => {
    if (miniMap) {
      const city = (window._currentCity ?? 'Pune').toLowerCase();
      const centre = CITY_CENTRES[city] ?? CITY_CENTRES.pune;
      miniMap.flyTo({ center: centre, zoom: 10, speed: 1.2 });
    }
  });
}

