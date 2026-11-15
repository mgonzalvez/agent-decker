import test from 'node:test';
import assert from 'node:assert';
import Sound from '../audio.js';
import { readFileSync } from 'node:fs';

const startedAt = Date.now();
const notes = [];

function FakeContext() {
  this.state = 'running';
  this.destination = { name: 'destination' };
}
Object.defineProperty(FakeContext.prototype, 'currentTime', {
  get: function () { return (Date.now() - startedAt) / 1000; }
});
FakeContext.prototype.createOscillator = function () {
  const osc = {
    type: 'sine',
    frequency: { value: 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {}, linearRampToValueAtTime: function () {} },
    setPeriodicWave: function () {},
    connect: function () {},
    start: function () { notes.push(osc); },
    stop: function () {}
  };
  return osc;
};
FakeContext.prototype.createPeriodicWave = function () { return { wave: true }; };
FakeContext.prototype.createBuffer = function (channels, length) {
  const data = new Float32Array(length);
  return { getChannelData: function () { return data; } };
};
FakeContext.prototype.createBufferSource = function () {
  return { buffer: null, connect: function () {}, start: function () { notes.push('noise'); }, stop: function () {} };
};
FakeContext.prototype.createDelay = function () {
  return { delayTime: { value: 0 }, connect: function () {} };
};
FakeContext.prototype.createGain = function () {
  return {
    gain: { value: 0, setValueAtTime: function () {}, linearRampToValueAtTime: function () {}, exponentialRampToValueAtTime: function () {}, cancelScheduledValues: function () {} },
    connect: function () {}
  };
};
FakeContext.prototype.createBiquadFilter = function () {
  return { type: 'lowpass', frequency: { value: 0 }, connect: function () {} };
};
FakeContext.prototype.resume = function () {};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('every sound cue the UI can ask for resolves without throwing', () => {
  const cues = ['play', 'disarm', 'knockOut', 'alarm', 'fanfare', 'mission', 'gameOver',
    'deal', 'draw', 'slide', 'scroll', 'exit', 'flip',
    'bark', 'whine', 'screech', 'steps', 'snore', 'hiss', 'clang', 'clank', 'latch', 'ping',
    'hum', 'shot', 'boom', 'sizzle', 'rattle', 'whistle', 'beep', 'stumble', 'cam', 'drip',
    'sweep', 'servo', 'siren'];
  for (const cue of cues) Sound.play(cue);
});

test('the music toggle unmutes and reports its state', () => {
  assert.strictEqual(Sound.toggleMusic(), true);
  assert.strictEqual(Sound.isMusicOn(), true);
  Sound.toggleMusic();
  assert.strictEqual(Sound.isMusicOn(), false);
});

test('all five beds are selectable', () => {
  const names = Sound.tracks().map(function (t) { return t.name; });
  assert.strictEqual(names.length, 5);
  assert.ok(names.indexOf('Nightline Shunt') >= 0);
  assert.ok(names.indexOf('Cold War Waltz') >= 0);
  assert.ok(names.indexOf('Dead Drop') >= 0);
  assert.ok(names.indexOf('Safehouse Nocturne') >= 0);
  assert.ok(names.indexOf('Blackout March') >= 0);
});

test('the scheduler keeps feeding notes instead of stopping after one bar', async () => {
  globalThis.window = { AudioContext: FakeContext };
  Sound.setTrack('nightline');
  Sound.toggleMusic();
  await sleep(1500);
  assert.ok(notes.length >= 8, 'the loop scheduled only ' + notes.length + ' notes in 1.5 s');

  Sound.toggle();
  await sleep(700);
  const mutedCount = notes.length;
  await sleep(700);
  assert.strictEqual(notes.length, mutedCount, 'a muted board schedules nothing');
  Sound.toggle();

  Sound.toggleMusic();
  assert.strictEqual(Sound.isMusicOn(), false);
  const stopped = notes.length;
  await sleep(600);
  assert.strictEqual(notes.length, stopped, 'turning the music off stops the scheduler');
});

test('the beds are actually different: Dead Drop is sparser than Nightline', async () => {
  if (!Sound.isMusicOn()) Sound.toggleMusic();
  Sound.setTrack('nightline');
  assert.strictEqual(Sound.currentTrack(), 'nightline');
  const before = notes.length;
  await sleep(1500);
  const nightline = notes.length - before;

  Sound.setTrack('deaddrop');
  assert.strictEqual(Sound.currentTrack(), 'deaddrop');
  const beforeSparse = notes.length;
  await sleep(1500);
  const deadDrop = notes.length - beforeSparse;

  assert.ok(deadDrop < nightline, 'Dead Drop (' + deadDrop + ') should be sparser than Nightline (' + nightline + ')');
  Sound.toggleMusic();
});

test('every obstacle card carries a sound the audio layer can actually make', () => {
  const cards = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
  const known = ['play', 'disarm', 'knockOut', 'alarm', 'fanfare', 'mission', 'gameOver', 'deal', 'draw',
    'slide', 'scroll', 'exit', 'flip', 'bark', 'whine', 'screech', 'steps', 'snore', 'hiss', 'clang', 'clank',
    'latch', 'ping', 'hum', 'shot', 'boom', 'sizzle', 'rattle', 'whistle', 'beep', 'stumble', 'cam', 'drip',
    'sweep', 'servo', 'siren'];
  const tagged = cards.filter(function (c) { return c.sound; });
  assert.ok(tagged.length >= 30, 'obstacles should have diegetic sounds');
  for (const card of tagged) {
    assert.ok(known.indexOf(card.sound) >= 0, card.name + ' asks for an unknown sound: ' + card.sound);
  }
});

test('no melody or bass note clashes with the chord underneath it', () => {
  const fits = function (note, chord) {
    return chord.map(function (n) { return n % 12; }).indexOf(note % 12) >= 0;
  };
  for (const t of Sound.tracks()) {
    for (const phrase of t.data) {
      const span = t.steps / phrase.chords.length;
      const chordAt = function (step) { return phrase.chords[Math.floor(step / span)]; };
      for (const line of ['bass', 'lead']) {
        for (const [at, note, length] of phrase[line]) {
          assert.ok(fits(note, chordAt(at)), t.name + ' ' + line + ' ' + note + ' clashes at step ' + at);
          assert.ok(at + length <= t.steps, t.name + ' ' + line + ' note at ' + at + ' runs past the phrase');
        }
      }
    }
  }
});

test('the beds are slow, held, and quiet enough to sit under play', () => {
  for (const t of Sound.tracks()) {
    assert.ok(t.bpm <= 100, t.name + ' is too fast at ' + t.bpm + ' bpm');
    const notes = t.data.reduce(function (n, p) { return Math.max(n, p.bass.length + p.lead.length); }, 0);
    const longest = t.data.reduce(function (n, p) {
      return Math.max(n, p.lead.reduce(function (m, l) { return Math.max(m, l[2]); }, 0));
    }, 0);
    assert.ok(longest >= 2, t.name + ' has no sustained melodic note');
    assert.ok(notes / t.steps <= 0.9, t.name + ' is too dense: ' + notes + ' notes in ' + t.steps + ' steps');
  }
});
