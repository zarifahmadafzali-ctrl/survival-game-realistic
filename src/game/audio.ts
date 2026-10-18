// Stillwater audio v2 — drop-in REPLACEMENT for src/game/audio.ts (same old API + new methods).
// Everything is synthesized with WebAudio: no audio files, works offline in the APK.
export type Surface = "grass" | "dirt" | "rock" | "snow" | "water";
export type AmbienceInput = { night: number; altitude: number; inWater: boolean };

export function createAudio() {
  let ctx: AudioContext | null = null;
  let wind: { stop: () => void } | null = null;
  let master: GainNode | null = null;
  let reverb: ConvolverNode | null = null;
  let windGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let cricketLevel: GainNode | null = null;
  let vol = 0.8;
  let birdT = 3;
  let howlT = 50;

  const out = (a: AudioContext) => {
    if (!master) {
      master = a.createGain();
      master.gain.value = vol;
      master.connect(a.destination);
    }
    return master;
  };

  const ac = () => {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  /** Short cave-like reverb (generated impulse), used for gunshots, birds and howls. */
  const rev = (a: AudioContext) => {
    if (!reverb) {
      const len = Math.floor(a.sampleRate * 1.4);
      const imp = a.createBuffer(2, len, a.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = imp.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      reverb = a.createConvolver();
      reverb.buffer = imp;
      const wet = a.createGain();
      wet.gain.value = 0.5;
      reverb.connect(wet);
      wet.connect(out(a));
    }
    return reverb;
  };

  const tone = (freq: number, dur: number, type: OscillatorType, gain: number, slide = 1, when = 0, send = false) => {
    const a = ac();
    const t = a.currentTime + when;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out(a));
    if (send) g.connect(rev(a));
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  const noise = (dur: number, gain: number, freq: number, type: BiquadFilterType = "lowpass", send = false, when = 0, q = 0.7) => {
    const a = ac();
    const n = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = a.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(out(a));
    if (send) g.connect(rev(a));
    src.start(a.currentTime + when);
  };

  const loopNoise = (a: AudioContext, seconds: number) => {
    const n = Math.floor(a.sampleRate * seconds);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  };

  const chirp = () => {
    const base = 2200 + Math.random() * 1400;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) tone(base * (0.9 + Math.random() * 0.25), 0.07, "sine", 0.012, 1.25, i * 0.11, true);
  };

  const howl = () => {
    const a = ac();
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(300, t);
    o.frequency.linearRampToValueAtTime(540, t + 1.1);
    o.frequency.linearRampToValueAtTime(380, t + 2.8);
    lfo.frequency.value = 5.5;
    lfoGain.gain.value = 7;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + 2.9);
    o.connect(g);
    g.connect(out(a));
    g.connect(rev(a));
    o.start(t);
    lfo.start(t);
    o.stop(t + 3);
    lfo.stop(t + 3);
  };

  return {
    unlock() {
      const a = ac();
      if (wind) return;
      // wind bed (level/pitch follow altitude via ambience())
      const w = loopNoise(a, 2);
      windFilter = a.createBiquadFilter();
      windFilter.type = "lowpass";
      windFilter.frequency.value = 400;
      windGain = a.createGain();
      windGain.gain.value = 0.012;
      w.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(out(a));
      w.start();
      // night crickets: band-passed noise with a fast tremolo
      const c = loopNoise(a, 2);
      const bp = a.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 4600;
      bp.Q.value = 9;
      const trem = a.createGain();
      trem.gain.value = 0.5;
      const lfo = a.createOscillator();
      const lfoGain = a.createGain();
      lfo.frequency.value = 9;
      lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(trem.gain);
      cricketLevel = a.createGain();
      cricketLevel.gain.value = 0;
      c.connect(bp);
      bp.connect(trem);
      trem.connect(cricketLevel);
      cricketLevel.connect(out(a));
      c.start();
      lfo.start();
      wind = {
        stop: () => {
          w.stop();
          c.stop();
          lfo.stop();
        },
      };
    },
    setVolume(v: number) {
      vol = v;
      if (master) master.gain.value = v;
    },
    /** Call every frame while playing. Safe before unlock() (does nothing). */
    ambience(dt: number, s: AmbienceInput) {
      if (!ctx || !windGain || !windFilter || !cricketLevel) return;
      const t = ctx.currentTime;
      windGain.gain.setTargetAtTime(0.008 + s.altitude * 0.03, t, 0.8);
      windFilter.frequency.setTargetAtTime(300 + s.altitude * 500, t, 0.8);
      cricketLevel.gain.setTargetAtTime(s.inWater || s.altitude > 0.6 ? 0 : s.night * 0.014, t, 1.5);
      if (s.night < 0.5 && !s.inWater) {
        birdT -= dt;
        if (birdT <= 0) {
          chirp();
          birdT = 2.5 + Math.random() * 6;
        }
      }
      if (s.night > 0.7) {
        howlT -= dt;
        if (howlT <= 0) {
          howl();
          howlT = 45 + Math.random() * 55;
        }
      }
    },
    footstep(surface: Surface, sprint: boolean) {
      const k = sprint ? 1.4 : 1;
      const j = 0.85 + Math.random() * 0.3;
      if (surface === "grass") {
        noise(0.09, 0.05 * k, 900 * j);
        noise(0.05, 0.012 * k, 3500, "highpass");
      } else if (surface === "dirt") {
        noise(0.07, 0.06 * k, 600 * j);
      } else if (surface === "rock") {
        noise(0.05, 0.07 * k, 2400 * j, "bandpass", false, 0, 2);
        tone(210 * j, 0.04, "triangle", 0.025 * k, 0.6);
      } else if (surface === "snow") {
        noise(0.14, 0.04 * k, 1800 * j);
        noise(0.08, 0.025 * k, 2600, "lowpass", false, 0.05);
      } else {
        noise(0.18, 0.06 * k, 1200 * j);
        noise(0.12, 0.03 * k, 3000, "highpass", false, 0.04);
      }
    },
    reload() {
      tone(700, 0.03, "square", 0.03, 0.5);
      tone(420, 0.05, "square", 0.03, 0.6, 0.55);
      tone(900, 0.03, "square", 0.03, 0.5, 1.2);
    },
    shot() {
      noise(0.09, 0.28, 1400, "lowpass", true);
      noise(0.03, 0.16, 5200, "highpass");
      noise(0.55, 0.1, 700, "lowpass", true, 0.02);
      tone(160, 0.09, "sawtooth", 0.05, 0.4);
    },
    dry() {
      tone(180, 0.04, "square", 0.03, 0.8);
    },
    hit() {
      tone(920, 0.05, "square", 0.035, 1.4);
    },
    hurt() {
      tone(110, 0.22, "sawtooth", 0.06, 0.5);
    },
    pickup() {
      tone(620, 0.08, "sine", 0.04, 1);
      tone(930, 0.12, "sine", 0.035, 1);
    },
    stop() {
      master = null;
      reverb = null;
      windGain = null;
      windFilter = null;
      cricketLevel = null;
      wind?.stop();
      wind = null;
      void ctx?.close();
      ctx = null;
    },
  };
}
