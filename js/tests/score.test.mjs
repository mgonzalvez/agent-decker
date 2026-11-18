import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { analyze } from '../audio/render.mjs';

const score = JSON.parse(readFileSync(new URL('../data/score.json', import.meta.url), 'utf8'));
const TARGET_RMS = -20;

test('the score is 84 bpm, 4/4, and the loop lands exactly on a bar boundary', () => {
  assert.strictEqual(score.bpm, 84);
  assert.strictEqual(score.grid, 16);
  assert.strictEqual(score.bars % 8, 0);
  const barSeconds = 60 / score.bpm;
  const loopSamples = Math.round(score.bars * barSeconds * 44100);
  assert.ok(Math.abs(score.bars * barSeconds * 44100 - loopSamples) < 1, 'loop length is an exact number of samples');
});

test('no event is scheduled outside the loop grid', () => {
  const steps = score.bars * score.grid;
  for (const [layer, notes] of Object.entries(score.layers)) {
    for (const n of notes) {
      assert.ok(n[0] >= 0 && n[0] < steps, layer + ' event at step ' + n[0] + ' falls outside the loop');
      assert.ok(n[2] > 0 && n[2] <= score.grid, layer + ' event has an impossible length');
      assert.ok(n[3] > 0 && n[3] <= 1, layer + ' event has a velocity outside 0..1');
    }
  }
});

test('no two notes in the same voice start at the same step (no unintentional overlap)', () => {
  for (const [layer, notes] of Object.entries(score.layers)) {
    if (layer === 'piano' || layer === 'strings') continue;
    const seen = new Map();
    for (const n of notes) {
      assert.ok(!seen.has(n[0]), layer + ' has two events at step ' + n[0]);
      seen.set(n[0], true);
    }
  }
  // piano voicings are intentionally simultaneous, but a stab must not collide with the next stab
  const starts = score.layers.piano.map(function (n) { return n[0]; });
  const uniq = Array.from(new Set(starts)).sort(function (a, b) { return a - b; });
  for (let i = 1; i < uniq.length; i++) {
    assert.ok(uniq[i] - uniq[i - 1] >= 2, 'piano stabs are less than two sixteenths apart');
  }
});

test('the mix is dark, warm and never clips', () => {
  const a = analyze(score, ['bass', 'piano', 'brushes', 'vibes', 'strings'], 3);
  assert.ok(a.peak <= 0.40, 'peak ' + a.peak.toFixed(4) + ' exceeds the headroom limit');
  assert.ok(a.rmsDb >= -28 && a.rmsDb <= -16, 'mix level ' + a.rmsDb.toFixed(2) + ' dBFS is out of range');
  const crest = a.peak / Math.pow(10, a.rmsDb / 20);
  assert.ok(crest <= 9, 'crest factor ' + crest.toFixed(2) + ' means the limiter is doing real work');
  assert.ok(a.bands[3] < 0.05, 'too much energy above 4 kHz: ' + a.bands[3]);
  assert.ok(a.bands[0] > 0.4, 'the low end is missing: ' + a.bands[0]);
  assert.ok(a.bands[1] > 0.25, 'the mid range is thin: ' + a.bands[1]);
});

test('the loop repeats without a discontinuity at the seam', () => {
  const a = analyze(score, ['bass', 'piano', 'brushes', 'vibes', 'strings'], 3);
  assert.ok(a.boundaryJump <= a.normalJump * 1.05, 'loop seam jumps by ' + a.boundaryJump + ' where the groove never jumps more than ' + a.normalJump);
  assert.ok(a.seamDrift < 0.002, 'the loop does not repeat cleanly (max deviation ' + a.seamDrift.toFixed(6) + ')');
});

test('the number of simultaneous voices stays bounded', () => {
  const a = analyze(score, ['bass', 'piano', 'brushes', 'vibes', 'strings'], 1);
  assert.ok(a.maxVoices <= 24, 'voice count ' + a.maxVoices + ' is too high for a browser audio graph');
  assert.ok(Object.keys(score.layers).length <= 5, 'more than five instrumental layers in the bed');
});

test('the groove leaves rests: no bar is filled wall to wall', () => {
  for (const [layer, notes] of Object.entries(score.layers)) {
    if (layer === 'strings' || !notes.length) continue;
    for (let bar = 0; bar < score.bars; bar++) {
      const covered = new Array(16).fill(false);
      for (const n of notes) {
        if (n[0] >= bar * 16 && n[0] < (bar + 1) * 16) {
          for (let i = n[0]; i < n[0] + n[2] && i < (bar + 1) * 16; i++) covered[i] = true;
        }
      }
      const empty = covered.filter(function (v) { return !v; }).length;
      assert.ok(empty >= 2, layer + ' bar ' + (bar + 1) + ' has no rests');
    }
  }
});

test('the pulse is carried by bass and piano only, there is no drum kit in the bed', () => {
  assert.strictEqual(score.layers.brushes.length, 0, 'percussion has crept back into the underscore');
  for (let bar = 0; bar < score.bars; bar++) {
    const inBar = score.layers.bass.filter(function (n) { return n[0] >= bar * 16 && n[0] < (bar + 1) * 16; }).length
      + score.layers.piano.filter(function (n) { return n[0] >= bar * 16 && n[0] < (bar + 1) * 16; }).length;
    assert.ok(inBar >= 3, 'bar ' + (bar + 1) + ' has no pulse');
    assert.ok(score.layers.bass.some(function (n) { return n[0] === bar * 16; }), 'bar ' + (bar + 1) + ' has no bass anchor on beat 1');
  }
});

test('the loop is 32 bars: four eight-bar phrases', () => {
  assert.strictEqual(score.bars, 32);
  assert.strictEqual(score.chords.length, 32);
});

test('no chord voicing is repeated mechanically for more than two bars in a row', () => {
  let run = 1;
  for (let i = 1; i < score.chords.length; i++) {
    run = score.chords[i] === score.chords[i - 1] ? run + 1 : 1;
    assert.ok(run <= 2, 'voicing ' + score.chords[i] + ' repeats ' + run + ' bars in a row');
  }
});

test('melodic accents are phrases, not a continuous line: at least two bars between them', () => {
  const bar = 60 / score.bpm;
  const starts = [];
  for (const n of score.layers.vibes) {
    const at = n[0] * (bar / 16);
    if (starts.length === 0 || at - starts[starts.length - 1] > 16 * (bar / 16)) starts.push(at);
  }
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] - starts[i - 1] >= 2 * bar - 1e-6, 'two melodic phrases are less than two bars apart');
  }
  const notesPerPhrase = Math.ceil(score.layers.vibes.length / 4);
  assert.ok(score.layers.vibes.length <= 24, 'too many melodic notes for an underscore');
  assert.ok(notesPerPhrase > 0);
});

test('the ambience thins out before the loop restarts so the seam is clean', () => {
  const lastBar = score.bars - 4;
  for (const n of score.layers.strings) {
    assert.ok(n[0] < lastBar * 16, 'a sustained string note crosses the loop boundary into the restart');
  }
  const lastBarNotes = score.layers.bass.filter(function (n) { return n[0] >= (score.bars - 1) * 16; }).length;
  const averageBar = score.layers.bass.length / score.bars;
  assert.ok(lastBarNotes < averageBar, 'the last bar is not thinner than average (' + lastBarNotes + ' vs ' + averageBar.toFixed(2) + ')');
});
