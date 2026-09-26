/**
 * lib/clouds.js
 * Canvas 2D volumetric storm cloud renderer.
 * Draws billowing cumulus puffs, animates drifting, supports parting animation.
 */
export class CloudRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.puffs = [];
    this.animationFrameId = null;
    this.isParting = false;
    this.globalAlpha = 1.0;
    this.flashIllumination = 0.0;

    if (!this.ctx) return;
    this._resize();
    this._initPuffs();
    window.addEventListener('resize', () => { this._resize(); this._initPuffs(); });
    this._start();
  }

  _resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  }

  _initPuffs() {
    this.puffs = [];
    this.globalAlpha = 1.0;
    this.isParting = false;
    this.flashIllumination = 0.0;

    const count = Math.floor(Math.max(90, Math.min(140, (this.width * this.height) / 10500)));
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 1.3 - 0.15) * this.width;
      const y = (Math.random() * 1.25 - 0.12) * this.height;
      const radius = Math.random() * 220 + 170;
      const baseAlpha = Math.random() * 0.22 + 0.78;
      const side = x < this.width * 0.5 ? -1 : 1;
      this.puffs.push({
        x, y, radius, baseAlpha, side,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.2,
        partingVx: 0,
      });
    }
  }

  flash(intensity = 1.0) {
    this.flashIllumination = intensity;
  }

  part() {
    this.isParting = true;
    for (const p of this.puffs) {
      p.partingVx = p.side * (Math.random() * 10 + 10);
    }
  }

  reset() {
    this._initPuffs();
  }

  _start() {
    const render = () => {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.width, this.height);

      if (this.flashIllumination > 0.01) this.flashIllumination *= 0.88;
      else this.flashIllumination = 0;

      if (this.isParting) this.globalAlpha = Math.max(0, this.globalAlpha - 0.022);

      ctx.save();
      ctx.globalAlpha = this.globalAlpha;

      for (const p of this.puffs) {
        p.x += p.vx + p.partingVx;
        p.y += p.vy;
        if (this.isParting) p.partingVx *= 1.03;

        const alpha = Math.min(1.0, p.baseAlpha + this.flashIllumination * 0.25);
        const grad = ctx.createRadialGradient(p.x, p.y - p.radius * 0.25, p.radius * 0.04, p.x, p.y, p.radius);

        if (this.flashIllumination > 0.1) {
          grad.addColorStop(0, `rgba(255,255,255,${1.0 * alpha})`);
          grad.addColorStop(0.35, `rgba(255,255,255,${0.98 * alpha})`);
          grad.addColorStop(0.65, `rgba(240,249,255,${0.94 * alpha})`);
          grad.addColorStop(0.9, `rgba(219,234,254,${0.85 * alpha})`);
          grad.addColorStop(1, 'rgba(191,219,254,0)');
        } else {
          grad.addColorStop(0, `rgba(255,255,255,${1.0 * alpha})`);
          grad.addColorStop(0.35, `rgba(255,255,255,${0.98 * alpha})`);
          grad.addColorStop(0.65, `rgba(241,245,249,${0.94 * alpha})`);
          grad.addColorStop(0.85, `rgba(203,213,225,${0.88 * alpha})`);
          grad.addColorStop(0.96, `rgba(148,163,184,${0.72 * alpha})`);
          grad.addColorStop(1, 'rgba(148,163,184,0)');
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
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
  }
}
