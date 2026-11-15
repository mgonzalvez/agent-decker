import test from 'node:test';
import assert from 'node:assert';
import Sound from '../audio.js';

test('every sound the table layer asks for is defined and safe without a browser', () => {
  ['play', 'disarm', 'knockOut', 'alarm', 'mission', 'fanfare', 'gameOver', 'deal', 'draw', 'slide', 'scroll', 'exit', 'flip'].forEach(function (name) {
    assert.doesNotThrow(function () { Sound.play(name, 20); });
  });
});

test('the music toggle unmutes and reports its state', () => {
  assert.strictEqual(Sound.isMuted(), true, 'audio starts muted');
  assert.strictEqual(Sound.toggleMusic(), true, 'music turns on');
  assert.strictEqual(Sound.isMuted(), false, 'turning music on unmutes the whole audio');
  assert.strictEqual(Sound.toggleMusic(), false, 'music turns off again');
  assert.strictEqual(Sound.isMusicOn(), false);
});

test('the music scheduler keeps feeding notes instead of stopping after one bar', async () => {
  const startedAt = Date.now();
  const created = [];

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
      frequency: { value: 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} },
      connect: function () {},
      start: function () { created.push(osc); },
      stop: function () {}
    };
    return osc;
  };
  FakeContext.prototype.createGain = function () {
    return {
      gain: { setValueAtTime: function () {}, linearRampToValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} },
      connect: function () {}
    };
  };
  FakeContext.prototype.createBiquadFilter = function () {
    return { type: 'lowpass', frequency: { value: 0 }, connect: function () {} };
  };
  FakeContext.prototype.resume = function () {};

  globalThis.window = { AudioContext: FakeContext };
  Sound.toggleMusic();
  assert.strictEqual(Sound.isMusicOn(), true);

  await new Promise(function (resolve) { setTimeout(resolve, 1200); });
  assert.ok(created.length >= 12, 'the loop scheduled ' + created.length + ' notes in just over a second, not two');

  Sound.toggle();
  assert.strictEqual(Sound.isMuted(), true, 'muting audio silences the loop too');
  await new Promise(function (resolve) { setTimeout(resolve, 600); });
  const mutedCount = created.length;
  await new Promise(function (resolve) { setTimeout(resolve, 600); });
  assert.strictEqual(created.length, mutedCount, 'a muted board schedules nothing');
  Sound.toggle();

  Sound.toggleMusic();
  assert.strictEqual(Sound.isMusicOn(), false);
  await new Promise(function (resolve) { setTimeout(resolve, 300); });
  const after = created.length;
  await new Promise(function (resolve) { setTimeout(resolve, 600); });
  assert.strictEqual(created.length, after, 'turning the music off stops the scheduler');
  delete globalThis.window;
});
