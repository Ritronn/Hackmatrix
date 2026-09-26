/**
 * lib/lightning.js
 * WebGL lightning fragment shader renderer.
 * Renders a procedural electric arc using FBM noise on a WebGL canvas.
 */
export class LightningRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    this.hue = 210;
    this.xOffset = 0;
    this.speed = 1.2;
    this.intensity = 0.0;
    this.size = 1.0;
    this.animationFrameId = null;
    this.startTime = performance.now();

    if (!this.gl) {
      console.warn('WebGL not supported for lightning');
      return;
    }
    this._initShaders();
    this._start();
  }

  _initShaders() {
    const gl = this.gl;

    const vertSrc = `
      attribute vec2 aPosition;
      void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
    `;

    const fragSrc = `
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
      float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      mat2 rotate2d(float theta) { float c = cos(theta); float s = sin(theta); return mat2(c, -s, s, c); }
      float noise(vec2 p) {
        vec2 ip = floor(p); vec2 fp = fract(p);
        float a = hash12(ip); float b = hash12(ip + vec2(1.0, 0.0));
        float c2 = hash12(ip + vec2(0.0, 1.0)); float d = hash12(ip + vec2(1.0, 1.0));
        vec2 t = smoothstep(0.0, 1.0, fp);
        return mix(mix(a, b, t.x), mix(c2, d, t.x), t.y);
      }
      float fbm(vec2 p) {
        float value = 0.0; float amplitude = 0.5;
        for (int i = 0; i < OCTAVE_COUNT; ++i) {
          value += amplitude * noise(p); p *= rotate2d(0.45); p *= 2.0; amplitude *= 0.5;
        }
        return value;
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / iResolution.xy;
        uv = 2.0 * uv - 1.0;
        uv.x *= iResolution.x / iResolution.y;
        uv.x += uXOffset;
        uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;
        float dist = abs(uv.x);
        vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
        vec3 col = baseColor * pow(mix(0.0, 0.07, hash11(iTime * uSpeed)) / dist, 1.0) * uIntensity;
        float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }
    `;

    const compile = (src, type) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compile(vertSrc, gl.VERTEX_SHADER);
    const fs = compile(fragSrc, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    this.program = prog;

    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'aPosition');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    this.locs = {
      iResolution: gl.getUniformLocation(prog, 'iResolution'),
      iTime: gl.getUniformLocation(prog, 'iTime'),
      uHue: gl.getUniformLocation(prog, 'uHue'),
      uXOffset: gl.getUniformLocation(prog, 'uXOffset'),
      uSpeed: gl.getUniformLocation(prog, 'uSpeed'),
      uIntensity: gl.getUniformLocation(prog, 'uIntensity'),
      uSize: gl.getUniformLocation(prog, 'uSize'),
    };
  }

  _resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _start() {
    this._resize();
    window.addEventListener('resize', () => this._resize());
    const render = () => {
      if (!this.gl || !this.program) return;
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.locs.iResolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.locs.iTime, (performance.now() - this.startTime) / 1000);
      gl.uniform1f(this.locs.uHue, this.hue);
      gl.uniform1f(this.locs.uXOffset, this.xOffset);
      gl.uniform1f(this.locs.uSpeed, this.speed);
      gl.uniform1f(this.locs.uIntensity, this.intensity);
      gl.uniform1f(this.locs.uSize, this.size);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  setBurst(intensity, speed = 2.0) {
    this.intensity = intensity;
    this.speed = speed;
  }

  /** Animate a multi-stroke lightning strike over durationMs. */
  strike(maxIntensity = 4.5, durationMs = 1040, onPulse = null) {
    const startTime = performance.now();
    this.speed = 3.6;
    const animate = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= durationMs) { this.intensity = 0.0; return; }
      const p = elapsed / durationMs;
      let pulse = 0;
      if (p < 0.18) {
        pulse = Math.sin((p / 0.18) * Math.PI) * 1.1 + Math.random() * 0.2;
      } else if (p < 0.28) {
        pulse = 0.25 + Math.random() * 0.35;
      } else if (p < 0.50) {
        pulse = Math.sin(((p - 0.28) / 0.22) * Math.PI) * 0.95 + Math.random() * 0.25;
      } else if (p < 0.72) {
        pulse = 0.3 + 0.45 * Math.sin((p - 0.50) * 22.0) + Math.random() * 0.2;
      } else {
        pulse = Math.max(0, ((1.0 - p) / 0.28)) * (0.45 + Math.random() * 0.15);
      }
      this.intensity = maxIntensity * Math.max(0, Math.min(1.2, pulse));
      if (onPulse && this.intensity > 1.0) onPulse(this.intensity);
      requestAnimationFrame(animate);
    };
    animate();
  }

  destroy() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
  }
}
