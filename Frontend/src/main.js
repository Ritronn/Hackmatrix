/**
 * Atmos Twin — Full-Screen Tablet Dashboard
 * Features:
 * - WebGL Lightning Shader (React-Bits specification)
 * - Web Audio API Thunder Synthesizer (Realistic crack & sub-bass rumble)
 * - Storm Clouds Parting Intro Sequence
 * - Interactive Bento Dashboard & Telemetry
 */
import './style.css';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Start Storm & Lightning Intro
  initStormSequence();

  // Initialize Dashboard features
  initNavRail();
  initMapControls();
  initHeroCountUp();
  initDriftAlert();
});

/* ═══════════════════════════════════════════════════════
   1. WEBGL LIGHTNING SHADER (User Spec)
   ═══════════════════════════════════════════════════════ */
class LightningRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    this.hue = 210; // Electric Cyan/Blue
    this.xOffset = 0;
    this.speed = 1.2;
    this.intensity = 1.0;
    this.size = 1.0;
    this.animationFrameId = null;
    this.startTime = performance.now();

    if (!this.gl) {
      console.warn('WebGL not supported for lightning');
      return;
    }
    this.initShaders();
    this.start();
  }

  initShaders() {
    const gl = this.gl;

    const vertexShaderSource = `
      attribute vec2 aPosition;
      void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform vec2 iResolution;
      uniform float iTime;
      uniform float uHue;
      uniform float uXOffset;
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uSize;
      
      #define OCTAVE_COUNT 10

      vec3 hsv2rgb(vec3 c) {
          vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
          return c.z * mix(vec3(1.0), rgb, c.y);
      }

      float hash11(float p) {
          p = fract(p * .1031);
          p *= p + 33.33;
          p *= p + p;
          return fract(p);
      }

      float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * .1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
      }

      mat2 rotate2d(float theta) {
          float c = cos(theta);
          float s = sin(theta);
          return mat2(c, -s, s, c);
      }

      float noise(vec2 p) {
          vec2 ip = floor(p);
          vec2 fp = fract(p);
          float a = hash12(ip);
          float b = hash12(ip + vec2(1.0, 0.0));
          float c = hash12(ip + vec2(0.0, 1.0));
          float d = hash12(ip + vec2(1.0, 1.0));
          
          vec2 t = smoothstep(0.0, 1.0, fp);
          return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
      }

      float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < OCTAVE_COUNT; ++i) {
              value += amplitude * noise(p);
              p *= rotate2d(0.45);
              p *= 2.0;
              amplitude *= 0.5;
          }
          return value;
      }

      void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
          vec2 uv = fragCoord / iResolution.xy;
          uv = 2.0 * uv - 1.0;
          uv.x *= iResolution.x / iResolution.y;
          uv.x += uXOffset;
          
          uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;
          
          float dist = abs(uv.x);
          vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
          vec3 col = baseColor * pow(mix(0.0, 0.07, hash11(iTime * uSpeed)) / dist, 1.0) * uIntensity;
          col = pow(col, vec3(1.0));
          float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
          fragColor = vec4(col, a);
      }

      void main() {
          mainImage(gl_FragColor, gl_FragCoord.xy);
      }
    `;

    const compileShader = (source, type) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);
    this.program = program;

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    this.locations = {
      iResolution: gl.getUniformLocation(program, 'iResolution'),
      iTime: gl.getUniformLocation(program, 'iTime'),
      uHue: gl.getUniformLocation(program, 'uHue'),
      uXOffset: gl.getUniformLocation(program, 'uXOffset'),
      uSpeed: gl.getUniformLocation(program, 'uSpeed'),
      uIntensity: gl.getUniformLocation(program, 'uIntensity'),
      uSize: gl.getUniformLocation(program, 'uSize'),
    };
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  start() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    const render = () => {
      if (!this.gl || !this.program) return;
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.locations.iResolution, this.canvas.width, this.canvas.height);
      const currentTime = performance.now();
      gl.uniform1f(this.locations.iTime, (currentTime - this.startTime) / 1000.0);
      gl.uniform1f(this.locations.uHue, this.hue);
      gl.uniform1f(this.locations.uXOffset, this.xOffset);
      gl.uniform1f(this.locations.uSpeed, this.speed);
      gl.uniform1f(this.locations.uIntensity, this.intensity);
      gl.uniform1f(this.locations.uSize, this.size);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  setBurst(intensity, speed = 2.0) {
    this.intensity = intensity;
    this.speed = speed;
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}

