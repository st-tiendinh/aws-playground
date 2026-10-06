// Tiny Web Audio synth: every sound (earthquake rumble, sparks, alarms, chimes…) is
// generated on the fly, so there are no audio files. Silent until the first user gesture.
const MIN_GAP = { build: 140, zap: 200, alarm: 3500, alert: 1200, good: 1200, crowd: 3000, quake: 2500, click: 40, lesson: 1000, repair: 1000, whoosh: 150 };

export class Sfx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this._last = {};
    this._noiseBuf = null;
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _noise() {
    if (!this._noiseBuf) {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    return src;
  }

  _env(gainNode, t0, attack, hold, release, peak) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.setValueAtTime(peak, t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  _tone(freq, { t = 0, dur = 0.2, type = 'sine', gain = 0.3, slide = null, attack = 0.01 } = {}) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    const g = ctx.createGain();
    this._env(g, t0, attack, dur * 0.3, dur * 0.7, gain);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
  }

  _noiseBurst({ t = 0, dur = 0.3, gain = 0.3, type = 'bandpass', freq = 1000, q = 1, sweep = null, attack = 0.01 } = {}) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + t;
    const src = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t0, attack, dur * 0.4, dur * 0.6, gain);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + attack + dur + 0.05);
  }

  play(name) {
    if (!this.enabled) return;
    const now = performance.now();
    if (this._last[name] && now - this._last[name] < (MIN_GAP[name] || 120)) return;
    this._last[name] = now;
    const ctx = this._ensure();
    if (!ctx) return;
    switch (name) {
      case 'quake': {
        this._noiseBurst({ dur: 3.2, gain: 0.9, type: 'lowpass', freq: 140, q: 0.7, attack: 0.15 });
        this._tone(42, { dur: 3, type: 'sawtooth', gain: 0.18, slide: 30, attack: 0.2 });
        for (let k = 0; k < 5; k++) this._noiseBurst({ t: 0.2 + k * 0.45 + Math.random() * 0.2, dur: 0.25, gain: 0.35, type: 'lowpass', freq: 400 });
        break;
      }
      case 'zap':
        this._noiseBurst({ dur: 0.25, gain: 0.35, type: 'highpass', freq: 2500 });
        this._tone(900, { dur: 0.3, type: 'square', gain: 0.08, slide: 90 });
        break;
      case 'alarm':
        for (let k = 0; k < 3; k++) {
          this._tone(880, { t: k * 0.36, dur: 0.15, type: 'triangle', gain: 0.18 });
          this._tone(660, { t: k * 0.36 + 0.18, dur: 0.15, type: 'triangle', gain: 0.18 });
        }
        break;
      case 'alert':
        this._tone(740, { dur: 0.18, type: 'triangle', gain: 0.16 });
        this._tone(988, { t: 0.16, dur: 0.22, type: 'triangle', gain: 0.14 });
        break;
      case 'good':
        [660, 880, 1320].forEach((f, k) => this._tone(f, { t: k * 0.09, dur: 0.25, gain: 0.12 }));
        break;
      case 'repair':
        [392, 523, 659, 784].forEach((f, k) => this._tone(f, { t: k * 0.08, dur: 0.3, gain: 0.11, type: 'triangle' }));
        break;
      case 'lesson':
        this._tone(587, { dur: 0.25, gain: 0.1 });
        this._tone(880, { t: 0.14, dur: 0.4, gain: 0.1 });
        break;
      case 'build':
        this._noiseBurst({ dur: 0.45, gain: 0.12, type: 'bandpass', freq: 500, sweep: 2600, q: 2 });
        this._tone(520, { t: 0.3, dur: 0.12, gain: 0.06, slide: 780 });
        break;
      case 'crowd':
        this._noiseBurst({ dur: 2.2, gain: 0.3, type: 'bandpass', freq: 900, q: 0.6, attack: 0.6 });
        this._noiseBurst({ t: 0.3, dur: 1.8, gain: 0.15, type: 'bandpass', freq: 1800, q: 1.5, attack: 0.5 });
        break;
      case 'whoosh':
        this._noiseBurst({ dur: 0.35, gain: 0.08, type: 'bandpass', freq: 1500, sweep: 400, q: 1.2 });
        break;
      case 'click':
        this._tone(1400, { dur: 0.03, type: 'square', gain: 0.03 });
        break;
      default:
        break;
    }
  }
}
