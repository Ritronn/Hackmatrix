/**
 * WindParticleLayer.js
 *
 * Grid-based dispersion particle animation overlaid on a MapTiler GL map.
 *
 * Wind vectors are fetched once from /api/wind-field (a 4×4 grid over Delhi)
 * and cached in memory. Each animation frame bilinearly interpolates u/v from the
 * four nearest grid neighbours to move each particle in projected pixel space.
 *
 * Particles are colored by the AQI of the nearest live station, using the
 * same Indian AQI color scale as the station markers.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

// Delhi bounding box (matches backend grid extent)
const DELHI_BOUNDS = {
  latMin: 28.40, latMax: 28.85,
  lonMin: 76.85, lonMax: 77.55,
};
const GRID_N = 4; // 4×4 grid

// AQI → particle color (Indian AQI scale matching station markers)
function aqiParticleColor(aqi) {
  if (aqi == null || aqi <= 0) return 'rgba(56, 189, 248, 0.75)';   // unknown -> cyan
  if (aqi <= 50)  return 'rgba(76, 175, 80, 0.75)';                // Good - green
  if (aqi <= 100) return 'rgba(139, 195, 74, 0.75)';               // Satisfactory - light green
  if (aqi <= 200) return 'rgba(255, 193, 7, 0.75)';                // Moderate - amber
  if (aqi <= 300) return 'rgba(255, 152, 0, 0.75)';                // Poor - orange
  if (aqi <= 400) return 'rgba(244, 67, 54, 0.75)';                // Very Poor - red
  return 'rgba(123, 31, 162, 0.75)';                               // Severe - purple
}

export class WindParticleLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} map MapTiler GL map instance
   * @param {number} particleCount
   */
  constructor(canvas, map = null, particleCount = 120) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.map = map;
    this.particleCount = particleCount;

    // Wind grid fetched from /api/wind-field
    this.grid = [];
    this.gridFetched = false;
    this.fetchingGrid = false;

    // Live AQI stations [{lat, lon, aqi}]
    this.stations = [];

    // Particle pool
    this.particles = [];

    // State
    this.running = false;
    this.isMapMoving = false;
    this._rafId = null;
    this._lastW = 0;
    this._lastH = 0;

    if (this.map) {
      this._bindMapEvents();
    }

    this._spawnAll();
  }

  setMap(map) {
    this.map = map;
    if (this.map) {
      this._bindMapEvents();
      this.onMapMove();
    }
  }

  _bindMapEvents() {
    if (!this.map) return;
    this.map.on('movestart', () => {
      this.isMapMoving = true;
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    });
    this.map.on('moveend', () => {
      this.isMapMoving = false;
      this.onMapMove();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  start() {
    if (this.running) return;
    this.running = true;
    this._fetchGrid();
    this._tick();
  }

  stop() {
    this.running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  toggle() {
    if (this.running) {
      this.stop();
      return false;
    }
    this.start();
    return true;
  }

  setStations(stations) {
    this.stations = (stations || [])
      .filter(s => s.latitude && s.longitude)
      .map(s => ({ lat: s.latitude, lon: s.longitude, aqi: s.aqi || 0 }));

    for (const p of this.particles) {
      p.color = this._colorForLatLon(p.lat, p.lon);
    }
  }

  onMapMove() {
    if (!this.map) return;
    for (const p of this.particles) {
      try {
        const px = this.map.project([p.lon, p.lat]);
        p.x = px.x;
        p.y = px.y;
      } catch (_) {
        // Map may not be fully ready
      }
    }
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
      this._spawnAll();
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  async _fetchGrid() {
    if (this.gridFetched || this.fetchingGrid) return;
    this.fetchingGrid = true;
    try {
      const res = await fetch(`${API_BASE}/api/wind-field`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.grid = data.grid || [];
      this.gridFetched = true;
    } catch (err) {
      console.warn('[WindParticleLayer] Wind-field fetch failed, using fallback grid.', err);
      this.grid = this._buildFallbackGrid(3.0, 105.0);
      this.gridFetched = true;
    } finally {
      this.fetchingGrid = false;
    }
  }

  _buildFallbackGrid(speed, dirDeg) {
    const rad = (d) => d * Math.PI / 180;
    const u = -speed * Math.sin(rad(dirDeg));
    const v = -speed * Math.cos(rad(dirDeg));
    const grid = [];
    for (let i = 0; i < GRID_N; i++) {
      const lat = DELHI_BOUNDS.latMin + (DELHI_BOUNDS.latMax - DELHI_BOUNDS.latMin) * i / (GRID_N - 1);
      for (let j = 0; j < GRID_N; j++) {
        const lon = DELHI_BOUNDS.lonMin + (DELHI_BOUNDS.lonMax - DELHI_BOUNDS.lonMin) * j / (GRID_N - 1);
        grid.push({ lat, lon, u, v });
      }
    }
    return grid;
  }

  _interpolateUV(lat, lon) {
    if (!this.grid.length) {
      const u = window._windU ?? -1.5;
      const v = window._windV ?? 0.8;
      return { u, v };
    }

    const tx = (lon - DELHI_BOUNDS.lonMin) / (DELHI_BOUNDS.lonMax - DELHI_BOUNDS.lonMin) * (GRID_N - 1);
    const ty = (lat - DELHI_BOUNDS.latMin) / (DELHI_BOUNDS.latMax - DELHI_BOUNDS.latMin) * (GRID_N - 1);

    const col0 = Math.max(0, Math.min(GRID_N - 2, Math.floor(tx)));
    const row0 = Math.max(0, Math.min(GRID_N - 2, Math.floor(ty)));
    const col1 = col0 + 1;
    const row1 = row0 + 1;

    const fx = tx - col0;
    const fy = ty - row0;

    const idx = (r, c) => r * GRID_N + c;
    const g = this.grid;

    const u00 = g[idx(row0, col0)]?.u ?? 0;
    const u10 = g[idx(row1, col0)]?.u ?? 0;
    const u01 = g[idx(row0, col1)]?.u ?? 0;
    const u11 = g[idx(row1, col1)]?.u ?? 0;

    const v00 = g[idx(row0, col0)]?.v ?? 0;
    const v10 = g[idx(row1, col0)]?.v ?? 0;
    const v01 = g[idx(row0, col1)]?.v ?? 0;
    const v11 = g[idx(row1, col1)]?.v ?? 0;

    const u = u00 * (1 - fx) * (1 - fy) + u01 * fx * (1 - fy) + u10 * (1 - fx) * fy + u11 * fx * fy;
    const v = v00 * (1 - fx) * (1 - fy) + v01 * fx * (1 - fy) + v10 * (1 - fx) * fy + v11 * fx * fy;

    return { u, v };
  }

  _colorForLatLon(lat, lon) {
    if (!this.stations.length) return aqiParticleColor(null);
    let bestDist = Infinity;
    let bestAqi = null;
    for (const s of this.stations) {
      const d = (s.lat - lat) ** 2 + (s.lon - lon) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestAqi = s.aqi;
      }
    }
    return aqiParticleColor(bestAqi);
  }

  _spawnAll() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(this._newParticle());
    }
  }

  _newParticle(overrideLat, overrideLon) {
    const lat = overrideLat ?? (DELHI_BOUNDS.latMin + Math.random() * (DELHI_BOUNDS.latMax - DELHI_BOUNDS.latMin));
    const lon = overrideLon ?? (DELHI_BOUNDS.lonMin + Math.random() * (DELHI_BOUNDS.lonMax - DELHI_BOUNDS.lonMin));

    let x = Math.random() * (this.canvas?.width || 800);
    let y = Math.random() * (this.canvas?.height || 600);
    if (this.map) {
      try {
        const px = this.map.project([lon, lat]);
        x = px.x;
        y = px.y;
      } catch (_) {}
    }

    const maxAge = Math.floor(60 + Math.random() * 60); // 60–120 frames
    const age = Math.floor(Math.random() * maxAge);

    return {
      lat,
      lon,
      x,
      y,
      age,
      maxAge,
      color: this._colorForLatLon(lat, lon),
      speedScale: 0.32 + Math.random() * 0.22,
    };
  }

  _reset(p) {
    const lat = DELHI_BOUNDS.latMin + Math.random() * (DELHI_BOUNDS.latMax - DELHI_BOUNDS.latMin);
    const lon = DELHI_BOUNDS.lonMin + Math.random() * (DELHI_BOUNDS.lonMax - DELHI_BOUNDS.lonMin);
    p.lat = lat;
    p.lon = lon;
    p.age = 0;
    p.maxAge = Math.floor(60 + Math.random() * 60);
    p.color = this._colorForLatLon(lat, lon);
    p.speedScale = 0.32 + Math.random() * 0.22;
    if (this.map) {
      try {
        const px = this.map.project([lon, lat]);
        p.x = px.x;
        p.y = px.y;
      } catch (_) {
        p.x = Math.random() * (this.canvas?.width || 800);
        p.y = Math.random() * (this.canvas?.height || 600);
      }
    }
  }

  _tick() {
    if (!this.running) return;
    this._rafId = requestAnimationFrame(() => this._tick());

    const { canvas, ctx, map } = this;
    if (!canvas || !ctx || !canvas.width || !canvas.height) return;

    if (this.isMapMoving) return;

    const w = canvas.width;
    const h = canvas.height;

    // Detect dimension change
    if (w !== this._lastW || h !== this._lastH) {
      this._lastW = w;
      this._lastH = h;
      this._spawnAll();
      return;
    }

    // Fade trail effect using destination-out so the canvas fades without turning opaque black
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    const bearing = map ? map.getBearing() : 0;
    const bearingRad = (bearing * Math.PI) / 180;

    for (const p of this.particles) {
      p.age++;

      // Bilinear wind vector
      const { u, v } = this._interpolateUV(p.lat, p.lon);

      // Rotate geographic wind into screen pixel space
      const screenU =  u * Math.cos(bearingRad) + v * Math.sin(bearingRad);
      const screenV = -u * Math.sin(bearingRad) + v * Math.cos(bearingRad);

      const dx = screenU * p.speedScale;
      const dy = -screenV * p.speedScale; // Screen +y is downward

      p.x += dx;
      p.y += dy;

      // Update lat/lon approximation
      const lonPerPx = (DELHI_BOUNDS.lonMax - DELHI_BOUNDS.lonMin) / w;
      const latPerPx = (DELHI_BOUNDS.latMax - DELHI_BOUNDS.latMin) / h;
      p.lon += dx * lonPerPx;
      p.lat -= dy * latPerPx;

      // Respawn check
      if (
        p.age >= p.maxAge ||
        p.lat < DELHI_BOUNDS.latMin || p.lat > DELHI_BOUNDS.latMax ||
        p.lon < DELHI_BOUNDS.lonMin || p.lon > DELHI_BOUNDS.lonMax ||
        p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20
      ) {
        this._reset(p);
        continue;
      }

      // Draw 1.5px particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
  }
}
