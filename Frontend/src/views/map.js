/**
 * views/map.js
 * Digital Twin Map view: wind particle simulation, time-scrub player,
 * layer toggles (particles / heatmap / confidence), station inspector.
 */
export function initDigitalTwinMap() {
  const canvas = document.getElementById('wind-particles-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particlesVisible = true;
  let currentSpeed = 1;

  // ── Canvas resize ──
  function resizeCanvas() {
    if (!canvas.parentElement) return;
    canvas.width  = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  window.resizeWindCanvas = resizeCanvas;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ── Wind particles (NW → SE, ~32°) ──
  const PARTICLE_COUNT = 75;
  const ANGLE = 0.56; // radians
  const dx = Math.cos(ANGLE);
  const dy = Math.sin(ANGLE);

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

  // ── Time-scrub controls ──
  const timeSlider  = document.getElementById('time-scrub-slider');
  const timeDisplay = document.getElementById('scrub-time-display');
  const playBtn     = document.getElementById('time-scrub-play');
  const playIcon    = document.getElementById('play-icon');
  const speedBtns   = document.querySelectorAll('.speed-btn');

  const TIME_LABELS = [
    { max: 10,  text: '18 Sept, 08:00 AM (-7d Historical Baseline)' },
    { max: 25,  text: '20 Sept, 12:00 PM (-5d Pre-Inversion Baseline)' },
    { max: 45,  text: '22 Sept, 04:00 PM (-3d Stubble Burning Inflow)' },
    { max: 62,  text: '24 Sept, 09:00 PM (-1d Thermal Inversion Surge)' },
    { max: 74,  text: 'Now • 25 Sept, 05:00 PM (Live Stream)' },
    { max: 84,  text: '+24h • 26 Sept, 05:00 PM (LightGBM Quantile Forecast)' },
    { max: 94,  text: '+48h • 27 Sept, 05:00 PM (Boundary Layer Deepening)' },
    { max: 100, text: '+72h • 28 Sept, 05:00 PM (Multi-Model Consensus)' },
  ];

  function updateTimeLabel(val) {
    const match = TIME_LABELS.find((d) => val <= d.max) ?? TIME_LABELS[TIME_LABELS.length - 1];
    if (timeDisplay) timeDisplay.textContent = match.text;
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
      if (isPlaying) setPlayState(true); // restart interval with new speed
    });
  });

  // ── Layer toggles ──
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

  // ── Station pins → inspector card ──
  const STATION_DATA = {
    ito: {
      name: 'ITO Monitoring Station',
      zone: 'Central Delhi • Zone 4 Sensor',
      badge: '187 AQI', badgeClass: 'badge-status--poor',
      pm25: '118 µg/m³', pm10: '210 µg/m³', no2: '64 ppb', wind: '7.9 km/h NW',
    },
    anand: {
      name: 'Anand Vihar Eco-Station',
      zone: 'East Delhi • Border Transit Hub',
      badge: '218 AQI ⚠️', badgeClass: 'badge-status--severe',
      pm25: '142 µg/m³', pm10: '268 µg/m³', no2: '82 ppb', wind: '6.2 km/h NW',
    },
    dwarka: {
      name: 'Dwarka Sector-8 Station',
      zone: 'South West Delhi • Airport Corridor',
      badge: '165 AQI', badgeClass: 'badge-status--moderate',
      pm25: '98 µg/m³', pm10: '172 µg/m³', no2: '48 ppb', wind: '9.4 km/h WNW',
    },
    wazirpur: {
      name: 'Wazirpur Industrial Area',
      zone: 'North West Delhi • Industrial Cluster',
      badge: '182 AQI', badgeClass: 'badge-status--poor',
      pm25: '114 µg/m³', pm10: '202 µg/m³', no2: '74 ppb', wind: '7.1 km/h NW',
    },
    lodhi: {
      name: 'Lodhi Road Bio-Observatory',
      zone: 'South Delhi • Protected Green Corridor',
      badge: '118 AQI', badgeClass: 'badge-status--good',
      pm25: '65 µg/m³', pm10: '115 µg/m³', no2: '32 ppb', wind: '8.8 km/h NW',
    },
  };

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
      const d = STATION_DATA[pin.getAttribute('data-station')];
      if (!d) return;
      if (inspectName)  inspectName.textContent  = d.name;
      if (inspectZone)  inspectZone.textContent  = d.zone;
      if (inspectBadge) {
        inspectBadge.textContent = d.badge;
        inspectBadge.className   = `badge-status ${d.badgeClass}`;
      }
      if (inspectPm25) inspectPm25.textContent = d.pm25;
      if (inspectPm10) inspectPm10.textContent = d.pm10;
      if (inspectNo2)  inspectNo2.textContent  = d.no2;
      if (inspectWind) inspectWind.textContent = d.wind;
    });
  });

  // Jump to scenario from inspector
  document.getElementById('btn-simulate-station')?.addEventListener('click', () => {
    if (window.switchView) window.switchView('scenario');
  });
}
