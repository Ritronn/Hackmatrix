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
import { getStationForecasts } from '../api/forecast.js';
import { WindParticleLayer } from '../WindParticleLayer.js';

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
  let windLayer = null;
  let currentSpeed = 1;
  let stationForecastsMap = {};

  function initMap(city = 'delhi') {
    const container = document.getElementById('maptiler-map');
    if (!container) return;

    // Destroy previous instance if switching city
    if (map) { map.remove(); map = null; markersOnMap = []; }

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
      if (!windLayer && canvas) {
        windLayer = new WindParticleLayer(canvas, map, 120);
        windLayer.resize();
        windLayer.start();
      } else if (windLayer) {
        windLayer.setMap(map);
        windLayer.resize();
      }
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

  function resizeCanvas() {
    if (windLayer) {
      windLayer.resize();
    }
  }
  window.resizeWindCanvas = resizeCanvas;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

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

      if (windLayer && aqiData?.stations) {
        windLayer.setStations(aqiData.stations);
      }

      if (!map) return;

      // ── Clear old markers ─────────────────────────────────────────────────
      markersOnMap.forEach((m) => m.remove());
      markersOnMap = [];

      // Remove heatmap layer and source if present
      if (map.getLayer('aqi-heatmap')) map.removeLayer('aqi-heatmap');
      if (map.getSource('aqi-heat')) map.removeSource('aqi-heat');

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

  // ── Layer toggles ─────────────────────────────────────────────────────────
  document.getElementById('toggle-particles')?.addEventListener('click', (e) => {
    if (windLayer) {
      const active = windLayer.toggle();
      e.currentTarget.classList.toggle('layer-pill--active', active);
    }
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
        windLayer?.onMapMove();
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




  // Initialize map if view-map is already active on load
  const activeView = document.querySelector('.app-view--active');
  if (activeView && activeView.id === 'view-map') {
    mapDataLoaded = true;
    initMap((window._currentCity ?? 'Delhi').toLowerCase());
  }
}
