/* Offline renderer for the score.

   The same arrangement data the browser engine uses (js/data/score.json), rendered to
   samples in Node so the music can be measured and listened to before it is wired into
   the game. Timbres are additive partials with soft envelopes, then a per-layer filter,
   a small room, and a gentle limiter. */
import { writeFileSync } from 'node:fs';

const SR = 44100;
const TARGET_RMS = 0.11;
const PEAK_CEILING = 0.39;

function biquad(type, fc, q) {
  const w = 2 * Math.PI * fc / SR;
  const cw = Math.cos(w), sw = Math.sin(w), alpha = sw / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; }
  else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  return { b0: b0 / (1 + alpha), b1: b1 / (1 + alpha), b2: b2 / (1 + alpha),
    a1: -2 * cw / (1 + alpha), a2: (1 - alpha) / (1 + alpha) };
}

function applyBiquad(buf, c) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    buf[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return buf;
}

function envelope(t, dur, spec) {
  if (t <= 0 || t >= dur) return 0;
  if (t < spec.attack) return t / spec.attack;
  if (spec.sustain > 0) {
    const releaseStart = dur - spec.release;
    if (t < releaseStart) return spec.sustain;
    return spec.sustain * Math.max(0, (dur - t) / spec.release);
  }
  return Math.exp(-(t - spec.attack) / spec.tau);
}

/* Partials are [harmonic, amplitude]. `inharmonic` stretches the upper partials the
   way a real string does, which is the difference between a piano and a sine bank. */
function addNote(buf, start, dur, freq, partials, spec, vel, inharmonic) {
  const first = Math.max(0, Math.floor(start));
  const last = Math.min(buf.length, Math.ceil(start + dur * SR));
  const phases = partials.map(function () { return 0; });
  const vib = spec.vibrato;
  const inc = partials.map(function (p) { return 2 * Math.PI * freq * p[0] * (1 + (inharmonic || 0) * p[0] * p[0]) / SR; });
  for (let i = first; i < last; i++) {
    if (i < start) continue;
    const t = (i - start) / SR;
    const e = envelope(t, dur, spec) * vel;
    if (e <= 0.0004) continue;
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      phases[p] += inc[p];
      s += partials[p][1] * Math.sin(phases[p]);
    }
    if (vib) s *= 1 + vib.depth * Math.sin(2 * Math.PI * vib.rate * t);
    buf[i] += s * e;
  }
}

let noise = null;
function noiseAt(i) {
  if (!noise) {
    noise = new Float32Array(262144);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  }
  return noise[i % noise.length];
}

