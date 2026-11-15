import test from 'node:test';
import assert from 'node:assert';
import Table from '../table.js';

test('a line scroll plans a move for every card that shifted and a ghost for the card that left', () => {
  const state = {
    events: [
      { type: 'scroll', shift: ['a', 'b', 'c'], exiting: 'd' },
      { type: 'exitLine', card: 'd', alarm: 6 },
      { type: 'dealLine', card: 'e', index: 0, slot: 0 }
    ]
  };
  const before = { a: { x: 0, y: 0 }, b: { x: 150, y: 0 }, c: { x: 300, y: 0 }, d: { x: 450, y: 0, el: {} } };
  const after = { a: { x: 150, y: 0 }, b: { x: 300, y: 0 }, c: { x: 450, y: 0 }, e: { x: 0, y: 0 } };
  const steps = Table.plan(state, before, after);

  assert.strictEqual(steps.length, 2, 'the exit is folded into the scroll, not doubled');
  assert.strictEqual(steps[0].sounds[0], 'scroll');
  assert.ok(steps[0].moves.filter(function (m) { return !m.ghost; }).every(function (m) { return m.dx === -150; }));
  assert.ok(steps[0].moves.some(function (m) { return m.ghost && m.uid === 'd'; }), 'the exiting card leaves as a ghost');
  assert.strictEqual(steps[1].sounds[0], 'deal');
  assert.ok(steps[1].moves[0].enter, 'a newly dealt card enters from the deck side');
});

test('items used on the wrong obstacle type produce no animation and no sound', () => {
  const state = { events: [{ type: 'alarm', amount: 4, total: 12 }] };
  assert.deepStrictEqual(Table.plan(state, {}, {}), []);
});

test('run is a no-op when there is no DOM, and when fast mode is on', () => {
  const steps = [{ kind: 'scroll', sounds: ['scroll'], moves: [{ uid: 'a', dx: 1, dy: 0 }] }];
  assert.strictEqual(Table.run(steps, { sound: function () { throw new Error('should not play'); } }), 0);
  Table.setFast(true);
  assert.strictEqual(Table.isFast(), true);
  Table.setFast(false);
});

test('a card with a printed sound layers its own cue on top of the table cue', () => {
  const before = { dog: { x: 0, y: 0, el: {} } };
  const after = { dog: { x: 40, y: 0, el: {} } };
  const steps = Table.plan(
    { events: [{ type: 'moveCard', card: 'dog' }] },
    before,
    after,
    function () { return 'bark'; }
  );
  assert.deepStrictEqual(steps[0].sounds, ['slide', 'bark']);
});
