'use strict';

/* Everything is generated with the Web Audio API — no audio files, no CDNs.

   Two layers:
     1. Diegetic SFX. Obstacles get a sound that matches what they are: a guard
        dog barks, a radio tower hisses, a prison door clangs. The engine records
        what happened in state.events and js/table.js plays the cue for each card
        as it moves.
     2. A four-channel PSG-style bed (pulse lead, pulse arps, triangle bass,
        quantised noise drums) with two phrases per track and a feedback delay,
        in the spirit of 16-bit chip music. Five tracks, chosen from the top bar.

   Music is off by default; the board is silent until the player turns audio on. */
const Sound = (function () {
  let context = null;
  let muted = true;
  let musicOn = false;
  let scheduler = null;
  let nextTime = 0;
  let step = 0;
  let tension = 0;
  let trackName = 'nightline';

  const LOOKAHEAD = 1.2;

  /* Five beds, each two phrases long. Notes are written as
     [step, midi, length-in-eighths] so lines can hold for whole bars — a spy
     bed is carried by long, dark sustained notes, not by machine-gun
     sixteenths. `chords` are pitch classes and also voice the pad. */
  const TRACKS = {
    nightline: {
      name: 'Nightline Shunt', bpm: 92, steps: 32, swing: 0, echo: 0.32, leadDuty: 0.25,
      drums: { kick: [0, 16], snare: [8, 24], hat: [4, 12, 20, 28] },
      phrases: [
        { chords: [[9, 0, 4, 7], [5, 9, 0, 4], [2, 5, 9, 0], [4, 8, 11, 2]],
          bass: [[0, 45, 8], [8, 41, 8], [16, 38, 8], [24, 40, 4], [28, 44, 4]],
          lead: [[2, 69, 2], [4, 67, 2], [6, 72, 4], [10, 65, 2], [12, 69, 4], [18, 74, 2], [20, 69, 2], [22, 72, 4], [26, 68, 2], [28, 71, 4], [30, 64, 2]] },
        { chords: [[9, 0, 4, 7], [2, 5, 9, 0], [5, 9, 0, 4], [4, 8, 11, 2]],
          bass: [[0, 45, 8], [8, 38, 8], [16, 41, 8], [24, 40, 4], [28, 44, 4]],
          lead: [[2, 76, 2], [4, 72, 2], [6, 69, 4], [10, 65, 2], [12, 69, 4], [18, 65, 2], [20, 72, 2], [22, 69, 4], [26, 64, 2], [28, 68, 2], [30, 71, 2]] }
      ]
    },
    waltz: {
      name: 'Cold War Waltz', bpm: 84, steps: 24, swing: 0, echo: 0.38, leadDuty: 0.3,
      drums: { kick: [0, 12], snare: [3, 9, 15, 21], hat: [5, 11, 17, 23] },
      phrases: [
        { chords: [[2, 5, 9, 0], [10, 2, 5, 9], [9, 0, 4, 7]],
          bass: [[0, 50, 3], [3, 57, 3], [6, 50, 2], [8, 46, 3], [11, 53, 3], [14, 46, 2], [16, 45, 3], [19, 52, 3], [22, 45, 2]],
          lead: [[1, 74, 2], [5, 69, 1], [7, 77, 3], [9, 70, 2], [11, 74, 2], [13, 65, 1], [15, 77, 3], [17, 69, 2], [19, 72, 2], [21, 76, 3], [23, 69, 1]] },
        { chords: [[2, 5, 9, 0], [10, 2, 5, 9], [9, 0, 4, 7]],
          bass: [[0, 50, 3], [3, 57, 3], [6, 53, 2], [8, 41, 3], [11, 46, 3], [14, 41, 2], [16, 45, 3], [19, 52, 3], [22, 48, 2]],
          lead: [[1, 77, 2], [5, 74, 1], [7, 69, 3], [9, 65, 2], [11, 70, 2], [13, 74, 1], [15, 70, 3], [17, 72, 2], [19, 69, 2], [21, 76, 3], [23, 76, 1]] }
      ]
    },
    deaddrop: {
      name: 'Dead Drop', bpm: 76, steps: 32, swing: 0, echo: 0.42, leadDuty: 0.125,
      drums: { kick: [0, 16], snare: [], hat: [8, 24] },
      phrases: [
        { chords: [[9, 0, 4, 7], [2, 5, 9, 0]],
          bass: [[0, 45, 16], [16, 38, 16]],
          lead: [[6, 76, 4], [14, 69, 4], [22, 72, 4], [28, 65, 4]] },
        { chords: [[2, 5, 9, 0], [9, 0, 4, 7]],
          bass: [[0, 38, 16], [16, 45, 16]],
          lead: [[6, 65, 4], [14, 74, 4], [22, 69, 4], [28, 72, 4]] }
      ]
    },
    safehouse: {
      name: 'Safehouse Nocturne', bpm: 96, steps: 32, swing: 0.14, echo: 0.28, leadDuty: 0.25,
      drums: { kick: [0, 8, 16, 24], snare: [16], hat: [4, 12, 20, 28] },
      phrases: [
        { chords: [[2, 5, 9, 0], [7, 10, 2, 5], [0, 4, 7, 11], [9, 1, 4, 6]],
          bass: [[0, 50, 8], [8, 43, 8], [16, 48, 8], [24, 45, 4], [28, 52, 4]],
          lead: [[0, 74, 3], [3, 69, 1], [4, 77, 4], [8, 70, 2], [10, 74, 4], [14, 65, 3], [17, 67, 3], [20, 76, 4], [24, 69, 2], [26, 73, 3], [29, 76, 2], [31, 69, 1]] },
        { chords: [[2, 5, 9, 0], [9, 1, 4, 6], [7, 10, 2, 5], [0, 4, 7, 11]],
          bass: [[0, 50, 8], [8, 45, 8], [16, 43, 8], [24, 48, 4], [28, 55, 4]],
          lead: [[0, 77, 3], [3, 74, 1], [4, 69, 4], [8, 73, 2], [10, 76, 4], [14, 69, 3], [17, 70, 3], [20, 74, 4], [24, 67, 2], [26, 72, 3], [29, 64, 2], [31, 76, 1]] }
      ]
    },
    blackout: {
      name: 'Blackout March', bpm: 100, steps: 32, swing: 0, echo: 0.24, leadDuty: 0.3,
      drums: { kick: [0, 8, 16, 24], snare: [4, 12, 20, 28], hat: [] },
      phrases: [
        { chords: [[5, 9, 0, 3], [1, 5, 8, 0], [5, 9, 0, 3], [0, 4, 7, 11]],
          bass: [[0, 41, 8], [8, 49, 8], [16, 41, 8], [24, 48, 8]],
          lead: [[0, 65, 4], [4, 63, 2], [6, 69, 4], [12, 60, 4], [16, 65, 4], [20, 63, 2], [22, 69, 2], [26, 60, 2], [28, 64, 4], [30, 67, 2]] },
        { chords: [[5, 9, 0, 3], [0, 4, 7, 11], [1, 5, 8, 0], [5, 9, 0, 3]],
          bass: [[0, 41, 8], [8, 48, 8], [16, 49, 8], [24, 41, 8]],
          lead: [[0, 69, 4], [4, 65, 2], [6, 60, 4], [12, 64, 4], [16, 61, 4], [20, 68, 4], [24, 65, 2], [26, 63, 2], [28, 60, 4], [30, 65, 2]] }
      ]
    }
  };

  function ensureContext() {
    if (context) return context;
    const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch (err) {
      return null;
    }
    return context;
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* A pulse wave of arbitrary duty cycle, built from its Fourier series. That
     duty-cycle bite is what makes chip music sound like chip music. */
  const waveCache = {};
  function pulseWave(ctx, duty) {
    const key = 'd' + duty;
    if (waveCache[key]) return waveCache[key];
    const harmonics = 32;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let k = 1; k <= harmonics; k++) {
      imag[k] = Math.sin(Math.PI * k * duty) / (Math.PI * k);
    }
    waveCache[key] = ctx.createPeriodicWave(real, imag);
    return waveCache[key];
  }

  /* The PSG noise channel is coarse, so the noise is quantised to 16 levels. */
  let noiseCache = null;
  function noiseBuffer(ctx) {
    if (noiseCache) return noiseCache;
    noiseCache = ctx.createBuffer(1, Math.max(1024, Math.floor(ctx.sampleRate * 0.4)), ctx.sampleRate);
    const data = noiseCache.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.round((Math.random() * 2 - 1) * 15) / 15;
    }
    return noiseCache;
  }

  function noiseHit(ctx, at, duration, filterType, freq, gain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = freq || 1200;
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(ctx.destination);
    src.start(at);
    src.stop(at + duration + 0.02);
  }

  /* Music sits on its own bus: a long, dull feedback delay (a empty corridor,
     not a chiptune echo) and a gain that fades in rather than snapping on. */
  let bus = null;
  let busDelay = null;
  let busFeedback = null;
  function musicBus(ctx) {
    if (bus) return bus;
    bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(ctx.destination);
    busDelay = ctx.createDelay(0.8);
    busDelay.delayTime.value = 0.3;
    busFeedback = ctx.createGain();
    busFeedback.gain.value = 0.22;
    const cut = ctx.createBiquadFilter();
    cut.type = 'lowpass';
    cut.frequency.value = 1100;
    bus.connect(busDelay);
    busDelay.connect(busFeedback);
    busFeedback.connect(busDelay);
    busDelay.connect(cut);
    cut.connect(ctx.destination);
    return bus;
  }

  function applyEcho(ctx) {
    const b = musicBus(ctx);
    const echo = track().echo;
    if (busDelay && echo !== undefined) {
      busDelay.delayTime.value = echo;
      busFeedback.gain.value = Math.min(0.3, 0.12 + echo * 0.35 + tension * 0.002);
    }
    return b;
  }

  function tone(freq, duration, type, gain, start) {
    const ctx = ensureContext();
    if (!ctx) return;
    const at = start === undefined ? ctx.currentTime : start;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain || 0.12, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  function flick(gain) {
    const ctx = ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime;
    const source = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    source.type = 'square';
    source.frequency.setValueAtTime(900, start);
    source.frequency.exponentialRampToValueAtTime(240, start + 0.05);
    filter.type = 'highpass';
    filter.frequency.value = 260;
    env.gain.setValueAtTime(gain || 0.05, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
    source.connect(filter);
    filter.connect(env);
    env.connect(ctx.destination);
    source.start(start);
    source.stop(start + 0.09);
  }

  function whoosh(duration, gain) {
    const ctx = ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime;
    const source = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    source.type = 'sawtooth';
    source.frequency.setValueAtTime(220, start);
    source.frequency.exponentialRampToValueAtTime(120, start + duration);
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    env.gain.setValueAtTime(gain || 0.05, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(ctx.destination);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  function burst(duration, gain) {
    const ctx = ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime;
    const source = ctx.createOscillator();
    const env = ctx.createGain();
    source.type = 'square';
    source.frequency.setValueAtTime(140, start);
    source.frequency.exponentialRampToValueAtTime(60, start + duration);
    env.gain.setValueAtTime(gain || 0.1, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(env);
    env.connect(ctx.destination);
    source.start(start);
    source.stop(start + duration);
  }

  /* ---------- the obstacle sound library ---------- */

  function bark(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    for (let i = 0; i < 2; i++) {
      const start = at + i * 0.17;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(330, start);
      osc.frequency.exponentialRampToValueAtTime(140, start + 0.09);
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      env.gain.setValueAtTime(0.13, start);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(filter);
      filter.connect(env);
      env.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.14);
    }
  }

  function whine(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, at);
    osc.frequency.exponentialRampToValueAtTime(1450, at + 0.22);
    env.gain.setValueAtTime(0.05, at);
    env.gain.linearRampToValueAtTime(0.02, at + 0.22);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.36);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.4);
  }

  function screech(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1700, at);
    osc.frequency.exponentialRampToValueAtTime(2600, at + 0.18);
    filter.type = 'bandpass';
    filter.frequency.value = 2200;
    env.gain.setValueAtTime(0.045, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    osc.connect(filter);
    filter.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.36);
    noiseHit(ctx, at + 0.05, 0.22, 'bandpass', 2500, 0.03);
  }

  function steps(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    for (let i = 0; i < 3; i++) {
      noiseHit(ctx, at + i * 0.11, 0.06, 'lowpass', 320, 0.07 - i * 0.015);
    }
  }

  function snore(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    for (let i = 0; i < 3; i++) {
      noiseHit(ctx, at + i * 0.2, 0.16, 'lowpass', 260, 0.05 + i * 0.01);
    }
  }

  function hiss(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    noiseHit(ctx, at, 0.3, 'bandpass', 1300, 0.04);
  }

  function clang(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    noiseHit(ctx, at, 0.04, 'highpass', 2000, 0.08);
    [520, 780, 1180, 1620].forEach(function (f, i) {
      tone(f, 0.3 - i * 0.05, 'sine', 0.05 - i * 0.01, at + 0.01 * i);
    });
  }

  function clank(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    clang(at);
    noiseHit(ctx, at + 0.13, 0.05, 'bandpass', 900, 0.05);
  }

  function latch(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    tone(1900, 0.025, 'square', 0.06, at);
    tone(160, 0.07, 'sine', 0.06, at + 0.02);
  }

  function ping(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    tone(1400, 0.1, 'sine', 0.06, at);
    tone(1400, 0.08, 'sine', 0.02, at + 0.16);
  }

  function hum(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 88;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.035, at + 0.1);
    env.gain.linearRampToValueAtTime(0.02, at + 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.55);
    tone(91, 0.45, 'sine', 0.015, at + 0.05);
  }

  function shot(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    noiseHit(ctx, at, 0.07, 'highpass', 1500, 0.12);
    tone(220, 0.14, 'sine', 0.07, at);
  }

  function boom(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, at);
    osc.frequency.exponentialRampToValueAtTime(44, at + 0.34);
    env.gain.setValueAtTime(0.14, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.45);
  }

  function sizzle(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    noiseHit(ctx, at, 0.4, 'highpass', 2600, 0.035);
  }

  function rattle(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    for (let i = 0; i < 6; i++) {
      noiseHit(ctx, at + i * 0.03, 0.02, 'bandpass', 2200, 0.05);
    }
  }

  function whistle(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(560, at);
    osc.frequency.linearRampToValueAtTime(1200, at + 0.18);
    osc.frequency.linearRampToValueAtTime(820, at + 0.4);
    env.gain.setValueAtTime(0.05, at);
    env.gain.linearRampToValueAtTime(0.06, at + 0.18);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.5);
  }

  function beep(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    tone(880, 0.06, 'square', 0.055, at);
    tone(880, 0.06, 'square', 0.055, at + 0.12);
  }

  function stumble(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    noiseHit(ctx, at, 0.24, 'lowpass', 240, 0.09);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, at);
    osc.frequency.exponentialRampToValueAtTime(110, at + 0.22);
    env.gain.setValueAtTime(0.05, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  function cam(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    tone(2400, 0.02, 'square', 0.05, at);
    tone(2400, 0.02, 'square', 0.04, at + 0.09);
  }

  function drip(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    tone(1000, 0.06, 'sine', 0.05, at);
    tone(620, 0.06, 'sine', 0.04, at + 0.26);
  }

  function sweep(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, at);
    filter.frequency.linearRampToValueAtTime(2400, at + 0.5);
    env.gain.setValueAtTime(0.02, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
    src.connect(filter);
    filter.connect(env);
    env.connect(ctx.destination);
    src.start(at);
    src.stop(at + 0.6);
  }

  function servo(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, at);
    osc.frequency.exponentialRampToValueAtTime(620, at + 0.16);
    env.gain.setValueAtTime(0.045, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.24);
  }

  function siren(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, at);
    osc.frequency.linearRampToValueAtTime(760, at + 0.3);
    osc.frequency.linearRampToValueAtTime(430, at + 0.6);
    env.gain.setValueAtTime(0.06, at);
    env.gain.linearRampToValueAtTime(0.07, at + 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.75);
  }

  /* ---------- the music engine ---------- */

  function track() { return TRACKS[trackName]; }

  function bpm() {
    return track().bpm + Math.min(10, Math.round(tension * 0.35));
  }

  /* The pad: the whole chord held, swelling slowly, plus a root an octave
     lower that is barely audible. This is the body of the bed. */
  function padChord(at, pcs, gate) {
    const ctx = ensureContext();
    if (!ctx) return;
    pcs.forEach(function (pc, k) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(48 + pc) * (1 + (k % 2 ? 0.004 : -0.003));
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.022, at + gate * 0.35);
      env.gain.linearRampToValueAtTime(0.015, at + gate * 0.8);
      env.gain.linearRampToValueAtTime(0, at + gate);
      osc.connect(env);
      env.connect(musicBus(ctx));
      osc.start(at);
      osc.stop(at + gate + 0.05);
    });
    const drone = ctx.createOscillator();
    const dEnv = ctx.createGain();
    drone.type = 'triangle';
    drone.frequency.value = midiToFreq(36 + pcs[0]);
    dEnv.gain.setValueAtTime(0, at);
    dEnv.gain.linearRampToValueAtTime(0.03, at + gate * 0.3);
    dEnv.gain.linearRampToValueAtTime(0, at + gate);
    drone.connect(dEnv);
    dEnv.connect(musicBus(ctx));
    drone.start(at);
    drone.stop(at + gate + 0.05);
  }

  function bassNote(at, note, gate) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const cut = ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(note);
    cut.type = 'lowpass';
    cut.frequency.value = 320;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.10, at + 0.03);
    env.gain.setValueAtTime(0.09, at + gate * 0.65);
    env.gain.linearRampToValueAtTime(0, at + gate);
    osc.connect(cut);
    cut.connect(env);
    env.connect(musicBus(ctx));
    osc.start(at);
    osc.stop(at + gate + 0.02);
  }

  /* Soft pulse with a slow vibrato: a cheap stand-in for a bowed string. */
  function leadNote(at, note, gate, duty, gain) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const wave = pulseWave(ctx, duty);
    if (wave) osc.setPeriodicWave(wave);
    osc.frequency.value = midiToFreq(note);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.04);
    env.gain.setValueAtTime(gain * 0.85, at + gate * 0.7);
    env.gain.linearRampToValueAtTime(0, at + gate);
    if (gate > 0.3) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 4.5;
      lfoGain.gain.value = 2.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + gate);
    }
    osc.connect(env);
    env.connect(musicBus(ctx));
    osc.start(at);
    osc.stop(at + gate + 0.02);
  }

  function kick(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(38, at + 0.14);
    env.gain.setValueAtTime(0.13, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(env);
    env.connect(musicBus(ctx));
    osc.start(at);
    osc.stop(at + 0.25);
  }

  function snare(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    env.gain.setValueAtTime(0.045, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    src.connect(filter);
    filter.connect(env);
    env.connect(musicBus(ctx));
    src.start(at);
    src.stop(at + 0.16);
  }

  /* A quiet clock ticking, not a hi-hat. */
  function tick(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 2600;
    env.gain.setValueAtTime(0.012, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(filter);
    filter.connect(env);
    env.connect(musicBus(ctx));
    src.start(at);
    src.stop(at + 0.08);
  }

  /* Distant radio blip: only once the alarm is already high. */
  function blip(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, at);
    osc.frequency.exponentialRampToValueAtTime(700, at + 0.2);
    env.gain.setValueAtTime(0.016, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    osc.connect(env);
    env.connect(musicBus(ctx));
    osc.start(at);
    osc.stop(at + 0.3);
  }

  function kick(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.11);
    env.gain.setValueAtTime(0.18, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    osc.connect(env);
    env.connect(musicBus(ctx));
    osc.start(at);
    osc.stop(at + 0.2);
  }

  function snare(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    env.gain.setValueAtTime(0.10, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    src.connect(filter);
    filter.connect(env);
    env.connect(musicBus(ctx));
    src.start(at);
    src.stop(at + 0.12);
  }

  function hat(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = 'highpass';
    filter.frequency.value = 3000;
    env.gain.setValueAtTime(0.03, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    src.connect(filter);
    filter.connect(env);
    env.connect(musicBus(ctx));
    src.start(at);
    src.stop(at + 0.06);
  }

  function playStep(t, i, at, eighth) {
    const phrase = t.phrases[Math.floor(step / t.steps) % t.phrases.length];
    const span = t.steps / phrase.chords.length;
    const chord = phrase.chords[Math.floor(i / span)];

    /* One chord held for a whole span: that is the bed. */
    if (i % span === 0) padChord(at, chord, span * eighth);

    phrase.bass.forEach(function (n) {
      if (n[0] === i) bassNote(at, n[1], n[2] * eighth);
    });
    phrase.lead.forEach(function (n) {
      if (n[0] === i) leadNote(at, n[1], n[2] * eighth, t.leadDuty, 0.05);
    });

    if (t.drums.kick.indexOf(i) >= 0) kick(at);
    if (t.drums.snare.indexOf(i) >= 0) snare(at);
    if (t.drums.hat.indexOf(i) >= 0) tick(at);

    /* The alarm thins the bed out into nervous chatter, then distant blips. */
    if (tension >= 30 && i % 4 === 2) {
      leadNote(at, chord[(i / 2) % chord.length] + 36, eighth * 0.6, 0.125, 0.022);
    }
    if (tension >= 42 && i % 8 === 6) blip(at);
  }

  /* Keep a rolling window of notes scheduled ahead of the clock: each tick
     schedules everything that falls inside the next LOOKAHEAD seconds. */
  function scheduleAhead() {
    const ctx = ensureContext();
    if (!ctx || !musicOn || muted) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    const t = track();
    const eighth = 60 / bpm() / 2;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    const horizon = ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (nextTime < horizon && guard < 96) {
      const i = step % t.steps;
      const at = (i % 2 === 1) ? nextTime + t.swing * eighth : nextTime;
      playStep(t, i, at, eighth);
      nextTime += eighth;
      step += 1;
      guard += 1;
    }
  }

  function startMusic() {
    if (scheduler) return;
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    const busGain = applyEcho(ctx);
    busGain.gain.cancelScheduledValues(ctx.currentTime);
    busGain.gain.setValueAtTime(0, ctx.currentTime);
    busGain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 1.2);
    nextTime = ctx.currentTime + 0.05;
    step = 0;
    scheduleAhead();
    scheduler = setInterval(scheduleAhead, 250);
  }

  function stopMusic() {
    nextTime = 0;
    step = 0;
    const ctx = ensureContext();
    if (ctx && bus) {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    }
    if (scheduler) {
      clearInterval(scheduler);
      scheduler = null;
    }
    musicOn = false;
  }

  function play(name, intensity) {
    if (muted) return;
    const now = context ? context.currentTime : 0;
    if (name === 'play') {
      tone(330, 0.1, 'triangle', 0.1);
    } else if (name === 'disarm') {
      tone(392, 0.12, 'triangle', 0.12);
      tone(587, 0.14, 'triangle', 0.1, 0.1);
    } else if (name === 'knockOut') {
      burst(0.22, 0.12);
    } else if (name === 'alarm') {
      const level = Math.max(0, Math.min(50, intensity || 0));
      tone(180 + level * 6, 0.2, 'sawtooth', 0.06 + level * 0.002);
    } else if (name === 'deal' || name === 'draw') {
      flick(0.05);
    } else if (name === 'slide') {
      whoosh(0.2, 0.05);
    } else if (name === 'scroll') {
      flick(0.035);
    } else if (name === 'exit') {
      burst(0.26, 0.09);
    } else if (name === 'flip') {
      flick(0.04);
    } else if (name === 'mission') {
      [392, 494, 587, 784].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.12, i * 0.12); });
    } else if (name === 'fanfare') {
      [294, 392, 494, 587, 784].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.16, i * 0.13); });
      [147, 196, 247, 294, 392].forEach(function (f, i) { tone(f, 0.4, 'sawtooth', 0.07, i * 0.13); });
      tone(784, 0.7, 'triangle', 0.12, 0.66);
      tone(1176, 0.5, 'sine', 0.05, 0.7);
    } else if (name === 'bin') {
      tone(150, 0.12, 'square', 0.08);
      tone(720, 0.03, 'square', 0.05, 0.06);
    } else if (name === 'undo') {
      whoosh(0.28, 0.05);
    } else if (name === 'gameOver') {
      [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.25, 'sawtooth', 0.12, i * 0.16); });
    } else if (name === 'bark') {
      bark(now);
    } else if (name === 'whine') {
      whine(now);
    } else if (name === 'screech') {
      screech(now);
    } else if (name === 'steps') {
      steps(now);
    } else if (name === 'snore') {
      snore(now);
    } else if (name === 'hiss') {
      hiss(now);
    } else if (name === 'clang') {
      clang(now);
    } else if (name === 'clank') {
      clank(now);
    } else if (name === 'latch') {
      latch(now);
    } else if (name === 'ping') {
      ping(now);
    } else if (name === 'hum') {
      hum(now);
    } else if (name === 'shot') {
      shot(now);
    } else if (name === 'boom') {
      boom(now);
    } else if (name === 'sizzle') {
      sizzle(now);
    } else if (name === 'rattle') {
      rattle(now);
    } else if (name === 'whistle') {
      whistle(now);
    } else if (name === 'beep') {
      beep(now);
    } else if (name === 'stumble') {
      stumble(now);
    } else if (name === 'cam') {
      cam(now);
    } else if (name === 'drip') {
      drip(now);
    } else if (name === 'sweep') {
      sweep(now);
    } else if (name === 'servo') {
      servo(now);
    } else if (name === 'siren') {
      siren(now);
    }
  }

  function setTension(level) {
    tension = Math.max(0, Math.min(50, level || 0));
  }

  function toggle() {
    muted = !muted;
    if (!muted) {
      const ctx = ensureContext();
      if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
      if (musicOn) startMusic();
    }
    return !muted;
  }

  function toggleMusic() {
    musicOn = !musicOn;
    if (musicOn) {
      muted = false;
      startMusic();
    } else {
      stopMusic();
    }
    return musicOn;
  }

  function setTrack(name) {
    if (!TRACKS[name]) return trackName;
    trackName = name;
    step = 0;
    const ctx = ensureContext();
    if (ctx) applyEcho(ctx);
    return trackName;
  }

  return {
    play: play,
    toggle: toggle,
    toggleMusic: toggleMusic,
    setTension: setTension,
    tracks: function () {
      return Object.keys(TRACKS).map(function (id) {
        return {
          id: id,
          name: TRACKS[id].name,
          bpm: TRACKS[id].bpm,
          steps: TRACKS[id].steps,
          phrases: TRACKS[id].phrases.length,
          data: TRACKS[id].phrases
        };
      });
    },
    setTrack: setTrack,
    currentTrack: function () { return trackName; },
    trackName: function () { return track().name; },
    isMuted: function () { return muted; },
    isMusicOn: function () { return musicOn; }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
