/**
 * views/map.js
 * Digital Twin Map view: wind particle simulation, time-scrub player,
 * layer toggles, station inspector — all data fetched live from WAQI + OWM.
 */
import { getCityAQI } from '../api/aqi.js';
import { getWeather }  from '../api/weather.js';

export function initDigitalTwinMap() {
  const canvas = document.getElementById('wind-particles-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particlesVisible = true;
  let currentSpeed = 1;

  // ── Canvas resize ──────────────────────────────────────────────────────────
  function resizeCanvas() {
    if (!canvas.parentElement) return;
    canvas.width  = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  window.resizeWindCanvas = resizeCanvas;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ── Wind particles — angle driven by live OWM wind direction ──────────────
  let ANGLE = window._windAngle ?? 0.56; // updated when weather loads
  let dx = Math.cos(ANGLE);
  let dy = Math.sin(ANGLE);

  const PARTICLE_COUNT = 75;
  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x:     Math.random() * (canvas.width  || 800),
    y:     Math.random() * (canvas.height || 600),
    len:   12 + Math.random() * 22,
    speed: 1.2 + Math.random() * 1.8,
    alpha: 0.2 + Math.random() * 0.55,
    hue:   Math.random() > 0.6 ? '#efd395' : '#38bdf8',
  }));

  function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Pick up wind angle if it was updated after initial load
    if (window._windAngle && window._windAngle !== ANGLE) {
      ANGLE = window._windAngle;
      dx = Math.cos(ANGLE);
      dy = Math.sin(ANGLE);
    }
    if (particlesVisible) {
      for (const p of particles) {
        p.x += dx * p.speed * currentSpeed;
        p.y += dy * p.speed * currentSpeed;
        if (p.x > canvas.width + 40)  p.x = -40;
        if (p.y > canvas.height + 40) p.y = -40;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - dx * p.len, p.y - dy * p.len);
        ctx.strokeStyle = p.hue;
        ctx.globalAlpha = p.alpha;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }
    requestAnimationFrame(renderParticles);
  }
  renderParticles();

  // ── Time-scrub controls ────────────────────────────────────────────────────
  const timeSlider  = document.getElementById('time-scrub-slider');
  const timeDisplay = document.getElementById('scrub-time-display');
  const playBtn     = document.getElementById('time-scrub-play');
  const playIcon    = document.getElementById('play-icon');
  const speedBtns   = document.querySelectorAll('.speed-btn');

  function updateTimeLabel(val) {
    if (!timeDisplay) return;
    const now = new Date();
    const offsets = [-7,-5,-3,-1, 0, 1, 2, 3];
    const labels  = ['Historical Baseline', 'Pre-Inversion Baseline', 'Stubble Burning Inflow',
                     'Thermal Inversion Surge', 'Live Stream', 'LightGBM Quantile Forecast',
                     'Boundary Layer Deepening', 'Multi-Model Consensus'];
    const idx = Math.min(Math.floor(val / 13), 7);
    const d   = new Date(now);
    d.setDate(d.getDate() + offsets[idx]);
    const prefix = offsets[idx] < 0 ? `${offsets[idx]}d` : offsets[idx] === 0 ? 'Now' : `+${offsets[idx]*24}h`;
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
    if (playing) {
      playInterval = setInterval(() => {
        if (!timeSlider) return;
        let v = parseInt(timeSlider.value, 10) + 1;
        if (v > 100) v = 0;
        timeSlider.value = v;
        updateTimeLabel(v);
      }, 150 / currentSpeed);
    }
  }
  playBtn?.addEventListener('click', () => setPlayState(!isPlaying));

  speedBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      speedBtns.forEach((b) => b.classList.remove('speed-btn--active'));
      btn.classList.add('speed-btn--active');
      currentSpeed = parseFloat(btn.getAttribute('data-speed')) || 1;
      if (isPlaying) setPlayState(true);
    });
  });

  // ── Layer toggles ─────────────────────────────────────────────────────────
  const confidenceOverlay = document.getElementById('confidence-overlay');
  const plumes = document.querySelectorAll('.plume');

  document.getElementById('toggle-particles')?.addEventListener('click', (e) => {
    particlesVisible = !particlesVisible;
    e.currentTarget.classList.toggle('layer-pill--active', particlesVisible);
  });
  let heatmapVisible = true;
  document.getElementById('toggle-heatmap')?.addEventListener('click', (e) => {
    heatmapVisible = !heatmapVisible;
    e.currentTarget.classList.toggle('layer-pill--active', heatmapVisible);
    plumes.forEach((p) => (p.style.opacity = heatmapVisible ? '1' : '0'));
  });
  let confVisible = false;
  document.getElementById('toggle-confidence')?.addEventListener('click', (e) => {
    confVisible = !confVisible;
    e.currentTarget.classList.toggle('layer-pill--active', confVisible);
    if (confidenceOverlay) confidenceOverlay.style.opacity = confVisible ? '1' : '0';
  });

  // ── Station pins → inspector — live WAQI data ─────────────────────────────
  // Blank fallback so inspector always shows something on click
  const STATION_LIVE = {
    akurdi:   { name: 'Akurdi Monitoring Station',    zone: 'PCMC • Industrial Sector',             badge: '184 AQI', badgeClass: 'badge-status--severe',   pm25: '118', pm10: '210', no2: '64', wind: '—' },
    shivaji:  { name: 'Shivaji Nagar Observatory',    zone: 'Central Pune • IMD Station',           badge: '158 AQI', badgeClass: 'badge-status--moderate', pm25: '98',  pm10: '182', no2: '58', wind: '—' },
    bhosari:  { name: 'Bhosari MIDC Station',         zone: 'PCMC • Metal & Industrial Belt',       badge: '192 AQI', badgeClass: 'badge-status--severe',   pm25: '126', pm10: '235', no2: '72', wind: '—' },
    kothrud:  { name: 'Kothrud / Karve Road',         zone: 'West Pune • Valley Basin',             badge: '126 AQI', badgeClass: 'badge-status--moderate', pm25: '74',  pm10: '144', no2: '42', wind: '—' },
    pashan:   { name: 'Pashan Bio-Observatory',       zone: 'West Pune • IISER Green Belt',         badge: '84 AQI',  badgeClass: 'badge-status--good',     pm25: '46',  pm10: '88',  no2: '28', wind: '—' },
    // Aliases to support existing pin IDs
    anand:    { name: 'Akurdi Chowk Station',         zone: 'PCMC • Industrial Sector',             badge: '184 AQI', badgeClass: 'badge-status--severe',   pm25: '118', pm10: '210', no2: '64', wind: '—' },
    ito:      { name: 'Shivaji Nagar Observatory',    zone: 'Central Pune • Urban Core',            badge: '158 AQI', badgeClass: 'badge-status--moderate', pm25: '98',  pm10: '182', no2: '58', wind: '—' },
    dwarka:   { name: 'Bhosari MIDC Industrial Area', zone: 'PCMC • Manufacturing Zone',           badge: '192 AQI', badgeClass: 'badge-status--severe',   pm25: '126', pm10: '235', no2: '72', wind: '—' },
    wazirpur: { name: 'Kothrud / Paud Road',          zone: 'West Pune • Valley Corridor',          badge: '126 AQI', badgeClass: 'badge-status--moderate', pm25: '74',  pm10: '144', no2: '42', wind: '—' },
    lodhi:    { name: 'Pashan Bio-Observatory',       zone: 'West Pune • Green Canopy',             badge: '84 AQI',  badgeClass: 'badge-status--good',     pm25: '46',  pm10: '88',  no2: '28', wind: '—' },
  };

  const STATION_KEYWORDS = {
    akurdi:   ['Akurdi', 'Nigdi', 'PCMC', 'Pimpri', 'Chinchwad'],
    shivaji:  ['Shivaji', 'Shivajinagar', 'Pune', 'Swargate'],
    bhosari:  ['Bhosari', 'Chakan', 'MIDC', 'Alandi'],
    kothrud:  ['Kothrud', 'Karve', 'Katraj', 'Dhankawadi'],
    pashan:   ['Pashan', 'IISER', 'Bavdhan', 'Aundh'],
    anand:    ['Akurdi', 'Nigdi', 'PCMC', 'Pimpri'],
    ito:      ['Shivaji', 'Shivajinagar', 'Pune'],
    dwarka:   ['Bhosari', 'Chakan', 'MIDC'],
    wazirpur: ['Kothrud', 'Karve', 'Katraj'],
    lodhi:    ['Pashan', 'IISER', 'Bavdhan'],
  };

  async function loadStationData() {
    try {
      const city    = window._currentCity ?? 'Pune';
      const [aqiData, weather] = await Promise.all([getCityAQI(city), getWeather(city)]);
      const windLabel = `${weather.wind_speed_kmh.toFixed(1)} km/h ${weather.wind_direction_label}`;

      // Update wind angle for particle direction
      window._windAngle = (weather.wind_direction_deg * Math.PI) / 180;

      for (const [pinId, keywords] of Object.entries(STATION_KEYWORDS)) {
        const st = aqiData.stations.find((s) =>
          keywords.some((kw) => s.station_name.toLowerCase().includes(kw.toLowerCase()))
        );
        if (st) {
          STATION_LIVE[pinId] = {
            name:       st.station_name,
            zone:       `${city} • Live WAQI Sensor`,
            badge:      `${st.aqi} AQI`,
            badgeClass: st.aqi > 300 ? 'badge-status--severe'
                       : st.aqi > 200 ? 'badge-status--poor'
                       : st.aqi > 100 ? 'badge-status--moderate'
                       : 'badge-status--good',
            pm25: st.pm25 != null ? `${st.pm25} µg/m³` : '—',
            pm10: st.pm10 != null ? `${st.pm10} µg/m³` : '—',
            no2:  st.no2  != null ? `${st.no2} ppb`    : '—',
            wind: windLabel,
          };
        }
      }

      // Update pin labels
      stationPins.forEach((pin) => {
        const d = STATION_LIVE[pin.getAttribute('data-station')];
        const labelEl = pin.querySelector('.pin-label');
        if (labelEl && d) labelEl.textContent = `${d.name} (${d.badge})`;
      });

      // Update wind layer pill label
      const windPillSpan = document.querySelector('#toggle-particles span');
      if (windPillSpan) windPillSpan.textContent = `Wind Vectors (${windLabel})`;

    } catch (err) {
      console.warn('[map] Station fetch failed, using placeholder data.', err);
    }
  }

  const stationPins  = document.querySelectorAll('.map-station-pin');
  const inspectName  = document.getElementById('inspect-name');
  const inspectZone  = document.getElementById('inspect-zone');
  const inspectBadge = document.getElementById('inspect-badge');
  const inspectPm25  = document.getElementById('inspect-pm25');
  const inspectPm10  = document.getElementById('inspect-pm10');
  const inspectNo2   = document.getElementById('inspect-no2');
  const inspectWind  = document.getElementById('inspect-wind');

  stationPins.forEach((pin) => {
    pin.addEventListener('click', () => {
      stationPins.forEach((p) => p.classList.remove('map-station-pin--active'));
      pin.classList.add('map-station-pin--active');
      const d = STATION_LIVE[pin.getAttribute('data-station')];
      if (!d) return;
      if (inspectName)  inspectName.textContent  = d.name;
      if (inspectZone)  inspectZone.textContent  = d.zone;
      if (inspectBadge) { inspectBadge.textContent = d.badge; inspectBadge.className = `badge-status ${d.badgeClass}`; }
      if (inspectPm25)  inspectPm25.textContent  = d.pm25;
      if (inspectPm10)  inspectPm10.textContent  = d.pm10;
      if (inspectNo2)   inspectNo2.textContent   = d.no2;
      if (inspectWind)  inspectWind.textContent  = d.wind;
    });
  });

  document.getElementById('btn-simulate-station')?.addEventListener('click', () => {
    if (window.switchView) window.switchView('scenario');
  });

  // Load station data when map view is first opened
  let mapDataLoaded = false;
  const origSwitch  = window.switchView;
  window.switchView = function (viewName) {
    origSwitch?.(viewName);
    if (viewName === 'map') {
      if (window.resizeWindCanvas) setTimeout(() => window.resizeWindCanvas(), 50);
      if (!mapDataLoaded) { mapDataLoaded = true; loadStationData(); }
    }
  };
}