function addStroke(buf, start, dur, spec, vel, band, q, lowThump) {
  const first = Math.max(0, Math.floor(start));
  const last = Math.min(buf.length, Math.ceil(start + dur * SR));
  const c = biquad('bandpass', band, q);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = first; i < last; i++) {
    const t = (i - start) / SR;
    const e = envelope(t, dur, spec) * vel;
    if (e <= 0.0004) continue;
    const x = noiseAt(i);
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] += y * e;
    if (lowThump) buf[i] += 0.3 * Math.sin(2 * Math.PI * 110 * t) * e;
  }
}

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function renderLayer(notes, layer, step, samples, voices, gain) {
  const buf = new Float32Array(samples);
  for (const n of notes) {
    const st = n[0], midi = n[1], len = n[2], vel = n[3];
    const start = st * step * SR;
    if (start >= samples) continue;
    if (layer === 'bass') {
      addNote(buf, start, len * step + 0.12, midiToFreq(midi),
        [[1, 1], [2, 0.34], [3, 0.11]], { attack: 0.022, sustain: 0.52, release: 0.12 }, vel);
      addStroke(buf, start, 0.02, { attack: 0.004, sustain: 0, tau: 0.006 }, 0.05 * vel, 300, 0.7, false);
    } else if (layer === 'piano') {
      addNote(buf, start, len * step + 1.5, midiToFreq(midi),
        [[1, 1], [2, 0.5], [3, 0.22], [4, 0.1], [5, 0.04]], { attack: 0.012, sustain: 0, tau: 0.34 }, vel, 0.0006);
    } else if (layer === 'brushes') {
      const dur = len * step + 0.30;
      if (midi === 0) addStroke(buf, start, dur, { attack: 0.022, sustain: 0, tau: 0.13 }, vel, 1600, 0.9, false);
      else if (midi === 1) addStroke(buf, start, dur, { attack: 0.028, sustain: 0, tau: 0.22 }, vel, 1100, 0.7, true);
      else addStroke(buf, start, dur, { attack: 0.018, sustain: 0, tau: 0.10 }, vel, 2200, 0.8, false);
    } else if (layer === 'vibes') {
      addNote(buf, start, len * step + 1.6, midiToFreq(midi),
        [[1, 1], [2, 0.26], [4, 0.08]], { attack: 0.01, sustain: 0, tau: 1.1, vibrato: { rate: 4.2, depth: 0.006 } }, vel, 0.0002);
    } else if (layer === 'strings') {
      addNote(buf, start, len * step, midiToFreq(midi),
        [[1, 1], [2, 0.25], [3, 0.12]], { attack: 0.6, sustain: 0.7, release: 0.8, vibrato: { rate: 3.6, depth: 0.004 } }, vel);
    }
    const end = Math.min(voices.length, start + (len * step + 0.4) * SR);
    for (let i = Math.floor(start); i < end; i++) voices[i]++;
  }
  /* Each voice is normalised to unity RMS and then set to its level in the mix,
     so the mix numbers are musical (relative dB) rather than raw amplitudes. */
  const reference = rms(buf);
  const level = gain === undefined ? 0 : gain;
  if (reference > 0) {
    const scale = Math.pow(10, level / 20) / reference;
    for (let i = 0; i < buf.length; i++) buf[i] *= scale;
  }
  if (layer === 'bass') applyBiquad(buf, biquad('lowpass', 400, 0.7));
  if (layer === 'piano') applyBiquad(buf, biquad('lowpass', 1700, 0.7));
  if (layer === 'vibes') applyBiquad(buf, biquad('lowpass', 2400, 0.7));
  if (layer === 'strings') applyBiquad(buf, biquad('lowpass', 1200, 0.7));
  return buf;
}

/* A small Schroeder feedback network: four short delay lines cross feeding each
   other. Short taps keep it a room, not an echo, and the cross-feed gain stays
   below unity so the tail decays instead of accumulating. */
function addRoom(buf, outMix) {
  const taps = [0.0053, 0.0173, 0.0279, 0.0369].map(function (d) { return Math.round(d * SR); });
  const lines = taps.map(function (t) { return new Float32Array(t); });
  const lp = biquad('lowpass', 2600, 0.7);
  const state = taps.map(function () { return { x1: 0, x2: 0, y1: 0, y2: 0 }; });
  const g = 0.24;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const delayed = taps.map(function (t, j) { return lines[j][(i - t + t * Math.ceil(i / t + 1)) % t]; });
    for (let j = 0; j < taps.length; j++) {
      let feed = 0;
      for (let k = 0; k < taps.length; k++) if (k !== j) feed += delayed[k];
      const input = buf[i] + feed * g;
      const st = state[j];
      const y = lp.b0 * input + lp.b1 * st.x1 + lp.b2 * st.x2 - lp.a1 * st.y1 - lp.a2 * st.y2;
      st.x2 = st.x1; st.x1 = input; st.y2 = st.y1; st.y1 = y;
      lines[j][i % taps[j]] = y;
    }
    let sum = 0;
    for (let j = 0; j < taps.length; j++) sum += delayed[j];
    out[i] = buf[i] * (1 - outMix) + sum * outMix / taps.length;
  }
  return out;
}

function master(buf) {
  const room = addRoom(buf, 0.16);
  applyBiquad(room, biquad('lowpass', 5200, 0.6));
  const scale = TARGET_RMS / rms(room);
  for (let i = 0; i < room.length; i++) {
    const v = room[i] * scale;
    room[i] = Math.tanh(1.1 * v) / 1.1;
  }
  const p = peak(room);
  if (p > PEAK_CEILING) {
    const trim = PEAK_CEILING / p;
    for (let i = 0; i < room.length; i++) room[i] *= trim;
  }
  return room;
}

function loopSamplesOf(score) { return Math.round(score.bars * (60 / score.bpm) * SR); }

