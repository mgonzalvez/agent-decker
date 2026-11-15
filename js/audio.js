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
  let tension = 0;

  const BASS = [110, 0, 110, 110, 0, 130.8, 0, 110, 98, 0, 110, 130.8, 146.4, 0, 110, 82.4];
  const STAB = [0, 0, 329.6, 0, 0, 440, 0, 329.6, 0, 0, 440, 0, 523.2, 0, 440, 0];

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

  function bpm() {
    return 104 + Math.round(tension * 0.5);
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

  function bassNote(at, freq) {
    const ctx = ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.1, at + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(filter);
    filter.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.26);
  }

  function scheduleBar() {
    const ctx = ensureContext();
    if (!ctx || !musicOn) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    const eighth = 60 / bpm() / 2;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    for (let i = 0; i < 16; i++) {
      const at = nextTime + i * eighth;
      if (at > ctx.currentTime + 0.6) break;
      if (i % 4 === 0) kick(at);
      if (i % 2 === 1) hat(at);
      if (BASS[i]) bassNote(at, BASS[i]);
      if (STAB[i]) tone(STAB[i], 0.14, 'triangle', 0.045, at);
      if (tension >= 30 && i % 4 === 2) tone(BASS[i] * 4, 0.08, 'square', 0.02, at);
      if (tension >= 42 && i % 8 === 4) tone(880, 0.1, 'square', 0.03, at);
    }
    nextTime += 16 * eighth;
  }

  function startMusic() {
    if (scheduler) return;
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    nextTime = ctx.currentTime + 0.05;
    scheduleBar();
    scheduler = setInterval(scheduleBar, 250);
  }

  function stopMusic() {
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

  return {
    play: play,
    toggle: toggle,
    toggleMusic: toggleMusic,
    setTension: setTension,
    isMuted: function () { return muted; },
    isMusicOn: function () { return musicOn; }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
