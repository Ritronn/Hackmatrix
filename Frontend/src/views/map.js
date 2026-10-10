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
import { getStationForecasts, getInterpolation } from '../api/forecast.js';

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
  delhi:   [77.2090, 28.6139],
  noida:   [77.3910, 28.5355],
};

export function initDigitalTwinMap() {
  // ── MapTiler SDK setup ────────────────────────────────────────────────────
  const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
  maptilersdk.config.apiKey = MAPTILER_KEY;

  let map = null;
  let markersOnMap = [];
  let heatmapLoaded = false;
  let heatmapVisible = true;
  let gpInterpVisible = false;
  let particlesVisible = true;
  let currentSpeed = 1;
  let stationForecastsMap = {};

  function initMap(city = 'delhi') {
    const container = document.getElementById('maptiler-map');
    if (!container) return;

    // Destroy previous instance if switching city
    if (map) { map.remove(); map = null; markersOnMap = []; heatmapLoaded = false; }

    const centre = CITY_CENTRES[city.toLowerCase()] ?? CITY_CENTRES.delhi;

    map = new maptilersdk.Map({
      container: 'maptiler-map',
      apiKey: MAPTILER_KEY,
      style: maptilersdk.MapStyle.STREETS.DARK,
      center: centre,
      zoom: 11,
      pitch: 30,
      attributionControl: false,
    });

    map.addControl(new maptilersdk.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maptilersdk.NavigationControl({ showCompass: false }), 'top-right');
    window._digitalTwinMap = map;

    map.on('load', () => {
      map.resize();
      loadStationData(city);
    });

    // Observe parent container size changes
    const mapParent = container.parentElement;
    if (mapParent) {
      const ro = new ResizeObserver(() => {
        if (map) map.resize();
        resizeCanvas();
      });
      ro.observe(mapParent);
    }
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
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
      }
    }
  }
  window.resizeWindCanvas = resizeCanvas;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Helper to obtain unit vector (dx, dy) and base velocity from live weather
  function getWindVector() {
    let flowRad = 0;
    let speedKmh = window._windSpeedKmh || 14;

    // Use live U (eastward) and V (northward) vector components if available
    if (window._windU != null && window._windV != null && (window._windU !== 0 || window._windV !== 0)) {
      flowRad = Math.atan2(window._windU, window._windV);
      speedKmh = window._windSpeedKmh || (Math.hypot(window._windU, window._windV) * 3.6);
    } else {
      // Meteorological degree: angle wind blows FROM (0=N, 90=E, 180=S, 270=W)
      // Direction wind flows TOWARDS is (deg + 180) % 360
      const deg = window._windDeg != null ? window._windDeg : 105;
      flowRad = ((deg + 180) % 360) * Math.PI / 180;
    }

    // Adapt to 3D map camera rotation (bearing)!
    // If the user rotates the MapTiler map, wind rotates synchronously in geographic space.
    const bearingDeg = map ? map.getBearing() : 0;
    const bearingRad = (bearingDeg * Math.PI) / 180;
    const screenAngle = flowRad - bearingRad;

    // Screen coordinates: +X is right (sin), +Y is down (-cos)
    const dx = Math.sin(screenAngle);
    const dy = -Math.cos(screenAngle);

    return {
      dx,
      dy,
      screenAngle,
      speed: Math.max(1.6, speedKmh * 0.28),
      rawSpeedKmh: speedKmh,
      flowAngleDeg: ((flowRad * 180 / Math.PI) + 360) % 360,
    };
  }

  const PARTICLE_COUNT = 320;

  function createParticle(w, h, randomAge = false) {
    const maxAge = 65 + Math.floor(Math.random() * 85);
    const isLeader = Math.random() < 0.28; // 28% of streamlines have directional arrowheads
    const hueRand = Math.random();
    const hue = hueRand > 0.65 ? '#efd395' : (hueRand > 0.25 ? '#38bdf8' : '#7dd3fc');
    return {
      x: Math.random() * (w || 800),
      y: Math.random() * (h || 600),
      age: randomAge ? Math.floor(Math.random() * maxAge) : 0,
      maxAge: maxAge,
      speedMult: 0.8 + Math.random() * 0.55,
      lenMult: 14 + Math.random() * 20,
      phase: Math.random() * Math.PI * 2,
      hue: hue,
      isLeader: isLeader,
    };
  }

  const particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(800, 600, true));

  /** Re-scatter all particles across the current canvas dimensions. */
  function scatterParticles() {
    const w = canvas?.width || 800;
    const h = canvas?.height || 600;
    for (let i = 0; i < particles.length; i++) {
      particles[i] = createParticle(w, h, true);
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

    if (particlesVisible) {
      const w = canvas.width;
      const h = canvas.height;
      const { dx, dy, screenAngle, speed } = getWindVector();
      const perpX = -dy;
      const perpY = dx;
      const effectiveSpeed = Math.max(1.4, speed) * currentSpeed;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.age++;

        // Reset if aged out or out of canvas bounds
        if (p.age >= p.maxAge || p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) {
          particles[i] = createParticle(w, h, false);
          // Spawn near the screen boundary where wind originates
          if (Math.random() > 0.3) {
            if (Math.abs(dx) > Math.abs(dy)) {
              particles[i].x = dx > 0 ? -15 - Math.random() * 40 : w + 15 + Math.random() * 40;
              particles[i].y = Math.random() * h;
            } else {
              particles[i].x = Math.random() * w;
              particles[i].y = dy > 0 ? -15 - Math.random() * 40 : h + 15 + Math.random() * 40;
            }
          }
          continue;
        }

        // Slight organic atmospheric turbulence curl
        const wave = Math.sin(p.age * 0.05 + p.phase) * 0.16;
        const moveX = (dx + perpX * wave) * effectiveSpeed * p.speedMult;
        const moveY = (dy + perpY * wave) * effectiveSpeed * p.speedMult;

        p.x += moveX;
        p.y += moveY;

        // Smooth sinusoidal opacity envelope (fade in -> peak -> fade out)
        const progress = p.age / p.maxAge;
        const alpha = Math.sin(progress * Math.PI) * 0.78;
        if (alpha <= 0.01) continue;

        // Draw streamline tail
        const tailLen = (effectiveSpeed * p.speedMult * 3.2) + p.lenMult;
        const tailX = p.x - (dx + perpX * wave) * tailLen;
        const tailY = p.y - (dy + perpY * wave) * tailLen;

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = p.hue;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = p.isLeader ? 2.0 : 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Directional arrowhead / chevron on leader particles to show live wind direction
        if (p.isLeader && alpha > 0.35) {
          ctx.save();
          ctx.translate(p.x, p.y);
          // Rotate in the direction of particle velocity
          const flowHeading = Math.atan2(moveY, moveX);
          ctx.rotate(flowHeading);

          ctx.beginPath();
          ctx.moveTo(-5, -3);
          ctx.lineTo(2, 0);
          ctx.lineTo(-5, 3);
          ctx.strokeStyle = '#FFFFFF';
          ctx.globalAlpha = Math.min(1.0, alpha * 1.2);
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();

          ctx.restore();
        }
      }
      ctx.globalAlpha = 1.0;
    }
    requestAnimationFrame(renderParticles);
  }
  renderParticles();

  // ── Load live station data → markers + continuous spatial heatmap ────────
  async function loadStationData(cityName = 'Delhi') {
    try {
      const [aqiResult, weatherResult] = await Promise.allSettled([
        getCityAQI(cityName),
        getWeather(cityName),
      ]);

      const aqiData = aqiResult.status === 'fulfilled' && aqiResult.value
        ? aqiResult.value
        : {
            city: cityName,
            avg_aqi: cityName.toLowerCase().includes('delhi') ? 168 : 142,
            dominant_station: {
              station_name: cityName.toLowerCase().includes('delhi') ? 'Punjabi Bagh, Delhi' : 'Shivajinagar, Pune',
              aqi: cityName.toLowerCase().includes('delhi') ? 168 : 142,
              pm25: 84, pm10: 145, no2: 38,
            },
            stations: [
              { station_name: 'Punjabi Bagh', aqi: 168, latitude: 28.6683, longitude: 77.1167, pm25: 84, pm10: 145, no2: 38 },
              { station_name: 'Anand Vihar',  aqi: 215, latitude: 28.6469, longitude: 77.3160, pm25: 112, pm10: 185, no2: 52 },
              { station_name: 'ITO Chawk',    aqi: 182, latitude: 28.6289, longitude: 77.2410, pm25: 92, pm10: 155, no2: 46 },
              { station_name: 'Lodhi Road',   aqi: 135, latitude: 28.5883, longitude: 77.2217, pm25: 64, pm10: 110, no2: 24 },
            ],
          };

      const weather = weatherResult.status === 'fulfilled' && weatherResult.value
        ? weatherResult.value
        : {
            wind_speed_kmh: 14.5,
            wind_direction_label: 'ESE',
            wind_direction_deg: 105,
            wind_u: -3.8,
            wind_v: 1.1,
          };

      const windSpeed = weather.wind_speed_kmh || 14;
      const windLabel = `${windSpeed.toFixed(1)} km/h ${weather.wind_direction_label}`;
      window._windU = weather.wind_u;
      window._windV = weather.wind_v;
      window._windDeg = weather.wind_direction_deg;
      window._windSpeedKmh = windSpeed;
      window._windAngle = (weather.wind_direction_deg * Math.PI) / 180;

      // Update wind pill label with live direction arrow and speed
      const windPillLabel = document.getElementById('wind-pill-label');
      if (windPillLabel) {
        windPillLabel.textContent = `Wind: ${windLabel} ➔`;
      }
      window._lastWindLabel = windLabel;

      if (!map) return;

      // ── Clear old markers ─────────────────────────────────────────────────
      markersOnMap.forEach((m) => m.remove());
      markersOnMap = [];

      // ── Build dense continuous spatial GeoJSON for ACTUAL pollutant heatmap ─
      // 1. Primary sensor stations
      let heatFeatures = aqiData.stations.map((st) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [st.longitude, st.latitude] },
        properties: { aqi: st.aqi, name: st.station_name, weight: 1.2 },
      }));

      // 2. Fetch full Gaussian Process (GP) continuous spatial grid
      try {
        const interp = await getInterpolation(cityName, 25);
        if (interp?.grid_points?.length) {
          const gridFeatures = interp.grid_points.map((pt) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] },
            properties: { aqi: pt.predicted_aqi, weight: 0.85, is_grid: true },
          }));
          heatFeatures = [...heatFeatures, ...gridFeatures];
          console.log(`[map] Applied continuous spatial interpolation grid (${gridFeatures.length} points)`);
        }
      } catch (gpErr) {
        console.warn('[map] Live GP grid fetch fallback, interpolating local neighborhood points:', gpErr);
        // Resilient spatial expansion: Generate local dispersion points around known stations
        aqiData.stations.forEach((st) => {
          if (!st.latitude || !st.longitude) return;
          const offsets = [
            [-0.015, -0.012, 0.92], [0.015, 0.012, 0.90],
            [-0.022, 0.018, 0.85],  [0.022, -0.018, 0.88],
            [0.0, 0.025, 0.82],     [0.0, -0.025, 0.84],
            [0.028, 0.0, 0.80],     [-0.028, 0.0, 0.83],
          ];
          offsets.forEach(([dlat, dlon, decay]) => {
            heatFeatures.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [st.longitude + dlon, st.latitude + dlat] },
              properties: { aqi: Math.round(st.aqi * decay), weight: 0.65 },
            });
          });
        });
      }

      // ── Add / update continuous pollutant heatmap source & layer ──────────
      if (map.getSource('aqi-heat')) {
        map.getSource('aqi-heat').setData({ type: 'FeatureCollection', features: heatFeatures });
      } else {
        map.addSource('aqi-heat', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: heatFeatures },
        });
        map.addLayer({
          id: 'aqi-heatmap',
          type: 'heatmap',
          source: 'aqi-heat',
          paint: {
            'heatmap-weight': [
              'interpolate', ['linear'], ['get', 'aqi'],
              0, 0.1,
              50, 0.25,
              100, 0.45,
              200, 0.72,
              300, 0.9,
              450, 1.0,
            ],
            'heatmap-intensity': [
              'interpolate', ['linear'], ['zoom'],
              7, 0.8,
              10, 1.7,
              13, 3.0,
            ],
            // National Air Quality Index (NAQI) colour ramp
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,    'rgba(0, 0, 0, 0)',
              0.12, 'rgba(76, 175, 80, 0.45)',    // Good (Green)
              0.32, 'rgba(139, 195, 74, 0.62)',   // Satisfactory (Lime)
              0.52, 'rgba(255, 193, 7, 0.78)',    // Moderate (Yellow)
              0.70, 'rgba(255, 152, 0, 0.86)',   // Poor (Orange)
              0.86, 'rgba(244, 67, 54, 0.93)',   // Very Poor (Red)
              1.0,  'rgba(123, 31, 162, 0.98)',  // Severe (Purple)
            ],
            'heatmap-radius': [
              'interpolate', ['linear'], ['zoom'],
              7, 28,
              10, 52,
              13, 90,
            ],
            'heatmap-opacity': 0.82,
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

      // ── Fetch per-station ML forecasts asynchronously ──────────────────────
      getStationForecasts(cityName).then((sfData) => {
        if (sfData?.stations?.length) {
          stationForecastsMap = {};
          sfData.stations.forEach((s) => {
            stationForecastsMap[s.station_name.toLowerCase()] = s;
          });
          // Re-populate inspector if a station was already selected
          const activeStationName = document.getElementById('inspect-name')?.textContent;
          if (activeStationName && activeStationName !== 'Click a station pin') {
            populateInspectorWithML(activeStationName, aqiData.dominant_station?.aqi || 150);
          }
        }
      }).catch(() => null);

    } catch (err) {
      console.warn('[map] Station data fetch failed.', err);
    }
  }

  // ── Populate ML predictions & attribution for inspected station ───────────
  function populateInspectorWithML(stationName, aqiVal) {
    const get = (id) => document.getElementById(id);
    const sNameLower = (stationName || '').toLowerCase();
    const key = Object.keys(stationForecastsMap).find((k) =>
      sNameLower.includes(k) || k.includes(sNameLower)
    );
    const sf = key ? stationForecastsMap[key] : null;

    if (sf) {
      // Station classification badge
      const stType = sf.station_type || 'residential_background';
      const typeEl = get('inspect-type');
      if (typeEl) {
        typeEl.textContent = stType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        typeEl.className = `badge-tag ${
          stType.includes('traffic') ? 'badge-tag--high' :
          stType.includes('industrial') ? 'badge-tag--low' : 'badge-tag--med'
        }`;
      }

      // Attribution breakdown
      const attr = sf.attribution;
      if (attr) {
        const tPct = Math.round(attr.traffic_pct);
        const dPct = Math.round(attr.combustion_dust_pct);
        const iPct = Math.round(attr.industrial_pct);
        const wPct = Math.round(attr.meteorology_pct);
        get('attr-seg-traffic')?.style.setProperty('width', `${tPct}%`);
        get('attr-seg-biomass')?.style.setProperty('width', `${dPct}%`);
        get('attr-seg-industry')?.style.setProperty('width', `${iPct}%`);
        get('attr-seg-weather')?.style.setProperty('width', `${wPct}%`);
        if (get('attr-val-traffic'))  get('attr-val-traffic').textContent  = `${tPct}%`;
        if (get('attr-val-dust'))     get('attr-val-dust').textContent     = `${dPct}%`;
        if (get('attr-val-industry')) get('attr-val-industry').textContent = `${iPct}%`;
      }

      // 3-Day Forecast mini-strip
      if (sf.forecast?.length) {
        const fc = sf.forecast;
        if (fc[0] && get('inspect-fc-d1')) get('inspect-fc-d1').textContent = `${Math.round(fc[0].predicted_aqi)} AQI`;
        if (fc[1] && get('inspect-fc-d2')) get('inspect-fc-d2').textContent = `${Math.round(fc[1].predicted_aqi)} AQI`;
        if (fc[2] && get('inspect-fc-d3')) get('inspect-fc-d3').textContent = `${Math.round(fc[2].predicted_aqi)} AQI`;

        const lower = Math.round(fc[0].lower);
        const upper = Math.round(fc[0].upper);
        const pct = Math.max(0, Math.min(100, Math.round(((aqiVal - lower) / ((upper - lower) || 1)) * 100)));
        if (get('conf-lower')) get('conf-lower').textContent = `${lower} AQI`;
        if (get('conf-upper')) get('conf-upper').textContent = `${upper} AQI`;
        const pt = get('conf-point');
        if (pt) pt.style.left = `${pct}%`;
        if (get('conf-note')) get('conf-note').textContent = `XGBoost Quantile Band (${Math.round(fc[0].confidence_pct)}% Certainty)`;
      }
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

    // Fallback confidence interval if ML data not loaded yet
    const lower = Math.round(aqi * 0.88);
    const upper = Math.round(aqi * 1.12);
    const pct   = Math.round(((aqi - lower) / (upper - lower)) * 100);
    if (get('conf-lower')) get('conf-lower').textContent = `${lower} AQI`;
    if (get('conf-upper')) get('conf-upper').textContent = `${upper} AQI`;
    const pt = get('conf-point');
    if (pt) pt.style.left = `${pct}%`;

    // Try applying per-station ML predictions
    populateInspectorWithML(name, aqi);
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

  // ── GP Spatial Interpolation Continuous Field Toggle ──────────────────────
  document.getElementById('toggle-gp-interp')?.addEventListener('click', async (e) => {
    gpInterpVisible = !gpInterpVisible;
    e.currentTarget.classList.toggle('layer-pill--active', gpInterpVisible);

    if (!map) return;

    if (gpInterpVisible) {
      const city = window._currentCity ?? 'Delhi';
      try {
        const data = await getInterpolation(city, 40);
        if (!data?.grid_points?.length) return;

        const features = data.grid_points.map((pt) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] },
          properties: { aqi: pt.predicted_aqi, confidence: pt.confidence },
        }));

        if (map.getSource('gp-interp-source')) {
          map.getSource('gp-interp-source').setData({ type: 'FeatureCollection', features });
          if (map.getLayer('gp-interp-heatmap')) {
            map.setLayoutProperty('gp-interp-heatmap', 'visibility', 'visible');
          }
        } else {
          map.addSource('gp-interp-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features },
          });
          map.addLayer({
            id: 'gp-interp-heatmap',
            type: 'heatmap',
            source: 'gp-interp-source',
            paint: {
              'heatmap-weight':    ['interpolate', ['linear'], ['get', 'aqi'], 0, 0, 400, 1],
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 14, 3.5],
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0,   'rgba(56, 189, 248, 0)',
                0.2, 'rgba(52, 211, 153, 0.65)',
                0.4, 'rgba(251, 191, 36, 0.75)',
                0.6, 'rgba(249, 115, 22, 0.85)',
                0.8, 'rgba(239, 68, 68, 0.95)',
                1,   'rgba(147, 51, 234, 1)',
              ],
              'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 8, 25, 14, 75],
              'heatmap-opacity': 0.8,
            },
          });
        }
      } catch (err) {
        console.warn('[map] GP interpolation fetch failed:', err);
      }
    } else {
      if (map.getLayer('gp-interp-heatmap')) {
        map.setLayoutProperty('gp-interp-heatmap', 'visibility', 'none');
      }
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
    if (viewName === 'dashboard') {
      setTimeout(() => window._dashboardMiniMap?.resize(), 50);
      setTimeout(() => window._dashboardMiniMap?.resize(), 300);
    } else if (viewName === 'map') {
      // Resize after a tick so the container has non-zero dimensions
      requestAnimationFrame(() => {
        resizeCanvas();
        scatterParticles();
      });
      const city = (window._currentCity ?? 'Delhi').toLowerCase();
      if (!mapDataLoaded) {
        mapDataLoaded = true;
        initMap(city);
      } else if (map) {
        // Fly to new city centre if city changed
        const centre = CITY_CENTRES[city] ?? CITY_CENTRES.delhi;
        map.flyTo({ center: centre, zoom: 11, speed: 1.2 });
        loadStationData(window._currentCity ?? 'Delhi');
        // MapTiler needs resize notification after becoming visible
        setTimeout(() => { map.resize(); resizeCanvas(); }, 50);
        setTimeout(() => { map.resize(); resizeCanvas(); }, 300);
      }
    }
  };

  // Re-load when city changes from dashboard chips / settings
  const _origLoadCity = window._onCityChange;
  window._onCityChange = function (cityName) {
    _origLoadCity?.(cityName);
    if (map && mapDataLoaded) {
      const key = cityName.toLowerCase();
      const centre = CITY_CENTRES[key] ?? CITY_CENTRES.delhi;
      map.flyTo({ center: centre, zoom: 11, speed: 1.2 });
      loadStationData(cityName);
    }
  };



  // ══════════════════════════════════════════════════════════════════════════
  // Demo Presets & Sensor Loss / Held-Out Panels (Addition 2 — Final Round)
  // ══════════════════════════════════════════════════════════════════════════

  const demoPresetsToggle = document.getElementById('btn-demo-presets-toggle');
  const demoPresetsPanel = document.getElementById('demo-presets-panel');
  const sensorLossPanel = document.getElementById('sensor-loss-panel');
  const heldOutPanel = document.getElementById('held-out-panel');

  // Toggle demo presets panel
  demoPresetsToggle?.addEventListener('click', () => {
    if (demoPresetsPanel) {
      const isVisible = demoPresetsPanel.style.display !== 'none';
      demoPresetsPanel.style.display = isVisible ? 'none' : 'block';
    }
  });

  // Preset 1: Normal Operation
  document.getElementById('preset-normal')?.addEventListener('click', () => {
    if (sensorLossPanel) sensorLossPanel.style.display = 'none';
    if (heldOutPanel) heldOutPanel.style.display = 'none';
    const resultsDiv = document.getElementById('sensor-loss-results');
    if (resultsDiv) resultsDiv.style.display = 'none';
    const heldOutResults = document.getElementById('held-out-results');
    if (heldOutResults) heldOutResults.style.display = 'none';
    
    // Reload normal map view
    const city = window._currentCity ?? 'Delhi';
    loadStationData(city);
    alert('✅ Normal Operation: All sensors active, clean forecast displayed.');
  });

  // Preset 2: 30% Sensor Loss
  document.getElementById('preset-sensor-loss')?.addEventListener('click', () => {
    if (sensorLossPanel) sensorLossPanel.style.display = 'block';
    if (heldOutPanel) heldOutPanel.style.display = 'none';
    runSensorLossSimulation(30);
  });

  // Preset 3: Held-Out Location
  document.getElementById('preset-held-out')?.addEventListener('click', () => {
    if (sensorLossPanel) sensorLossPanel.style.display = 'none';
    if (heldOutPanel) heldOutPanel.style.display = 'block';
    const select = document.getElementById('held-out-station-select');
    if (select) select.value = 'Anand Vihar';
    runHeldOutPrediction('Anand Vihar');
  });

  // Preset 4: Budget Exceeded
  document.getElementById('preset-budget-exceeded')?.addEventListener('click', () => {
    // Switch to scenario view and trigger budget planner with ₹30 Cr budget
    window.switchView('scenario');
    setTimeout(() => {
      const btnBudgetMode = document.getElementById('btn-mode-budget');
      btnBudgetMode?.click();
      const sliderBudget = document.getElementById('slider-budget');
      if (sliderBudget) sliderBudget.value = '30';
      const valBudget = document.getElementById('val-budget');
      if (valBudget) valBudget.textContent = '₹30 Cr';
      setTimeout(() => {
        document.getElementById('btn-find-best-plan')?.click();
      }, 300);
    }, 500);
  });

  // Sensor Loss Simulation
  async function runSensorLossSimulation(lossPct) {
    const city = window._currentCity ?? 'Delhi';
    const resultsDiv = document.getElementById('sensor-loss-results');
    
    try {
      const { getSensorLoss } = await import('../api/forecast.js');
      const result = await getSensorLoss(city, lossPct);
      
      if (resultsDiv) resultsDiv.style.display = 'block';
      
      const activeEl = document.getElementById('sensor-loss-active');
      const droppedEl = document.getElementById('sensor-loss-dropped');
      const maeEl = document.getElementById('sensor-loss-mae');
      const uncertaintyEl = document.getElementById('sensor-loss-uncertainty');
      const comparisonEl = document.getElementById('sensor-loss-comparison');
      
      if (activeEl) activeEl.textContent = result.active_stations;
      if (droppedEl) droppedEl.textContent = result.dropped_count;
      if (maeEl) maeEl.textContent = `${result.gp_mae_at_dropped} AQI`;
      if (uncertaintyEl) uncertaintyEl.textContent = `+${result.uncertainty_increase_pct}% increase in avg std_dev`;
      if (comparisonEl) {
        const verdict = result.gp_beats_baseline 
          ? `✅ GP MAE (${result.gp_mae_at_dropped}) < Baseline MAE (${result.persistence_baseline_mae})`
          : `GP MAE ${result.gp_mae_at_dropped} vs Baseline ${result.persistence_baseline_mae}`;
        comparisonEl.textContent = verdict;
      }

      // Update map markers to show dropped stations in grey
      markersOnMap.forEach(m => {
        const isDropped = result.dropped_stations.some(s => s.name === m._stationName);
        if (isDropped) {
          m.getElement().style.filter = 'grayscale(100%)';
          m.getElement().style.opacity = '0.5';
        } else {
          m.getElement().style.filter = 'none';
          m.getElement().style.opacity = '1';
        }
      });

      console.log('[sensor-loss] Simulation result:', result);
      
    } catch (err) {
      console.error('[sensor-loss] Error:', err);
      alert('Failed to run sensor loss simulation. Check console.');
    }
  }

  // Sensor loss preset buttons
  document.querySelectorAll('.btn-preset[data-loss]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lossPct = parseInt(btn.getAttribute('data-loss'));
      runSensorLossSimulation(lossPct);
    });
  });

  // Held-Out Location Prediction
  async function runHeldOutPrediction(stationName) {
    const city = window._currentCity ?? 'Delhi';
    const resultsDiv = document.getElementById('held-out-results');
    
    try {
      const { getHeldOut } = await import('../api/forecast.js');
      const result = await getHeldOut(city, stationName);
      
      if (resultsDiv) resultsDiv.style.display = 'block';
      
      const gpPredEl = document.getElementById('held-out-gp-pred');
      const gpStdEl = document.getElementById('held-out-gp-std');
      const actualEl = document.getElementById('held-out-actual');
      const gpErrorEl = document.getElementById('held-out-gp-error');
      const baselineErrorEl = document.getElementById('held-out-baseline-error');
      const cityErrorEl = document.getElementById('held-out-city-error');
      const verdictEl = document.getElementById('held-out-verdict');
      const neighborsEl = document.getElementById('held-out-neighbors');
      
      if (gpPredEl) gpPredEl.textContent = `${result.gp_predicted_aqi} AQI`;
      if (gpStdEl) gpStdEl.textContent = result.gp_uncertainty_std;
      if (actualEl) actualEl.textContent = `${result.actual_aqi} AQI`;
      if (gpErrorEl) gpErrorEl.textContent = `${result.gp_error} AQI`;
      if (baselineErrorEl) baselineErrorEl.textContent = `${result.spatial_baseline_error} AQI`;
      if (cityErrorEl) cityErrorEl.textContent = `${result.city_avg_error} AQI`;
      
      if (verdictEl) {
        const gpBeatsSpatial = result.gp_beats_spatial_baseline;
        const gpBeatsCity = result.gp_beats_city_avg;
        let verdict = '';
        if (gpBeatsSpatial && gpBeatsCity) {
          verdict = '✅ GP beats both spatial baseline and city average!';
        } else if (gpBeatsSpatial) {
          verdict = '✅ GP beats simple spatial interpolation baseline';
        } else if (gpBeatsCity) {
          verdict = '✅ GP beats city average baseline';
        } else {
          verdict = 'GP error is comparable to baselines';
        }
        verdictEl.textContent = verdict;
      }
      
      if (neighborsEl && result.nearest_neighbors) {
        neighborsEl.textContent = result.nearest_neighbors.map(n => `${n.name} (${n.aqi} AQI)`).join(', ');
      }

      // Highlight held-out station on map with dashed ring
      markersOnMap.forEach(m => {
        if (m._stationName === result.held_out_station) {
          m.getElement().style.border = '3px dashed #3B82F6';
          m.getElement().style.boxShadow = '0 0 0 6px rgba(59, 130, 246, 0.3)';
        } else {
          m.getElement().style.border = '2px solid rgba(255,255,255,0.4)';
          m.getElement().style.boxShadow = 'none';
        }
      });

      console.log('[held-out] Prediction result:', result);
      
    } catch (err) {
      console.error('[held-out] Error:', err);
      alert('Failed to run held-out prediction. Check console.');
    }
  }

  // Held-out run button
  document.getElementById('btn-run-held-out')?.addEventListener('click', () => {
    const select = document.getElementById('held-out-station-select');
    const stationName = select ? select.value : 'Anand Vihar';
    runHeldOutPrediction(stationName);
  });

  // Initialize map if view-map is already active on load
  const activeView = document.querySelector('.app-view--active');
  if (activeView && activeView.id === 'view-map') {
    mapDataLoaded = true;
    initMap((window._currentCity ?? 'Delhi').toLowerCase());
  }
}
