/**
 * views/map.js
 * Digital Twin Map — MapTiler Cloud GL map with:
 *   • Dark "dataviz" base style
 *   • Live AQI station markers (colour-coded by band)
 *   • GeoJSON heatmap layer driven by live station AQI values
 *   • Wind particle canvas overlaid on the map
 *   • Time-scrub player
 *   • Station telemetry inspector panel
 */
import * as maptilersdk from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import { getCityAQI } from '../api/aqi.js';
import { getWeather }  from '../api/weather.js';

// ── AQI → hex colour (Indian AQI scale) ──────────────────────────────────────
function aqiColor(aqi) {
  if (aqi <= 50)  return '#4CAF50'; // Good
  if (aqi <= 100) return '#8BC34A'; // Satisfactory
  if (aqi <= 200) return '#FFC107'; // Moderate
  if (aqi <= 300) return '#FF9800'; // Poor
  if (aqi <= 400) return '#F44336'; // Very Poor
  return '#7B1FA2';                 // Severe
}

function aqiBadgeClass(aqi) {
  if (aqi <= 100) return 'badge-status--good';
  if (aqi <= 200) return 'badge-status--moderate';
  if (aqi <= 300) return 'badge-status--poor';
  return 'badge-status--severe';
}

// ── City centre coordinates ───────────────────────────────────────────────────
const CITY_CENTRES = {
  pune:    [73.8567, 18.5204],
  mumbai:  [72.8777, 19.0760],
  delhi:   [77.2090, 28.6139],
  nashik:  [73.7898, 19.9975],
  thane:   [72.9781, 19.2183],
  nagpur:  [79.0882, 21.1458],
  akurdi:  [73.7741, 18.6480],
};

