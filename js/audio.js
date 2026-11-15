'use strict';

/* Everything is generated with the Web Audio API — no audio files, no CDNs.
   SFX are short synthetic hits; the music is a looping spy groove whose tempo
   and tension rise with the alarm. Off by default. */
const Sound = (function () {
  let context = null;
  let muted = true;
  let musicOn = false;
  let scheduler = null;
  let nextTime = 0;
  let step = 0;
  let tension = 0;
  let trackName = 'nightline';

  /* Five synthesized beds, all generated from the same four primitives
     (kick, hat, bass, stab) so there are no audio files to ship. */
  const TRACKS = {
    nightline: {
      name: 'Nightline Shunt',
      bpm: 104, steps: 16, swing: 0,
      kick: [0, 4, 8, 12],
      hat: [1, 3, 5, 7, 9, 11, 13, 15],
      bass: [110, 0, 110, 110, 0, 130.8, 0, 110, 98, 0, 110, 130.8, 146.4, 0, 110, 82.4],
      stab: [0, 0, 329.6, 0, 0, 440, 0, 329.6, 0, 0, 440, 0, 523.2, 0, 440, 0],
      bassType: 'sawtooth', bassCut: 420, bassGain: 0.10
    },
    waltz: {
      name: 'Cold War Waltz',
      bpm: 96, steps: 12, swing: 0,
      kick: [0, 6],
      hat: [3, 9],
      bass: [110, 0, 0, 146.4, 0, 0, 98, 0, 0, 110, 0, 0],
      stab: [0, 0, 329.6, 0, 0, 0, 0, 0, 440, 0, 0, 0],
      bassType: 'triangle', bassCut: 300, bassGain: 0.11
    },
    deaddrop: {
      name: 'Dead Drop',
      bpm: 88, steps: 16, swing: 0,
      kick: [0, 8],
      hat: [],
      bass: [82.4, 0, 0, 0, 0, 0, 0, 0, 98, 0, 0, 0, 0, 0, 0, 0],
      stab: [0, 0, 0, 0, 220, 0, 0, 0, 0, 0, 0, 0, 261.6, 0, 0, 0],
      bassType: 'sawtooth', bassCut: 240, bassGain: 0.09
    },
    safehouse: {
      name: 'Safehouse Shuffle',
      bpm: 118, steps: 16, swing: 0.18,
      kick: [0, 6, 10],
      hat: [2, 4, 6, 8, 10, 12, 14],
      bass: [110, 0, 0, 110, 0, 130.8, 0, 0, 98, 0, 110, 0, 0, 130.8, 0, 0],
      stab: [0, 0, 0, 329.6, 0, 0, 440, 0, 0, 329.6, 0, 0, 0, 523.2, 0, 0],
      bassType: 'triangle', bassCut: 520, bassGain: 0.10
    },
    blackout: {
      name: 'Blackout March',
      bpm: 124, steps: 16, swing: 0,
      kick: [0, 4, 8, 12],
      hat: [2, 6, 10, 14],
      bass: [110, 0, 110, 0, 146.4, 0, 110, 0, 110, 0, 110, 0, 98, 0, 110, 0],
      stab: [0, 0, 0, 0, 440, 0, 0, 0, 0, 0, 523.2, 0, 0, 0, 587.3, 0],
      bassType: 'square', bassCut: 620, bassGain: 0.08
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

  function track() { return TRACKS[trackName]; }

  function bpm() {
    return track().bpm + Math.round(tension * 0.5);
  }

  function kick(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(44, at + 0.12);
    env.gain.setValueAtTime(0.16, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  function hat(at) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1700 + (tension > 20 ? 400 : 0);
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    env.gain.setValueAtTime(0.018, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(filter);
    filter.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.08);
  }

  function bassNote(at, freq, t) {
    const ctx = ensureContext();
    if (!ctx) return;
    t = t || track();
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = t.bassType || 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = t.bassCut || 420;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(t.bassGain || 0.1, at + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(filter);
    filter.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.26);
  }

  /* Keep a rolling window of notes scheduled ahead of the clock: each tick
     schedules everything that falls inside the next LOOKAHEAD seconds. */
  const LOOKAHEAD = 1.2;

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
      if (t.kick.indexOf(i) >= 0) kick(at);
      if (t.hat.indexOf(i) >= 0) hat(at);
      if (t.bass[i]) bassNote(at, t.bass[i], t);
      if (t.stab[i]) tone(t.stab[i], 0.14, 'triangle', 0.045, at);
      if (tension >= 30 && i % 4 === 2) tone((t.bass[i] || 110) * 4, 0.08, 'square', 0.02, at);
      if (tension >= 42 && i % 8 === 4) tone(880, 0.1, 'square', 0.03, at);
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
      /* four rising notes with a lower brass doubling and a held top note */
      [294, 392, 494, 587, 784].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.16, i * 0.13); });
      [147, 196, 247, 294, 392].forEach(function (f, i) { tone(f, 0.4, 'sawtooth', 0.07, i * 0.13); });
      tone(784, 0.7, 'triangle', 0.12, 0.66);
      tone(1176, 0.5, 'sine', 0.05, 0.7);
    } else if (name === 'gameOver') {
      [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.25, 'sawtooth', 0.12, i * 0.16); });
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
    return trackName;
  }

  return {
    play: play,
    toggle: toggle,
    toggleMusic: toggleMusic,
    setTension: setTension,
    tracks: function () {
      return Object.keys(TRACKS).map(function (id) { return { id: id, name: TRACKS[id].name }; });
    },
    setTrack: setTrack,
    currentTrack: function () { return trackName; },
    trackName: function () { return track().name; },
    isMuted: function () { return muted; },
    isMusicOn: function () { return musicOn; }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
