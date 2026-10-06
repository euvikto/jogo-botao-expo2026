/** Efeitos sonoros sintetizados (sem arquivos de áudio). */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  muted = false;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);

    // murmúrio contínuo da torcida
    const buf = this.noiseBuffer(3);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 650;
    bp.Q.value = 0.5;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.05;
    src.connect(bp).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  private noiseBuffer(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  private blip(freq: number, dur: number, vol: number, type: OscillatorType = "square") {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hit(intensity: number, ball: boolean) {
    const v = Math.min(0.18, 0.02 + intensity * 0.004);
    this.blip(ball ? 520 + Math.random() * 120 : 260 + Math.random() * 60, 0.07, v, ball ? "triangle" : "square");
  }

  flick() {
    this.blip(900, 0.05, 0.05, "triangle");
  }

  post() {
    this.blip(1400, 0.35, 0.12, "sine");
  }

  whistle(long = false) {
    if (!this.ctx) return;
    this.blip(2600, long ? 0.9 : 0.35, 0.08, "sine");
    setTimeout(() => this.blip(2900, long ? 0.9 : 0.35, 0.08, "sine"), long ? 350 : 200);
  }

  cheer() {
    if (!this.ctx || !this.master || !this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
    this.crowdGain.gain.linearRampToValueAtTime(0.32, t + 0.4);
    this.crowdGain.gain.linearRampToValueAtTime(0.05, t + 4.5);
    this.blip(700, 0.5, 0.05, "sawtooth");
  }
}
