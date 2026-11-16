'use strict';

/* Everything is generated with the Web Audio API — no audio files, no CDNs.

   Two layers:
     1. Diegetic SFX. Obstacles get a sound that matches what they are: a guard
        dog barks, a radio tower hisses, a prison door clangs. The engine records
        what happened in state.events and js/table.js plays the cue for each card
        as it moves.
     2. The score: five driving spy grooves (syncopated pulse bass, chord stabs,
        a hooky lead with vibrato and pitch bends, backbeat drums), two phrases
        each, in the Jan Hammer / Crockett vein. Chosen from the top bar.

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

  /* Five beds, two phrases each. The grid is a sixteenth note, so the lines can
     syncopate; notes are [step, midi, length] and an optional fourth value is the
     pitch a note bends *in* from — that slide is the Crockett signature. */
  const TRACKS = {
    nightline: {
      name: 'Nightline Shunt', bpm: 116, steps: 32, swing: 0.06, echo: 0.22, leadDuty: 0.3,
      drums: { kick: [0, 6, 8, 16, 22, 24], snare: [8, 24], ghost: [4, 12, 20, 28], hat: [2, 4, 6, 10, 12, 14, 18, 20, 22, 26, 28, 30] },
      stab: [3, 7, 11, 15, 19, 23, 27, 31],
      phrases: [
        { chords: [[9, 0, 4, 7], [9, 0, 4, 7], [5, 9, 0, 4], [4, 8, 11, 2]],
          bass: [[0, 45, 2], [2, 45, 1], [3, 45, 1], [4, 45, 2], [6, 45, 1], [7, 45, 1],
                 [8, 45, 2], [10, 45, 1], [11, 45, 1], [12, 45, 2], [14, 52, 1], [15, 45, 1],
                 [16, 41, 2], [18, 41, 1], [19, 41, 1], [20, 41, 2], [22, 41, 1], [23, 41, 1],
                 [24, 40, 2], [26, 40, 1], [27, 40, 1], [28, 40, 2], [30, 44, 1], [31, 40, 1]],
          lead: [[0, 69, 2], [2, 67, 2], [4, 69, 2], [6, 72, 2, 69], [8, 69, 2], [10, 72, 2], [12, 69, 2], [14, 67, 2],
                 [16, 65, 2], [18, 69, 2], [20, 72, 2], [22, 69, 2], [24, 64, 2], [26, 68, 2], [28, 71, 2], [30, 68, 2]] },
        { chords: [[9, 0, 4, 7], [2, 5, 9, 0], [5, 9, 0, 4], [4, 8, 11, 2]],
          bass: [[0, 45, 2], [2, 45, 1], [3, 45, 1], [4, 45, 2], [6, 45, 1], [7, 45, 1],
                 [8, 38, 2], [10, 38, 1], [11, 38, 1], [12, 38, 2], [14, 45, 1], [15, 38, 1],
                 [16, 41, 2], [18, 41, 1], [19, 41, 1], [20, 41, 2], [22, 41, 1], [23, 41, 1],
                 [24, 40, 2], [26, 40, 1], [27, 40, 1], [28, 40, 2], [30, 44, 1], [31, 40, 1]],
          lead: [[0, 72, 2], [2, 69, 2], [4, 72, 2], [6, 72, 2, 69], [8, 74, 2], [10, 72, 2], [12, 69, 2], [14, 72, 2],
                 [16, 65, 2], [18, 69, 2], [20, 65, 2], [22, 69, 2], [24, 68, 2], [26, 71, 2], [28, 64, 2], [30, 68, 2]] }
      ]
    },
    waltz: {
      name: 'Cold War Chase', bpm: 112, steps: 32, swing: 0, echo: 0.24, leadDuty: 0.25,
      drums: { kick: [0, 8, 12, 16, 24, 28], snare: [8, 24], ghost: [6, 14, 22, 30], hat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
      stab: [5, 13, 21, 29],
      phrases: [
        { chords: [[2, 5, 9, 0], [2, 5, 9, 0], [7, 10, 2, 5], [0, 4, 7, 11]],
          bass: [[0, 50, 2], [2, 50, 1], [3, 50, 1], [4, 50, 2], [6, 50, 1], [7, 50, 1],
                 [8, 50, 2], [10, 50, 1], [11, 50, 1], [12, 50, 2], [14, 57, 1], [15, 50, 1],
                 [16, 43, 2], [18, 43, 1], [19, 43, 1], [20, 43, 2], [22, 43, 1], [23, 43, 1],
                 [24, 48, 2], [26, 48, 1], [27, 48, 1], [28, 48, 2], [30, 55, 1], [31, 48, 1]],
          lead: [[0, 74, 2], [2, 77, 2], [4, 74, 2], [6, 69, 2], [8, 69, 2], [10, 74, 2], [12, 77, 2], [14, 74, 2],
                 [16, 67, 2], [18, 70, 2], [20, 74, 2], [22, 70, 2], [24, 72, 2], [26, 76, 2], [28, 72, 2], [30, 67, 2]] },
        { chords: [[2, 5, 9, 0], [7, 10, 2, 5], [0, 4, 7, 11], [9, 1, 4, 6]],
          bass: [[0, 50, 2], [2, 50, 1], [3, 50, 1], [4, 50, 2], [6, 50, 1], [7, 50, 1],
                 [8, 43, 2], [10, 43, 1], [11, 43, 1], [12, 43, 2], [14, 50, 1], [15, 43, 1],
                 [16, 48, 2], [18, 48, 1], [19, 48, 1], [20, 48, 2], [22, 48, 1], [23, 48, 1],
                 [24, 45, 2], [26, 45, 1], [27, 45, 1], [28, 45, 2], [30, 52, 1], [31, 45, 1]],
          lead: [[0, 69, 2], [2, 74, 2], [4, 69, 2], [6, 77, 2, 74], [8, 70, 2], [10, 74, 2], [12, 70, 2], [14, 67, 2],
                 [16, 72, 2], [18, 76, 2], [20, 72, 2], [22, 67, 2], [24, 69, 2], [26, 73, 2], [28, 76, 2], [30, 73, 2]] }
      ]
    },
    deaddrop: {
      name: 'Dead Drop', bpm: 104, steps: 32, swing: 0.08, echo: 0.28, leadDuty: 0.3,
      drums: { kick: [0, 8, 16, 24], snare: [8, 24], ghost: [4, 20], hat: [4, 12, 20, 28] },
      stab: [6, 14, 22, 30],
      phrases: [
        { chords: [[9, 0, 4, 7], [9, 0, 4, 7], [5, 9, 0, 4], [5, 9, 0, 4]],
          bass: [[0, 45, 2], [2, 45, 1], [3, 45, 1], [4, 45, 2], [6, 45, 1], [7, 45, 1],
                 [8, 45, 2], [10, 45, 1], [11, 45, 1], [12, 45, 2], [14, 52, 1], [15, 45, 1],
                 [16, 41, 2], [18, 41, 1], [19, 41, 1], [20, 41, 2], [22, 41, 1], [23, 41, 1],
                 [24, 41, 2], [26, 41, 1], [27, 41, 1], [28, 41, 2], [30, 45, 1], [31, 41, 1]],
          lead: [[0, 69, 2], [2, 72, 2], [4, 69, 2], [6, 76, 2, 72], [8, 72, 2], [10, 69, 2], [12, 72, 2], [14, 67, 2],
                 [16, 65, 2], [18, 69, 2], [20, 72, 2], [22, 69, 2], [24, 65, 2], [26, 69, 2], [28, 72, 2], [30, 69, 2]] },
        { chords: [[2, 5, 9, 0], [2, 5, 9, 0], [9, 0, 4, 7], [5, 9, 0, 4]],
          bass: [[0, 38, 2], [2, 38, 1], [3, 38, 1], [4, 38, 2], [6, 38, 1], [7, 38, 1],
                 [8, 38, 2], [10, 38, 1], [11, 38, 1], [12, 38, 2], [14, 45, 1], [15, 38, 1],
                 [16, 45, 2], [18, 45, 1], [19, 45, 1], [20, 45, 2], [22, 45, 1], [23, 45, 1],
                 [24, 41, 2], [26, 41, 1], [27, 41, 1], [28, 41, 2], [30, 45, 1], [31, 41, 1]],
          lead: [[0, 74, 2], [2, 69, 2], [4, 74, 2], [6, 72, 2], [8, 69, 2], [10, 74, 2], [12, 77, 2], [14, 74, 2],
                 [16, 69, 2], [18, 72, 2], [20, 76, 2], [22, 72, 2], [24, 65, 2], [26, 69, 2], [28, 72, 2], [30, 69, 2]] }
      ]
    },
    safehouse: {
      name: 'Safehouse Boogie', bpm: 124, steps: 32, swing: 0.1, echo: 0.18, leadDuty: 0.25,
      drums: { kick: [0, 6, 8, 16, 22, 24], snare: [8, 24], ghost: [2, 10, 18, 26], hat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
      stab: [4, 12, 20, 28],
      phrases: [
        { chords: [[4, 8, 11, 2], [9, 0, 4, 7], [2, 5, 9, 0], [5, 9, 0, 4]],
          bass: [[0, 40, 2], [2, 40, 1], [3, 40, 1], [4, 40, 2], [6, 40, 1], [7, 40, 1],
                 [8, 45, 2], [10, 45, 1], [11, 45, 1], [12, 45, 2], [14, 52, 1], [15, 45, 1],
                 [16, 38, 2], [18, 38, 1], [19, 38, 1], [20, 38, 2], [22, 38, 1], [23, 38, 1],
                 [24, 41, 2], [26, 41, 1], [27, 41, 1], [28, 41, 2], [30, 45, 1], [31, 41, 1]],
          lead: [[0, 64, 2], [2, 68, 2], [4, 71, 2], [6, 68, 2], [8, 69, 2], [10, 72, 2], [12, 76, 2], [14, 72, 2],
                 [16, 74, 2], [18, 69, 2], [20, 72, 2], [22, 69, 2], [24, 65, 2], [26, 69, 2], [28, 72, 2], [30, 69, 2]] },
        { chords: [[4, 8, 11, 2], [2, 5, 9, 0], [9, 0, 4, 7], [5, 9, 0, 4]],
          bass: [[0, 40, 2], [2, 40, 1], [3, 40, 1], [4, 40, 2], [6, 44, 1], [7, 40, 1],
                 [8, 38, 2], [10, 38, 1], [11, 38, 1], [12, 38, 2], [14, 45, 1], [15, 38, 1],
                 [16, 45, 2], [18, 45, 1], [19, 45, 1], [20, 45, 2], [22, 45, 1], [23, 45, 1],
                 [24, 41, 2], [26, 41, 1], [27, 41, 1], [28, 41, 2], [30, 45, 1], [31, 41, 1]],
          lead: [[0, 68, 2], [2, 71, 2], [4, 68, 2], [6, 64, 2], [8, 74, 2], [10, 69, 2], [12, 72, 2], [14, 69, 2],
                 [16, 69, 2], [18, 72, 2], [20, 76, 2], [22, 72, 2], [24, 65, 2], [26, 69, 2], [28, 72, 2], [30, 65, 2]] }
      ]
    },
    blackout: {
      name: 'Blackout March', bpm: 112, steps: 32, swing: 0, echo: 0.20, leadDuty: 0.3,
      drums: { kick: [0, 4, 8, 12, 16, 20, 24, 28], snare: [8, 24], ghost: [6, 14, 22, 30], hat: [2, 6, 10, 14, 18, 22, 26, 30] },
      stab: [2, 10, 18, 26],
      phrases: [
        { chords: [[5, 9, 0, 3], [1, 5, 8, 0], [5, 9, 0, 3], [0, 4, 7, 11]],
          bass: [[0, 41, 2], [2, 41, 1], [3, 41, 1], [4, 41, 2], [6, 41, 1], [7, 41, 1],
                 [8, 49, 2], [10, 49, 1], [11, 49, 1], [12, 49, 2], [14, 41, 1], [15, 49, 1],
                 [16, 41, 2], [18, 41, 1], [19, 41, 1], [20, 41, 2], [22, 41, 1], [23, 41, 1],
                 [24, 48, 2], [26, 48, 1], [27, 48, 1], [28, 48, 2], [30, 55, 1], [31, 48, 1]],
          lead: [[0, 65, 2], [2, 69, 2], [4, 65, 2], [6, 63, 2], [8, 60, 2], [10, 68, 2], [12, 60, 2], [14, 68, 2],
                 [16, 65, 2], [18, 63, 2], [20, 69, 2], [22, 65, 2], [24, 60, 2], [26, 64, 2], [28, 67, 2], [30, 64, 2]] },
        { chords: [[5, 9, 0, 3], [0, 4, 7, 11], [1, 5, 8, 0], [5, 9, 0, 3]],
          bass: [[0, 41, 2], [2, 41, 1], [3, 41, 1], [4, 41, 2], [6, 41, 1], [7, 41, 1],
                 [8, 48, 2], [10, 48, 1], [11, 48, 1], [12, 48, 2], [14, 48, 1], [15, 48, 1],
                 [16, 49, 2], [18, 49, 1], [19, 49, 1], [20, 49, 2], [22, 49, 1], [23, 49, 1],
                 [24, 41, 2], [26, 41, 1], [27, 41, 1], [28, 41, 2], [30, 45, 1], [31, 41, 1]],
          lead: [[0, 65, 2], [2, 69, 2], [4, 65, 2], [6, 63, 2], [8, 60, 2], [10, 64, 2], [12, 67, 2], [14, 64, 2],
                 [16, 61, 2], [18, 68, 2], [20, 61, 2], [22, 68, 2], [24, 65, 2], [26, 69, 2], [28, 65, 2], [30, 63, 2]] }
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
    return track().bpm + Math.min(8, Math.round(tension * 0.25));
  }

  /* The bed: the chord held quietly under everything, so the groove has a floor. */
  function padChord(at, pcs, gate) {
    const ctx = ensureContext();
    if (!ctx) return;
    pcs.forEach(function (pc, k) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(48 + pc) * (1 + (k % 2 ? 0.004 : -0.003));
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.016, at + gate * 0.3);
      env.gain.linearRampToValueAtTime(0.011, at + gate * 0.85);
      env.gain.linearRampToValueAtTime(0, at + gate);
      osc.connect(env);
      env.connect(musicBus(ctx));
      osc.start(at);
      osc.stop(at + gate + 0.05);
    });
  }

  /* Funky chord stabs on the off beats — the driving part of the bed. */
  function stab(at, pcs, gate) {
    const ctx = ensureContext();
    if (!ctx) return;
    pcs.forEach(function (pc) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const wave = pulseWave(ctx, 0.4);
      if (wave) osc.setPeriodicWave(wave);
      osc.frequency.value = midiToFreq(60 + pc);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.024, at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, at + gate);
      osc.connect(env);
      env.connect(musicBus(ctx));
      osc.start(at);
      osc.stop(at + gate + 0.02);
    });
  }

  /* Syncopated pulse bass with a lowpass: the groove's engine. */
  function bassNote(at, note, gate) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const cut = ctx.createBiquadFilter();
    const wave = pulseWave(ctx, 0.5);
    if (wave) osc.setPeriodicWave(wave);
    osc.frequency.value = midiToFreq(note);
    cut.type = 'lowpass';
    cut.frequency.value = 420;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.13, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + gate);
    osc.connect(cut);
    cut.connect(env);
    env.connect(musicBus(ctx));
    osc.start(at);
    osc.stop(at + gate + 0.02);
  }

  /* The hook: a pulse lead with vibrato, and an optional slide in from a lower
     pitch — the Jan Hammer move. */
  function leadNote(at, note, gate, duty, gain, from) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const wave = pulseWave(ctx, duty);
    if (wave) osc.setPeriodicWave(wave);
    if (from !== undefined) {
      osc.frequency.setValueAtTime(midiToFreq(from), at);
      osc.frequency.linearRampToValueAtTime(midiToFreq(note), at + 0.05);
    } else {
      osc.frequency.value = midiToFreq(note);
    }
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.02);
    env.gain.setValueAtTime(gain * 0.8, at + gate * 0.7);
    env.gain.linearRampToValueAtTime(0, at + gate);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + gate);
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
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.09);
    env.gain.setValueAtTime(0.16, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    osc.connect(env);
    env.connect(musicBus(ctx));
    osc.start(at);
    osc.stop(at + 0.18);
  }

  function snare(at, gain) {
    const ctx = ensureContext();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    src.connect(filter);
    filter.connect(env);
    env.connect(musicBus(ctx));
    src.start(at);
    src.stop(at + 0.14);
  }

  function hat(at, gain) {
    const ctx = ensureContext();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = 'highpass';
    filter.frequency.value = 5000;
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(filter);
    filter.connect(env);
    env.connect(musicBus(ctx));
    src.start(at);
    src.stop(at + 0.07);
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

  function playStep(t, i, at, grid) {
    const phrase = t.phrases[Math.floor(step / t.steps) % t.phrases.length];
    const span = t.steps / phrase.chords.length;
    const chord = phrase.chords[Math.floor(i / span)];

    if (i % span === 0) padChord(at, chord, span * grid);
    if (t.stab && t.stab.indexOf(i) >= 0) stab(at, chord, grid * 2);

    phrase.bass.forEach(function (n) {
      if (n[0] === i) bassNote(at, n[1], n[2] * grid);
    });
    phrase.lead.forEach(function (n) {
      if (n[0] === i) leadNote(at, n[1], n[2] * grid, t.leadDuty, 0.06, n[3]);
    });

    if (t.drums.kick.indexOf(i) >= 0) kick(at);
    if (t.drums.snare.indexOf(i) >= 0) snare(at, 0.07);
    if (t.drums.ghost && t.drums.ghost.indexOf(i) >= 0) snare(at, 0.03);
    if (t.drums.hat.indexOf(i) >= 0) hat(at, 0.018);

    /* The alarm pushes the groove: extra stabs, then distant radio blips. */
    if (tension >= 30 && i % 4 === 2) stab(at, chord, grid * 2);
    if (tension >= 42 && i % 8 === 6) blip(at);
  }

  /* Keep a rolling window of notes scheduled ahead of the clock: each tick
     schedules everything that falls inside the next LOOKAHEAD seconds. */
  function scheduleAhead() {
    const ctx = ensureContext();
    if (!ctx || !musicOn || muted) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    const t = track();
    const grid = 60 / bpm() / 4;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    const horizon = ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (nextTime < horizon && guard < 128) {
      const i = step % t.steps;
      const at = (i % 2 === 1) ? nextTime + t.swing * grid : nextTime;
      playStep(t, i, at, grid);
      nextTime += grid;
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
    busGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 0.8);
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
          drums: TRACKS[id].drums,
          stab: TRACKS[id].stab,
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
