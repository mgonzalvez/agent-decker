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