/* ═══════════════════════════════════════════════════════
   2. VOLUMETRIC STORM CLOUD RENDERER (User Spec Palette)
   ═══════════════════════════════════════════════════════ */
class CloudRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.puffs = [];
    this.animationFrameId = null;
    this.isParting = false;
    this.globalAlpha = 1.0;
    this.flashIllumination = 0.0;

    if (!canvas || !this.ctx) return;

    this.resize();
    this.initPuffs();
    window.addEventListener('resize', () => {
      this.resize();
      this.initPuffs();
    });
    this.start();
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  }

  initPuffs() {
    this.puffs = [];
    this.globalAlpha = 1.0;
    this.isParting = false;
    this.flashIllumination = 0.0;

    // Generate dense billowing cumulus clouds covering the whole screen
    const count = Math.floor(Math.max(55, Math.min(85, (this.width * this.height) / 19000)));

    for (let i = 0; i < count; i++) {
      let x;
      const r = Math.random();
      if (r < 0.45) {
        x = (Math.random() * 0.62 - 0.12) * this.width; // Left bank
      } else if (r < 0.90) {
        x = (Math.random() * 0.62 + 0.50) * this.width; // Right bank
      } else {
        x = Math.random() * this.width; // Center / top overhang
      }

      const y = Math.random() * this.height * 1.15 - this.height * 0.08;
      const radius = Math.random() * 180 + 140; // 140px to 320px
      const baseAlpha = Math.random() * 0.35 + 0.55; // 0.55 to 0.90
      const side = x < this.width * 0.5 ? -1 : 1;

      this.puffs.push({
        x,
        y,
        radius,
        baseAlpha,
        side,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.18,
        partingVx: 0,
        warmth: Math.random() < 0.35, // Highlights with coral #e07b5b & gold #efd395
      });
    }
  }

  flash(intensity = 1.0) {
    this.flashIllumination = intensity;
  }

  part() {
    this.isParting = true;
    for (const p of this.puffs) {
      const speed = Math.random() * 8 + 8;
      p.partingVx = p.side * speed;
    }
  }

  reset() {
    this.initPuffs();
  }

  start() {
    const render = () => {
      const ctx = this.ctx;
      if (!ctx) return;

      ctx.clearRect(0, 0, this.width, this.height);

      if (this.flashIllumination > 0.01) {
        this.flashIllumination *= 0.86;
      } else {
        this.flashIllumination = 0;
      }

      if (this.isParting) {
        this.globalAlpha = Math.max(0, this.globalAlpha - 0.02);
      }

      ctx.save();
      ctx.globalAlpha = this.globalAlpha;

      for (const p of this.puffs) {
        p.x += p.vx + p.partingVx;
        p.y += p.vy;

        if (this.isParting) {
          p.partingVx *= 1.025;
        }

        const alpha = Math.min(1.0, p.baseAlpha + this.flashIllumination * 0.3);

        const grad = ctx.createRadialGradient(
          p.x - p.radius * 0.15,
          p.y - p.radius * 0.15,
          p.radius * 0.05,
          p.x,
          p.y,
          p.radius
        );

        if (this.flashIllumination > 0.3) {
          // Cloud lit up during lightning flash
          grad.addColorStop(0, `rgba(255, 255, 255, ${0.92 * alpha})`);
          grad.addColorStop(0.3, `rgba(239, 211, 149, ${0.82 * alpha})`); // gold #efd395
          grad.addColorStop(0.65, `rgba(90, 104, 130, ${0.75 * alpha})`); // slate light #5a6882
          grad.addColorStop(1, 'rgba(12, 16, 21, 0)');
        } else if (p.warmth) {
          // Dusk rim-lit cloud (coral #e07b5b & gold #efd395)
          grad.addColorStop(0, `rgba(90, 104, 130, ${0.88 * alpha})`);
          grad.addColorStop(0.4, `rgba(60, 71, 90, ${0.82 * alpha})`);
          grad.addColorStop(0.72, `rgba(29, 41, 56, ${0.75 * alpha})`);
          grad.addColorStop(0.9, `rgba(224, 123, 91, ${0.35 * alpha})`);
          grad.addColorStop(1, 'rgba(12, 16, 21, 0)');
        } else {
          // Deep slate storm body (#5a6882, #3c475a, #1d2938, #0c1015)
          grad.addColorStop(0, `rgba(90, 104, 130, ${0.92 * alpha})`);
          grad.addColorStop(0.38, `rgba(60, 71, 90, ${0.88 * alpha})`);
          grad.addColorStop(0.75, `rgba(29, 41, 56, ${0.82 * alpha})`);
          grad.addColorStop(0.95, `rgba(12, 16, 21, ${0.65 * alpha})`);
          grad.addColorStop(1, 'rgba(12, 16, 21, 0)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      this.animationFrameId = requestAnimationFrame(render);
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}

/* ═══════════════════════════════════════════════════════
   3. REALISTIC WEB AUDIO THUNDER SYNTHESIZER
   ═══════════════════════════════════════════════════════ */
class ThunderSoundSynthesizer {
  constructor() {
    this.ctx = null;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playThunder(volume = 0.8) {
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // 1. Initial Sharp Lightning Crack / Snap
      const crackBufferSize = this.ctx.sampleRate * 0.4;
      const crackBuffer = this.ctx.createBuffer(1, crackBufferSize, this.ctx.sampleRate);
      const crackData = crackBuffer.getChannelData(0);
      for (let i = 0; i < crackBufferSize; i++) {
        crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
      }

      const crackSource = this.ctx.createBufferSource();
      crackSource.buffer = crackBuffer;

      const crackFilter = this.ctx.createBiquadFilter();
      crackFilter.type = 'highpass';
      crackFilter.frequency.setValueAtTime(600, now);

      const crackGain = this.ctx.createGain();
      crackGain.gain.setValueAtTime(volume * 0.9, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      crackSource.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(this.ctx.destination);
      crackSource.start(now);

      // 2. Deep Rolling Thunder Rumble (Noise + Sweeping Lowpass)
      const rumbleDuration = 3.5;
      const rumbleBufferSize = this.ctx.sampleRate * rumbleDuration;
      const rumbleBuffer = this.ctx.createBuffer(1, rumbleBufferSize, this.ctx.sampleRate);
      const rumbleData = rumbleBuffer.getChannelData(0);

      // Filtered pink/brown noise
      let lastOut = 0.0;
      for (let i = 0; i < rumbleBufferSize; i++) {
        const white = Math.random() * 2 - 1;
        rumbleData[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = rumbleData[i];
        rumbleData[i] *= 3.5;
      }

      const rumbleSource = this.ctx.createBufferSource();
      rumbleSource.buffer = rumbleBuffer;

      const rumbleFilter = this.ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(250, now);
      rumbleFilter.frequency.exponentialRampToValueAtTime(45, now + rumbleDuration);

      const rumbleGain = this.ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.01, now);
      rumbleGain.gain.linearRampToValueAtTime(volume * 1.2, now + 0.15); // Impact peak
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + rumbleDuration);

      rumbleSource.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(this.ctx.destination);
      rumbleSource.start(now + 0.05);

      // 3. Sub-Bass Oscillator for Physical Earth-shaking Rumble
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(70, now);
      subOsc.frequency.exponentialRampToValueAtTime(28, now + 2.5);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(volume * 0.7, now + 0.08);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);
      subOsc.start(now + 0.08);
      subOsc.stop(now + 2.6);
    } catch (err) {
      console.warn('Audio playback error (waiting for user gesture):', err);
    }
  }
}

/* ═══════════════════════════════════════════════════════
   4. STORM & CLOUD PARTING INTRO SEQUENCE
   ═══════════════════════════════════════════════════════ */
function initStormSequence() {
  const introEl = document.getElementById('storm-intro');
  const canvasEl = document.getElementById('lightning-canvas');
  const cloudsCanvasEl = document.getElementById('clouds-canvas');
  const flashEl = document.getElementById('storm-flash');
  const titleEl = document.getElementById('storm-title');
  const fillEl = document.getElementById('storm-loading-fill');
  const skipBtn = document.getElementById('storm-skip');
  const replayBtn = document.getElementById('btn-replay-storm');

  if (!introEl || !canvasEl) return;

  const lightning = new LightningRenderer(canvasEl);
  const clouds = new CloudRenderer(cloudsCanvasEl);
  const soundSynth = new ThunderSoundSynthesizer();

  // Try auto-playing audio immediately (with user gesture fallback)
  const triggerAudio = () => {
    soundSynth.playThunder(0.85);
  };
  triggerAudio();
  window.addEventListener('click', triggerAudio, { once: true });
  window.addEventListener('keydown', triggerAudio, { once: true });

  let sequenceTimeouts = [];

  function clearTimeouts() {
    sequenceTimeouts.forEach((t) => clearTimeout(t));
    sequenceTimeouts = [];
  }

  function runSequence() {
    clearTimeouts();

    // Reset styles
    clouds.reset();
    introEl.classList.remove('storm-intro--hidden', 'clouds-parting');
    introEl.style.opacity = '1';
    introEl.style.pointerEvents = 'auto';

    if (titleEl) {
      titleEl.classList.remove('storm-title-group--visible', 'storm-title-group--fadeout');
    }
    if (fillEl) fillEl.style.width = '0%';
    if (flashEl) flashEl.classList.remove('storm-flash--active');

    lightning.setBurst(0.6, 1.0);

    // 1. Title fades in smoothly (300ms)
    sequenceTimeouts.push(
      setTimeout(() => {
        if (titleEl) titleEl.classList.add('storm-title-group--visible');
        if (fillEl) fillEl.style.width = '100%';
      }, 300)
    );

    // 2. Thunder Strike & Screen Flash (1200ms)
    sequenceTimeouts.push(
      setTimeout(() => {
        soundSynth.playThunder(0.95);
        lightning.setBurst(4.0, 3.5);
        clouds.flash(1.8);

        // Rapid dual flash
        if (flashEl) {
          flashEl.classList.add('storm-flash--active');
          setTimeout(() => flashEl.classList.remove('storm-flash--active'), 90);
          setTimeout(() => flashEl.classList.add('storm-flash--active'), 160);
          setTimeout(() => flashEl.classList.remove('storm-flash--active'), 280);
        }
      }, 1200)
    );

    // 3. Silky-Smooth Dissolve & Fade Out of the Title (1900ms)
    sequenceTimeouts.push(
      setTimeout(() => {
        if (titleEl) {
          titleEl.classList.add('storm-title-group--fadeout');
        }
      }, 1900)
    );

    // 4. Clouds Part Out of Screen (2300ms)
    sequenceTimeouts.push(
      setTimeout(() => {
        introEl.classList.add('clouds-parting');
        clouds.part();
        lightning.setBurst(1.2, 1.0);
      }, 2300)
    );

    // 5. Reveal Fullscreen Dashboard Cleanly (3900ms)
    sequenceTimeouts.push(
      setTimeout(() => {
        introEl.classList.add('storm-intro--hidden');
      }, 3900)
    );
  }

  // Run automatically on open
  runSequence();

  // Skip button
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      clearTimeouts();
      if (titleEl) titleEl.classList.add('storm-title-group--fadeout');
      introEl.classList.add('clouds-parting');
      clouds.part();
      setTimeout(() => {
        introEl.classList.add('storm-intro--hidden');
      }, 600);
    });
  }

  // Replay Thunder Button in left nav rail
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      runSequence();
    });
  }
}

/* ═══════════════════════════════════════════════════════
   4. DASHBOARD INTERACTIONS
   ═══════════════════════════════════════════════════════ */

// ─── Left Nav Rail Interaction ───
function initNavRail() {
  const buttons = document.querySelectorAll('.rail-btn:not(.rail-btn--alert):not(#btn-replay-storm)');
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
