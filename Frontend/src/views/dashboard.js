/**
 * views/dashboard.js
 * Dashboard: hero AQI + weather pulled live from backend.
 * Falls back to static values if backend is unreachable.
 */
import { getCityAQI } from '../api/aqi.js';
import { getWeather }  from '../api/weather.js';
import { getForecast, getAttribution } from '../api/forecast.js';
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
  window._latestAqiData = data;

  // Compute health risk from live AQI
  applyHealthData(data.avg_aqi);

  // Update markers on dashboard minimap if it's already initialised
  if (window._renderDashboardMiniMapMarkers) {
    window._renderDashboardMiniMapMarkers(data.stations);
  }
}

/** AQI colour helper */
function aqiColor(aqi) {
  if (aqi <= 50)  return '#4CAF50';
  if (aqi <= 100) return '#8BC34A';
  if (aqi <= 200) return '#FFC107';
  if (aqi <= 300) return '#FF9800';
  if (aqi <= 400) return '#F44336';
  return '#7B1FA2';
}

/** Map AQI to CSS band class suffix */
function getAqiBand(aqi) {
  if (aqi <= 100) return 'good';
  if (aqi <= 200) return 'moderate';
  if (aqi <= 300) return 'poor';
  return 'severe';
}

/** Map AQI to lucide weather icon name */
function getForecastIcon(aqi) {
  if (aqi <= 100) return 'sun';
  if (aqi <= 200) return 'cloud-sun';
  if (aqi <= 300) return 'cloud-rain';
  return 'cloud-lightning';
}

/** Format ISO date string → e.g. "10 Oct" */
function formatForecastDate(dateStr, idx) {
  if (idx === 0) return 'Tomorrow';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** Format ISO date string → weekday name */
function formatForecastDay(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'long' });
}