/* One loop rendered as a circular buffer: a note whose decay runs past the end of the
   loop wraps into the beginning, which is what makes the loop seamless. */
function loopBuffer(score, layers) {
  const step = 60 / score.bpm / score.grid;
  const L = loopSamplesOf(score);
  const tail = Math.ceil(3 * SR);
  const voices = new Uint16Array(L);
  const out = new Float32Array(L);
  for (const layer of layers) {
    const buf = renderLayer(score.layers[layer] || [], layer, step, L + tail, voices, (score.mix || {})[layer]);
    for (let i = 0; i < buf.length; i++) out[i % L] += buf[i];
  }
  return { buffer: out, voices, L };
}

function render(score, layers, reps) {
  const { buffer, voices, L } = loopBuffer(score, layers);
  const linear = new Float32Array(L * reps);
  for (let r = 0; r < reps; r++) linear.set(buffer, r * L);
  return { buffer: master(linear), voices, loopSamples: L };
}

function peak(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; }
  return p;
}

function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

function lowpassEnergy(buf, fc) {
  let s = 0, e = 0;
  const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
  for (let i = 0; i < buf.length; i++) { s += a * (buf[i] - s); e += s * s; }
  return e;
}

function bandEnergies(buf) {
  const e = [lowpassEnergy(buf, 200), lowpassEnergy(buf, 1000), lowpassEnergy(buf, 4000), lowpassEnergy(buf, 12000)];
  const total = e[3] || 1;
  return [e[0] / total, (e[1] - e[0]) / total, (e[2] - e[1]) / total, (e[3] - e[2]) / total];
}

export function layerStats(score, layer) {
  const step = 60 / score.bpm / score.grid;
  const L = loopSamplesOf(score);
  const buf = renderLayer(score.layers[layer] || [], layer, step, L + Math.ceil(3 * SR), new Uint16Array(L));
  return { rms: rms(buf), peak: peak(buf), bands: bandEnergies(buf) };
}

export function rawLoop(score, layers) {
  const { buffer, L } = loopBuffer(score, layers);
  return { buffer, L };
}

export function analyze(score, layers, reps) {
  const r = render(score, layers, reps || 3);
  const buf = r.buffer;
  const seam = buf.length - r.loopSamples;
  let jump = 0;
  for (let i = seam - 30; i < seam + 30 && i < buf.length; i++) {
    if (i > 0) jump = Math.max(jump, Math.abs(buf[i] - buf[i - 1]));
  }
  const a = buf.subarray(seam - r.loopSamples, seam);
  const b = buf.subarray(seam, seam + r.loopSamples);
  let drift = 0;
  for (let i = 0; i < a.length; i++) drift = Math.max(drift, Math.abs(a[i] - b[i]));
  let normalJump = 0;
  for (let i = seam + 1; i < buf.length; i++) normalJump = Math.max(normalJump, Math.abs(buf[i] - buf[i - 1]));
  let maxVoices = 0;
  for (let i = 0; i < r.voices.length; i++) if (r.voices[i] > maxVoices) maxVoices = r.voices[i];
  return {
    seconds: buf.length / SR,
    loopSeconds: r.loopSamples / SR,
    peak: peak(buf),
    rmsDb: 20 * Math.log10(rms(buf)),
    hfRatio: +bandEnergies(buf)[3].toFixed(4),
    bands: bandEnergies(buf).map(function (v) { return +v.toFixed(4); }),
    maxVoices: maxVoices,
    seamDrift: drift,
    boundaryJump: jump,
    normalJump: normalJump,
    buffer: buf,
    loopSamples: r.loopSamples
  };
}

export function renderPreview(score, layers, path, reps) {
  const a = analyze(score, layers, reps || 3);
  const loop = a.buffer.slice(a.loopSamples);
  writeWav(path, loop);
  return a;
}

/* Two consecutive loops so a human can hear the seam and the repetition. */
export function renderAudition(score, layers, path) {
  const a = analyze(score, layers, 3);
  writeWav(path, a.buffer.slice(a.loopSamples));
  return a;
}

function writeWav(path, buf) {
  const bytes = Buffer.alloc(44 + buf.length * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + buf.length * 2, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) {
    bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
  }
  writeFileSync(path, bytes);
  return bytes.length;
}
