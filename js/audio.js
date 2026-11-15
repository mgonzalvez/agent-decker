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

  /* Two phrases per bed so the tune develops instead of looping one bar. */
  const TRACKS = {
    nightline: {
      name: 'Nightline Shunt', bpm: 104, steps: 16, swing: 0,
      drums: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] },
      phrases: [
        { bass: [45, 0, 45, 45, 41, 0, 41, 41, 38, 0, 38, 38, 40, 40, 44, 40],
          lead: [69, 72, 76, 72, 65, 69, 72, 69, 74, 77, 72, 69, 64, 68, 71, 68],
          arp: [[57, 60, 64], [53, 57, 60], [50, 53, 57, 48], [52, 56, 59]] },
        { bass: [45, 0, 45, 45, 38, 0, 38, 38, 41, 0, 41, 41, 40, 44, 40, 44],
          lead: [76, 72, 69, 72, 74, 69, 65, 69, 77, 72, 69, 72, 71, 68, 64, 68],
          arp: [[57, 60, 64], [50, 53, 57, 48], [53, 57, 60], [52, 56, 59]] }
      ],
      leadDuty: 0.25, arpDuty: 0.125, echo: 0.30
    },
    waltz: {
      name: 'Cold War Waltz', bpm: 92, steps: 12, swing: 0,
      drums: { kick: [0, 6], snare: [3, 9], hat: [2, 4, 8, 10] },
      phrases: [
        { bass: [50, 0, 57, 0, 46, 0, 53, 0, 45, 0, 52, 0],
          lead: [74, 0, 72, 69, 70, 0, 74, 77, 69, 0, 72, 76],
          arp: [[50, 53, 57, 48], [46, 50, 53], [45, 48, 52]] },
        { bass: [43, 0, 50, 0, 50, 0, 57, 0, 45, 0, 52, 0],
          lead: [67, 0, 70, 74, 74, 0, 72, 69, 69, 0, 72, 76],
          arp: [[43, 46, 50], [50, 53, 57, 48], [45, 48, 52]] }
      ],
      leadDuty: 0.5, arpDuty: 0.25, echo: 0.26
    },
    deaddrop: {
      name: 'Dead Drop', bpm: 86, steps: 16, swing: 0,
      drums: { kick: [0, 8], snare: [], hat: [8] },
      phrases: [
        { bass: [45, 0, 0, 0, 41, 0, 0, 0, 38, 0, 0, 0, 40, 0, 0, 0],
          lead: [0, 0, 0, 69, 0, 0, 0, 72, 0, 0, 0, 77, 0, 0, 0, 71],
          arp: [[57, 60, 64], [53, 57, 60], [50, 53, 57, 48], [52, 56, 59]] },
        { bass: [45, 0, 0, 0, 38, 0, 0, 0, 41, 0, 0, 0, 40, 0, 44, 0],
          lead: [0, 0, 0, 72, 0, 0, 0, 69, 0, 0, 0, 65, 0, 0, 0, 68],
          arp: [[57, 60, 64], [50, 53, 57, 48], [53, 57, 60], [52, 56, 59]] }
      ],
      leadDuty: 0.125, arpDuty: 0.125, echo: 0.36
    },
    safehouse: {
      name: 'Safehouse Shuffle', bpm: 118, steps: 16, swing: 0.18,
      drums: { kick: [0, 6, 10], snare: [8, 14], hat: [2, 4, 6, 8, 10, 12, 14] },
      phrases: [
        { bass: [50, 53, 57, 53, 43, 46, 50, 46, 45, 52, 49, 52, 50, 53, 57, 0],
          lead: [69, 0, 74, 77, 67, 0, 70, 74, 69, 73, 76, 73, 74, 77, 69, 0],
          arp: [[50, 53, 57], [43, 46, 50], [57, 61, 64], [50, 53, 57]] },
        { bass: [50, 0, 57, 0, 41, 0, 48, 0, 43, 0, 50, 0, 52, 0, 57, 0],
          lead: [74, 77, 69, 74, 77, 72, 69, 72, 70, 74, 70, 67, 73, 76, 73, 69],
          arp: [[50, 53, 57], [41, 45, 48], [43, 46, 50], [57, 61, 64]] }
      ],
      leadDuty: 0.25, arpDuty: 0.125, echo: 0.22
    },
    blackout: {
      name: 'Blackout March', bpm: 126, steps: 16, swing: 0,
      drums: { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14], hat: [1, 3, 5, 7, 9, 11, 13, 15] },
      phrases: [
        { bass: [41, 41, 53, 41, 49, 49, 56, 49, 48, 48, 55, 48, 41, 41, 45, 41],
          lead: [53, 57, 60, 57, 61, 68, 65, 61, 60, 64, 67, 64, 53, 57, 60, 57],
          arp: [[41, 45, 48], [49, 53, 56], [48, 52, 55], [41, 45, 48, 53]] },
        { bass: [41, 41, 53, 41, 48, 48, 55, 48, 49, 49, 56, 49, 41, 41, 45, 41],
          lead: [65, 69, 65, 60, 64, 67, 72, 67, 61, 68, 65, 61, 60, 57, 53, 57],
          arp: [[41, 45, 48], [48, 52, 55], [49, 53, 56], [41, 45, 48, 53]] }
      ],
      leadDuty: 0.5, arpDuty: 0.25, echo: 0.18
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

  /* Music sits on its own bus with a feedback delay, so the chip lines have
     a little space without shipping any reverb assets. */
  let bus = null;
  let busDelay = null;
  let busFeedback = null;
  function musicBus(ctx) {
    if (bus) return bus;
    bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(ctx.destination);
    busDelay = ctx.createDelay(0.6);
    busDelay.delayTime.value = 0.2;
    busFeedback = ctx.createGain();
    busFeedback.gain.value = 0.3;
    const cut = ctx.createBiquadFilter();
    cut.type = 'lowpass';
    cut.frequency.value = 1600;
    bus.connect(busDelay);
    busDelay.connect(busFeedback);
    busFeedback.connect(busDelay);
    busDelay.connect(cut);
    cut.connect(ctx.destination);
    return bus;
  }

  function applyEcho(ctx) {
    musicBus(ctx);
    const echo = track().echo;
    if (busDelay && echo !== undefined) {
      busDelay.delayTime.value = echo;
      busFeedback.gain.value = Math.min(0.34, 0.14 + echo * 0.4);
    }
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
    return track().bpm + Math.round(tension * 0.5);
  }

  function chip(at, note, duty, gate, gain) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const wave = pulseWave(ctx, duty);
    if (wave) osc.setPeriodicWave(wave);
    osc.frequency.value = midiToFreq(note);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.006);
    env.gain.setValueAtTime(gain, at + gate * 0.7);
    env.gain.linearRampToValueAtTime(0, at + gate);
    osc.connect(env);
    env.connect(musicBus(ctx));
    osc.start(at);
    osc.stop(at + gate + 0.02);
  }

  function bassChip(at, note, gate) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(note);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.13, at + 0.01);
    env.gain.setValueAtTime(0.11, at + gate * 0.6);
    env.gain.linearRampToValueAtTime(0, at + gate);
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
    if (t.drums.kick.indexOf(i) >= 0) kick(at);
    if (t.drums.snare.indexOf(i) >= 0) snare(at);
    if (t.drums.hat.indexOf(i) >= 0) hat(at);

    if (phrase.bass[i]) bassChip(at, phrase.bass[i], eighth * 0.9);

    const lead = phrase.lead[i];
    if (lead) {
      chip(at, lead + (tension >= 30 ? 12 : 0), t.leadDuty, eighth * 0.8, tension >= 30 ? 0.055 : 0.07);
    }

    /* Sixteenth-note arpeggios under the melody: the classic chip filler. */
    if (i % 2 === 0) {
      const chord = phrase.arp[Math.floor(i / (t.steps / phrase.arp.length))];
      const sub = eighth / 2;
      chip(at, chord[0], t.arpDuty, sub * 0.8, 0.035);
      chip(at + sub, chord[1], t.arpDuty, sub * 0.8, 0.03);
    }

    /* Alarm past 42 adds a high chip sting on the off beats. */
    if (tension >= 42 && i % 8 === 4) chip(at, 84, 0.125, eighth * 0.5, 0.028);
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
    applyEcho(ctx);
    nextTime = ctx.currentTime + 0.05;
    step = 0;
    scheduleAhead();
    scheduler = setInterval(scheduleAhead, 250);
  }

  function stopMusic() {
    nextTime = 0;
    step = 0;
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
