/**
 * lib/thunder.js
 * Web Audio API realistic thunder synthesizer.
 * Generates a crack + rolling rumble + sub-bass oscillator.
 */
export class ThunderSoundSynthesizer {
  constructor() {
    this._ctx = null;
  }

  _init() {
    if (!this._ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this._ctx = new AudioCtx();
    }
    if (this._ctx?.state === 'suspended') this._ctx.resume();
  }

  playThunder(volume = 0.8) {
    try {
      this._init();
      if (!this._ctx) return;
      const ctx = this._ctx;
      const now = ctx.currentTime;

      // 1. Sharp crack
      const crackBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const crackData = crackBuf.getChannelData(0);
      for (let i = 0; i < crackData.length; i++) {
        crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
      }
      const crackSrc = ctx.createBufferSource();
      crackSrc.buffer = crackBuf;
      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = 'highpass';
      crackFilter.frequency.setValueAtTime(600, now);
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(volume * 0.9, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(ctx.destination);
      crackSrc.start(now);

      // 2. Rolling low rumble
      const rumbleDur = 3.5;
      const rumbleBuf = ctx.createBuffer(1, ctx.sampleRate * rumbleDur, ctx.sampleRate);
      const rumbleData = rumbleBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < rumbleData.length; i++) {
        const w = Math.random() * 2 - 1;
        rumbleData[i] = (last + 0.02 * w) / 1.02;
        last = rumbleData[i];
        rumbleData[i] *= 3.5;
      }
      const rumbleSrc = ctx.createBufferSource();
      rumbleSrc.buffer = rumbleBuf;
      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(250, now);
      rumbleFilter.frequency.exponentialRampToValueAtTime(45, now + rumbleDur);
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.01, now);
      rumbleGain.gain.linearRampToValueAtTime(volume * 1.2, now + 0.15);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + rumbleDur);
      rumbleSrc.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(ctx.destination);
      rumbleSrc.start(now + 0.05);

      // 3. Sub-bass oscillator
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(70, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 2.5);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(volume * 0.7, now + 0.08);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now + 0.08);
      sub.stop(now + 2.6);
    } catch (err) {
      console.warn('Audio playback error (waiting for user gesture):', err);
    }
  }
}
