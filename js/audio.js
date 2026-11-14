'use strict';

/* Synthetic sound effects with the Web Audio API — no asset files, no CDNs.
   Muted by default (accessibility); the toggle in the top bar turns it on. */
const Sound = (function () {
  let context = null;
  let muted = true;
  let musicOn = false;
  let ambient = null;

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

  function tone(freq, duration, type, gain, delay) {
    const ctx = ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain || 0.12, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
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

  function startAmbient() {
    const ctx = ensureContext();
    if (!ctx || ambient) return;
    const drone = ctx.createOscillator();
    const drone2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const pulse = ctx.createOscillator();
    const pulseGain = ctx.createGain();
    const tension = ctx.createOscillator();
    const tensionGain = ctx.createGain();

    drone.type = 'sine'; drone.frequency.value = 55;
    drone2.type = 'sine'; drone2.frequency.value = 82.5;
    tension.type = 'sawtooth'; tension.frequency.value = 196;
    filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = 0.7;
    gain.gain.value = 0.05;
    tensionGain.gain.value = 0.0;
    pulse.type = 'sine'; pulse.frequency.value = 0.12;
    pulseGain.gain.value = 0.03;

    pulse.connect(pulseGain);
    pulseGain.connect(gain.gain);
    drone.connect(filter);
    drone2.connect(filter);
    tension.connect(tensionGain);
    tensionGain.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    drone.start(); drone2.start(); pulse.start(); tension.start();
    ambient = { drone: drone, tension: tension, tensionGain: tensionGain, pulse: pulse, gain: gain };
  }

  function stopAmbient() {
    if (!ambient) return;
    try {
      ambient.drone.stop();
      ambient.tension.stop();
      ambient.pulse.stop();
    } catch (err) { /* already stopped */ }
    ambient = null;
  }

  function setTension(level) {
    if (!ambient || !context) return;
    const value = Math.max(0, Math.min(50, level || 0));
    ambient.tensionGain.gain.setTargetAtTime(0.002 + value * 0.0014, context.currentTime, 1.5);
    ambient.pulse.frequency.setTargetAtTime(0.12 + value * 0.012, context.currentTime, 2);
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
    } else if (name === 'mission') {
      [392, 494, 587, 784].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.12, i * 0.12); });
    } else if (name === 'gameOver') {
      [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.25, 'sawtooth', 0.12, i * 0.16); });
    }
  }

  function toggle() {
    muted = !muted;
    if (!muted) {
      const ctx = ensureContext();
      if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
    }
    if (muted) stopAmbient();
    else if (musicOn) startAmbient();
    return !muted;
  }

  function toggleMusic() {
    musicOn = !musicOn;
    if (musicOn && !muted) startAmbient();
    else stopAmbient();
    return musicOn;
  }

  return {
    play: play,
    toggle: toggle,
    toggleMusic: toggleMusic,
    setTension: setTension,
    isMuted: function () { return muted; }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