export function initDigitalTwinMap() {
  // ── MapTiler SDK setup ────────────────────────────────────────────────────
  const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
  maptilersdk.config.apiKey = MAPTILER_KEY;

  let map = null;
  let markersOnMap = [];
  let heatmapLoaded = false;
  let heatmapVisible = true;
  let particlesVisible = true;
  let currentSpeed = 1;

  function initMap(city = 'pune') {
    const container = document.getElementById('maptiler-map');
    if (!container) return;

    // Destroy previous instance if switching city
    if (map) { map.remove(); map = null; markersOnMap = []; heatmapLoaded = false; }

    const centre = CITY_CENTRES[city.toLowerCase()] ?? CITY_CENTRES.pune;

    map = new maptilersdk.Map({
      container: 'maptiler-map',
      style: maptilersdk.MapStyle.DATAVIZ.DARK,
      center: centre,
      zoom: 11,
      pitch: 30,
      attributionControl: false,
    });

    map.addControl(new maptilersdk.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maptilersdk.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      loadStationData(city);
    });
  }

  // ── Wind particle canvas (overlaid on the MapTiler map) ───────────────────
  const canvas = document.getElementById('wind-particles-canvas');
  const ctx    = canvas ? canvas.getContext('2d') : null;
  let lastCanvasW = 0, lastCanvasH = 0;

  function resizeCanvas() {
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w > 0 && h > 0) {
      canvas.width  = w;
      canvas.height = h;
    }
  }
  window.resizeWindCanvas = resizeCanvas;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let ANGLE = window._windAngle != null ? window._windAngle : 0.56;
  let dx = Math.cos(ANGLE);
  let dy = Math.sin(ANGLE);

  const PARTICLE_COUNT = 80;
  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x:     Math.random() * 800,
    y:     Math.random() * 600,
    len:   10 + Math.random() * 20,
    speed: 1.0 + Math.random() * 1.6,
    alpha: 0.15 + Math.random() * 0.45,
    hue:   Math.random() > 0.6 ? '#efd395' : '#38bdf8',
  }));

  /** Re-scatter all particles across the current canvas dimensions. */
  function scatterParticles() {
    const w = canvas?.width || 800;
    const h = canvas?.height || 600;
    for (const p of particles) {
      p.x = Math.random() * w;
      p.y = Math.random() * h;
    }
  }

  function renderParticles() {
    if (!ctx || !canvas) { requestAnimationFrame(renderParticles); return; }

    // Lazy-resize: if the canvas is still 0-sized (view was hidden), try again
    if (canvas.width === 0 || canvas.height === 0) {
      resizeCanvas();
      if (canvas.width > 0 && canvas.height > 0) scatterParticles();
      requestAnimationFrame(renderParticles);
      return;
    }

    // Detect dimension changes (e.g. first time view becomes visible)
    if (canvas.width !== lastCanvasW || canvas.height !== lastCanvasH) {
      if (lastCanvasW === 0 && lastCanvasH === 0) scatterParticles();
      lastCanvasW = canvas.width;
      lastCanvasH = canvas.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update wind angle (use != null so angle 0 is still valid)
    if (window._windAngle != null && window._windAngle !== ANGLE) {
      ANGLE = window._windAngle;
      dx = Math.cos(ANGLE);
      dy = Math.sin(ANGLE);
    }

    if (particlesVisible) {
      const w = canvas.width;
      const h = canvas.height;
      for (const p of particles) {
        p.x += dx * p.speed * currentSpeed;
        p.y += dy * p.speed * currentSpeed;
        // Wrap around all edges regardless of wind direction
        if (p.x > w + 40)  p.x = -40;
        if (p.y > h + 40)  p.y = -40;
        if (p.x < -40)     p.x = w + 40;
        if (p.y < -40)     p.y = h + 40;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - dx * p.len, p.y - dy * p.len);
        ctx.strokeStyle = p.hue;
        ctx.globalAlpha = p.alpha;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }
    requestAnimationFrame(renderParticles);
  }
  renderParticles();

  // ── Load live station data → markers + heatmap ────────────────────────────
  async function loadStationData(cityName = 'Pune') {
    try {
      const [aqiData, weather] = await Promise.all([
        getCityAQI(cityName),
        getWeather(cityName),
      ]);

      const windLabel = `${weather.wind_speed_kmh.toFixed(1)} km/h ${weather.wind_direction_label}`;
      window._windAngle = (weather.wind_direction_deg * Math.PI) / 180;

      // Update wind pill label
      const windPillLabel = document.getElementById('wind-pill-label');
      if (windPillLabel) windPillLabel.textContent = `Wind Vectors (${windLabel})`;

      // Store for inspector default
      window._lastWindLabel = windLabel;

      if (!map) return;

      // ── Clear old markers ─────────────────────────────────────────────────
      markersOnMap.forEach((m) => m.remove());
      markersOnMap = [];

      // ── GeoJSON features for heatmap ──────────────────────────────────────
      const features = aqiData.stations.map((st) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [st.longitude, st.latitude] },
        properties: { aqi: st.aqi, name: st.station_name },
      }));

      // ── Add / update heatmap source & layer ───────────────────────────────
      if (map.getSource('aqi-heat')) {
        map.getSource('aqi-heat').setData({ type: 'FeatureCollection', features });
      } else {
        map.addSource('aqi-heat', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });
        map.addLayer({
          id: 'aqi-heatmap',
          type: 'heatmap',
          source: 'aqi-heat',
          paint: {
            'heatmap-weight':    ['interpolate', ['linear'], ['get', 'aqi'], 0, 0, 400, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,   'rgba(76, 175, 80, 0)',
              0.2, 'rgba(139, 195, 74, 0.6)',
              0.4, 'rgba(255, 193, 7, 0.7)',
              0.6, 'rgba(255, 152, 0, 0.8)',
              0.8, 'rgba(244, 67, 54, 0.9)',
              1,   'rgba(123, 31, 162, 1)',
            ],
            'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 8, 30, 14, 80],
            'heatmap-opacity': 0.7,
          },
        });
        heatmapLoaded = true;
      }

      // ── Add live station markers ──────────────────────────────────────────
      aqiData.stations.forEach((st) => {
        if (!st.latitude || !st.longitude) return;

        // Custom coloured marker element
        const el = document.createElement('div');
        el.className = 'maptiler-aqi-marker';
        el.style.cssText = `
          width: 44px; height: 44px; border-radius: 50%;
          background: ${aqiColor(st.aqi)};
          border: 3px solid rgba(255,255,255,0.9);
          box-shadow: 0 0 12px ${aqiColor(st.aqi)}99;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700; font-size: 11px; color: #fff;
          cursor: pointer; position: relative;
          transition: transform 0.15s ease;
        `;
        el.textContent = st.aqi;
        el.title = st.station_name;

        el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
        el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

        // Click → populate inspector
        el.addEventListener('click', () => {
          populateInspector({
            name:       st.station_name,
            zone:       `${cityName} • Live WAQI Sensor`,
            badge:      `${st.aqi} AQI`,
            badgeClass: aqiBadgeClass(st.aqi),
            pm25: st.pm25 != null ? `${st.pm25} µg/m³` : '—',
            pm10: st.pm10 != null ? `${st.pm10} µg/m³` : '—',
            no2:  st.no2  != null ? `${st.no2} ppb`    : '—',
            wind: windLabel,
            aqi:  st.aqi,
          });
        });

        const marker = new maptilersdk.Marker({ element: el })
          .setLngLat([st.longitude, st.latitude])
          .addTo(map);

        markersOnMap.push(marker);
      });

      // Auto-select the dominant station in the inspector
      if (aqiData.dominant_station) {
        const ds = aqiData.dominant_station;
        populateInspector({
          name:       ds.station_name,
          zone:       `${cityName} • Dominant Station`,
          badge:      `${ds.aqi} AQI`,
          badgeClass: aqiBadgeClass(ds.aqi),
          pm25: ds.pm25 != null ? `${ds.pm25} µg/m³` : '—',
          pm10: ds.pm10 != null ? `${ds.pm10} µg/m³` : '—',
          no2:  ds.no2  != null ? `${ds.no2} ppb`    : '—',
          wind: windLabel,
          aqi:  ds.aqi,
        });
      }

    } catch (err) {
      console.warn('[map] Station data fetch failed.', err);
    }
  }

  // ── Populate the inspector side-panel ────────────────────────────────────
  function populateInspector({ name, zone, badge, badgeClass, pm25, pm10, no2, wind, aqi }) {
    const get = (id) => document.getElementById(id);
    if (get('inspect-name'))  get('inspect-name').textContent  = name;
    if (get('inspect-zone'))  get('inspect-zone').textContent  = zone;
    if (get('inspect-pm25'))  get('inspect-pm25').textContent  = pm25;
    if (get('inspect-pm10'))  get('inspect-pm10').textContent  = pm10;
    if (get('inspect-no2'))   get('inspect-no2').textContent   = no2;
    if (get('inspect-wind'))  get('inspect-wind').textContent  = wind;
    const badgeEl = get('inspect-badge');
    if (badgeEl) { badgeEl.textContent = badge; badgeEl.className = `badge-status ${badgeClass}`; }

    // Confidence interval — rough ±15% band around current AQI
    const lower = Math.round(aqi * 0.88);
    const upper = Math.round(aqi * 1.12);
    const pct   = Math.round(((aqi - lower) / (upper - lower)) * 100);
    if (get('conf-lower')) get('conf-lower').textContent = `${lower} AQI`;
    if (get('conf-upper')) get('conf-upper').textContent = `${upper} AQI`;
    const pt = get('conf-point');
    if (pt) pt.style.left = `${pct}%`;
  }

  // ── Time-scrub controls ───────────────────────────────────────────────────
  const timeSlider  = document.getElementById('time-scrub-slider');
  const timeDisplay = document.getElementById('scrub-time-display');
  const playBtn     = document.getElementById('time-scrub-play');
  const playIcon    = document.getElementById('play-icon');

  function updateTimeLabel(val) {
    if (!timeDisplay) return;
    const offsets = [-7, -5, -3, -1, 0, 1, 2, 3];
    const labels  = ['Historical Baseline', 'Pre-Inversion Baseline', 'Stubble Burning Inflow',
                     'Thermal Inversion Surge', 'Live Stream', 'LightGBM Quantile Forecast',
                     'Boundary Layer Deepening', 'Multi-Model Consensus'];
    const idx = Math.min(Math.floor(val / 13), 7);
    const d   = new Date();
    d.setDate(d.getDate() + offsets[idx]);
    const prefix  = offsets[idx] < 0 ? `${offsets[idx]}d` : offsets[idx] === 0 ? 'Now' : `+${offsets[idx] * 24}h`;
    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    timeDisplay.textContent = `${prefix} • ${dateStr} (${labels[idx]})`;
  }

  timeSlider?.addEventListener('input', (e) => updateTimeLabel(parseInt(e.target.value, 10)));

  let isPlaying = false;
  let playInterval = null;
  function setPlayState(playing) {
    isPlaying = playing;
    playIcon?.setAttribute('data-lucide', playing ? 'pause' : 'play');
    if (window.lucide) window.lucide.createIcons();
    clearInterval(playInterval);
    if (playing && timeSlider) {
      playInterval = setInterval(() => {
        let v = parseInt(timeSlider.value, 10) + 1;
        if (v > 100) v = 0;
        timeSlider.value = v;
        updateTimeLabel(v);
      }, 150 / currentSpeed);
    }
  }
  playBtn?.addEventListener('click', () => setPlayState(!isPlaying));

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('speed-btn--active'));
      btn.classList.add('speed-btn--active');
      currentSpeed = parseFloat(btn.getAttribute('data-speed')) || 1;
      if (isPlaying) setPlayState(true);
    });
  });

  // ── Layer toggles ─────────────────────────────────────────────────────────
  document.getElementById('toggle-particles')?.addEventListener('click', (e) => {
    particlesVisible = !particlesVisible;
    e.currentTarget.classList.toggle('layer-pill--active', particlesVisible);
  });

  document.getElementById('toggle-heatmap')?.addEventListener('click', (e) => {
    heatmapVisible = !heatmapVisible;
    e.currentTarget.classList.toggle('layer-pill--active', heatmapVisible);
    if (map && heatmapLoaded && map.getLayer('aqi-heatmap')) {
      map.setLayoutProperty('aqi-heatmap', 'visibility', heatmapVisible ? 'visible' : 'none');
    }
  });

  document.getElementById('toggle-confidence')?.addEventListener('click', (e) => {
    const active = e.currentTarget.classList.toggle('layer-pill--active');
    // Toggle marker opacity to indicate uncertainty veil
    markersOnMap.forEach((m) => {
      const el = m.getElement();
      if (el) el.style.opacity = active ? '0.5' : '1';
    });
  });

  // ── Scenario button ───────────────────────────────────────────────────────
  document.getElementById('btn-simulate-station')?.addEventListener('click', () => {
    if (window.switchView) window.switchView('scenario');
  });

  // ── Hook into switchView — initialise map on first open, reload on city change ──
  let mapDataLoaded = false;
  const origSwitch  = window.switchView;
  window.switchView = function (viewName) {
    origSwitch?.(viewName);
    if (viewName === 'map') {
      // Resize after a tick so the container has non-zero dimensions
      requestAnimationFrame(() => {
        resizeCanvas();
        scatterParticles();
      });
      const city = (window._currentCity ?? 'Pune').toLowerCase();
      if (!mapDataLoaded) {
        mapDataLoaded = true;
        initMap(city);
      } else if (map) {
        // Fly to new city centre if city changed
        const centre = CITY_CENTRES[city] ?? CITY_CENTRES.pune;
        map.flyTo({ center: centre, zoom: 11, speed: 1.2 });
        loadStationData(window._currentCity ?? 'Pune');
        // MapTiler needs resize notification after becoming visible
        setTimeout(() => map.resize(), 100);
      }
    }
  };

  // Re-load when city changes from dashboard chips / settings
  const _origLoadCity = window._onCityChange;
  window._onCityChange = function (cityName) {
    _origLoadCity?.(cityName);
    if (map && mapDataLoaded) {
      const key = cityName.toLowerCase();
      const centre = CITY_CENTRES[key] ?? CITY_CENTRES.pune;
      map.flyTo({ center: centre, zoom: 11, speed: 1.2 });
      loadStationData(cityName);
    }
  };
}
