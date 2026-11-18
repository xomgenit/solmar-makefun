// audio.mjs — every sound in SOLMAR is synthesised with WebAudio: no audio
// files, no network. Engine hum, sirens, gunshots, pickups and jingles are
// all oscillators and filtered noise, started on the first user gesture.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineOn = false;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  // Browsers require a user gesture before audio starts; call from any
  // click or keypress handler. Safe to call repeatedly.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.45;
    return this.muted;
  }

  blip(freq, dur, type = 'sine', gain = 0.25, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, filterFreq, gain = 0.3, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  shot() {
    this.noise(0.12, 1800, 0.35, 'bandpass');
    this.blip(160, 0.08, 'square', 0.12, 60);
  }

  crash(strength = 1) {
    this.noise(0.25, 500, 0.3 * strength);
    this.blip(90, 0.18, 'sawtooth', 0.15, 40);
  }

  pickup() {
    this.blip(880, 0.09, 'sine', 0.22);
    setTimeout(() => this.blip(1318, 0.14, 'sine', 0.22), 80);
  }

  jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.25), i * 110));
  }

  sting() {
    this.blip(392, 0.25, 'sawtooth', 0.18, 196);
    setTimeout(() => this.blip(311, 0.35, 'sawtooth', 0.18, 155), 200);
  }

  honk() {
    this.blip(370, 0.16, 'square', 0.12);
    this.blip(466, 0.16, 'square', 0.1);
  }

  tick() {
    this.blip(1200, 0.05, 'square', 0.08);
  }

  setEngine(on, speed01) {
    if (!this.ctx) return;
    if (on && !this.engineOn) {
      const t = this.ctx.currentTime;
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc2.type = 'square';
      this.engineGain.gain.value = 0.05;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      this.engineOsc.connect(filter);
      this.engineOsc2.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start(t);
      this.engineOsc2.start(t);
      this.engineOn = true;
    }
    if (!on && this.engineOn) {
      try { this.engineOsc.stop(); this.engineOsc2.stop(); } catch { /* already stopped */ }
      this.engineOn = false;
      return;
    }
    if (this.engineOn) {
      const f = 55 + speed01 * 165;
      this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(f * 0.5 + 2, this.ctx.currentTime, 0.08);
      this.engineGain.gain.setTargetAtTime(0.04 + speed01 * 0.05, this.ctx.currentTime, 0.1);
    }
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOn) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenOn = true;
      this.sirenTimer = 0;
    }
    if (!on && this.sirenOn) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOn = false;
    }
  }

  update(dt) {
    if (this.sirenOn && this.sirenOsc) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(
          this.sirenHigh ? 960 : 720, this.ctx.currentTime, 0.05,
        );
      }
    }
  }
}