/** Compute and display health risk from AQI */
function applyHealthData(aqi) {
  const healthIndex = Math.min(10, (aqi / 500) * 10).toFixed(1);
  const healthEl = document.getElementById('health-index-val');
  if (healthEl) healthEl.textContent = healthIndex;

  const erVisits = Math.round((aqi / 100) * 68);
  const erEl = document.getElementById('health-er-val');
  if (erEl) erEl.textContent = `+${erVisits}`;

  const advisoryEl = document.getElementById('health-advisory-val');
  if (advisoryEl) {
    if (aqi <= 50)       { advisoryEl.textContent = 'All Clear';        advisoryEl.style.color = '#34D399'; }
    else if (aqi <= 100) { advisoryEl.textContent = 'Sensitive Groups';  advisoryEl.style.color = '#8BC34A'; }
    else if (aqi <= 200) { advisoryEl.textContent = 'Limit Outdoor';     advisoryEl.style.color = '#FFC107'; }
    else if (aqi <= 300) { advisoryEl.textContent = 'Mask Advised';      advisoryEl.style.color = '#F87171'; }
    else                 { advisoryEl.textContent = 'Stay Indoors';      advisoryEl.style.color = '#EF4444'; }
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
  window._windDeg = data.wind_direction_deg;
  window._windSpeedKmh = data.wind_speed_kmh;
  window._windAngle = (data.wind_direction_deg * Math.PI) / 180;
}

/** Apply ML forecast data to highlight cards and build dynamic forecast rows. */
function applyForecastData(data) {
  if (!data?.points?.length) return;

  // Store globally for scenario/accuracy views
  window._forecastPoints = data.points;

  // ── Build dynamic forecast rows ────────────────────────────────────────
  const listEl = document.getElementById('forecast-list');
  if (listEl) {
    listEl.innerHTML = '';
    data.points.forEach((p, idx) => {
      const band = getAqiBand(p.predicted_aqi);
      const icon = getForecastIcon(p.predicted_aqi);
      const dateLabel = formatForecastDate(p.date, idx);
      const dayLabel  = formatForecastDay(p.date);

      const row = document.createElement('div');
      row.className = 'forecast-row';
      row.innerHTML = `
        <div class="forecast-row__left">
          <div class="forecast-icon-box forecast-icon-box--${band}"><i data-lucide="${icon}"></i></div>
          <div class="forecast-row__aqi"><span class="forecast-aqi-high">${Math.round(p.upper)}</span><span class="forecast-aqi-low">/${Math.round(p.lower)}</span></div>
        </div>
        <div class="forecast-row__date">${dateLabel}</div>
        <div class="forecast-row__day">${dayLabel}</div>
      `;
      listEl.appendChild(row);
    });
    // Re-render Lucide icons for the injected markup
    if (window.lucide) window.lucide.createIcons();
  }

  // ── Update confidence band card ────────────────────────────────────────
  if (data.points[0]) {
    const p = data.points[0];

    const lowerEl = document.getElementById('conf-band-lower');
    const upperEl = document.getElementById('conf-band-upper');
    if (lowerEl) lowerEl.textContent = `Lower: ${Math.round(p.lower)}`;
    if (upperEl) upperEl.textContent = `Upper: ${Math.round(p.upper)}`;

    const forecastEl = document.getElementById('forecast-tomorrow');
    if (forecastEl) forecastEl.textContent = `${Math.round(p.predicted_aqi)} AQI`;

    const forecastConfEl = document.getElementById('forecast-confidence');
    if (forecastConfEl) forecastConfEl.textContent = `${p.confidence_pct}%`;
  }

  // ── Update sub-metrics fallback ────────────────────────────────────────
  const subMetrics = document.querySelectorAll('.sub-metric__val');
  subMetrics.forEach((el) => {
    const label = el.previousElementSibling?.textContent?.trim();
    if (label === 'Tomorrow' && data.points[0]) {
      el.textContent = Math.round(data.points[0].predicted_aqi);
    }
    if (label === 'Day 3' && data.points[2]) {
      el.textContent = Math.round(data.points[2].predicted_aqi);
    }
  });

  console.log('[dashboard] ML forecast applied:', data.points.length, 'days');
}

/** Apply ML attribution breakdown to the dashboard with donut chart. */
function applyAttributionData(data) {
  if (!data) return;

  window._attributionData = data;

  // Update legend numbers
  const trafficEl    = document.getElementById('attr-traffic');
  const industrialEl = document.getElementById('attr-industrial');
  const dustEl       = document.getElementById('attr-dust');
  const weatherEl    = document.getElementById('attr-weather');
  const trafficShareEl = document.getElementById('traffic-share-val');

  if (trafficEl)      trafficEl.textContent    = `${data.traffic_pct}%`;
  if (industrialEl)   industrialEl.textContent  = `${data.industrial_pct}%`;
  if (dustEl)         dustEl.textContent        = `${data.combustion_dust_pct}%`;
  if (weatherEl)      weatherEl.textContent     = `${data.meteorology_pct}%`;
  if (trafficShareEl) trafficShareEl.textContent = `${data.traffic_pct}%`;

  // ── Draw donut chart ───────────────────────────────────────────────────
  const canvas = document.getElementById('attribution-donut');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const outerR = Math.min(cx, cy) - 4;
    const innerR = outerR * 0.52;

    ctx.clearRect(0, 0, w, h);

    const slices = [
      { pct: data.traffic_pct,          color: '#EF4444' },
      { pct: data.industrial_pct,       color: '#F59E0B' },
      { pct: data.combustion_dust_pct,   color: '#8B5CF6' },
      { pct: data.meteorology_pct,       color: '#38BDF8' },
      { pct: data.carry_over_pct,        color: '#6B7280' },
    ];

    const total = slices.reduce((s, sl) => s + sl.pct, 0) || 1;
    let startAngle = -0.5 * Math.PI;

    slices.forEach(slice => {
      if (slice.pct <= 0) return;
      const sliceAngle = 2 * Math.PI * (slice.pct / total);
      ctx.fillStyle = slice.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Cut centre for donut
    ctx.fillStyle = '#1a1d25';
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fill();

    // Centre label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHAP', cx, cy - 5);
    ctx.font = '9px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText('Attribution', cx, cy + 8);
  }

  console.log('[dashboard] ML attribution applied:', data.method);
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

    // Reposition minimap if already loaded
    if (window._dashboardMiniMap) {
      const centre = CITY_CENTRES[city.toLowerCase()] ?? CITY_CENTRES.pune;
      window._dashboardMiniMap.flyTo({ center: centre, zoom: 11, speed: 1.2 });
      if (window._renderDashboardMiniMapMarkers) {
        window._renderDashboardMiniMapMarkers(aqiData.stations);
      }
    }

    // ── Fetch ML forecast + attribution (non-blocking) ──────────────────
    Promise.all([
      getForecast(city).catch(() => null),
      getAttribution(city).catch(() => null),
    ]).then(([forecastData, attributionData]) => {
      if (forecastData) {
        window._latestForecast = forecastData;
        applyForecastData(forecastData);
      }
      if (attributionData) {
        window._latestAttribution = attributionData;
        applyAttributionData(attributionData);
      }
    });
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
  maptilersdk.config.apiKey = MAPTILER_KEY;

  let miniMap = null;
  let miniMapMarkers = [];

  function renderMiniMapMarkers(stations = []) {
    if (!miniMap) return;
    miniMapMarkers.forEach((m) => m.remove());
    miniMapMarkers = [];

    stations.forEach((st) => {
      if (!st.latitude || !st.longitude) return;

      const el = document.createElement('div');
      el.className = 'dashboard-minimap-marker';
      el.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(14, 18, 26, 0.88);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 9999px;
        padding: 3px 9px 3px 5px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55);
        cursor: pointer;
        user-select: none;
        transition: transform 0.2s ease, border-color 0.2s ease;
        white-space: nowrap;
        pointer-events: auto;
      `;

      const dot = document.createElement('span');
      const col = aqiColor(st.aqi);
      dot.style.cssText = `
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${col};
        box-shadow: 0 0 8px ${col};
        display: inline-block;
        flex-shrink: 0;
      `;

      const text = document.createElement('span');
      text.style.cssText = `
        font-size: 11px;
        font-weight: 600;
        color: #FFFFFF;
      `;
      const shortName = st.station_name.split(',')[0].trim();
      text.textContent = `${shortName} ${Math.round(st.aqi)}`;

      el.appendChild(dot);
      el.appendChild(text);

      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.1)';
        el.style.borderColor = 'rgba(56, 189, 248, 0.6)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1.0)';
        el.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      });
      el.addEventListener('click', () => {
        if (window.switchView) window.switchView('map');
      });

      const marker = new maptilersdk.Marker({ element: el })
        .setLngLat([st.longitude, st.latitude])
        .addTo(miniMap);
      miniMapMarkers.push(marker);
    });
  }
  window._renderDashboardMiniMapMarkers = renderMiniMapMarkers;

  const container = document.getElementById('dashboard-minimap');
  if (container) {
    miniMap = new maptilersdk.Map({
      container: 'dashboard-minimap',
      apiKey: MAPTILER_KEY,
      style: maptilersdk.MapStyle.STREETS.DARK,
      center: CITY_CENTRES.pune,
      zoom: 11,
      pitch: 0,
      interactive: true,
      attributionControl: false,
    });

    miniMap.addControl(new maptilersdk.AttributionControl({ compact: true }), 'bottom-right');
    window._dashboardMiniMap = miniMap;

    // Automatic layout sync via ResizeObserver
    const ro = new ResizeObserver(() => {
      if (miniMap) miniMap.resize();
    });
    ro.observe(container);

    miniMap.on('load', () => {
      miniMap.resize();
      if (window._latestAqiData?.stations) {
        renderMiniMapMarkers(window._latestAqiData.stations);
      }
    });

    // Handle deferred layout frames
    setTimeout(() => miniMap?.resize(), 250);
    setTimeout(() => miniMap?.resize(), 800);
    setTimeout(() => miniMap?.resize(), 2000);
    setTimeout(() => miniMap?.resize(), 5500);
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
        miniMap.flyTo({ center: centre, zoom: 11, speed: 1.2 });
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
      miniMap.flyTo({ center: centre, zoom: 11, speed: 1.2 });
    }
  });

  document.getElementById('ctrl-open-full-map')?.addEventListener('click', () => {
    if (window.switchView) window.switchView('map');
  });
}

