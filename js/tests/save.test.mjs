import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';

const require = createRequire(import.meta.url);

const storage = {
  items: {},
  getItem(key) { return this.items[key] === undefined ? null : this.items[key]; },
  setItem(key, value) { this.items[key] = String(value); },
  removeItem(key) { delete this.items[key]; }
};
globalThis.__storage = storage;
const Save = require('../save.js');

function lineCards(state) { return (state.line || []).filter(Boolean); }

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;

test('a game can be saved and resumed', () => {
  const state = AgentDecker.createInitialState(cardDefs, missions, 1234);
  assert.ok(Save.saveGame(state), 'saving reported success');
  const loaded = Save.loadGame();
  assert.ok(loaded, 'the save can be read back');
  assert.strictEqual(loaded.state.seed, 1234);
  assert.strictEqual(loaded.state.turn, 1);
  assert.deepStrictEqual(lineCards(loaded.state).map((c) => c.uid), lineCards(state).map((c) => c.uid));
});

test('finished games are not kept as a resumable save but are logged as scores', () => {
  const state = AgentDecker.createInitialState(cardDefs, missions, 55);
  state.gameOver = 'campaignComplete';
  state.missionAlarms = [4, 9, 12, 7, 0];
  assert.strictEqual(Save.saveGame(state), false, 'a finished game is not saved for resume');
  assert.ok(Save.recordScore(state));
  const best = Save.scores();
  assert.strictEqual(best.length, 1);
  assert.strictEqual(best[0].total, 32);
  Save.clearGame();
  assert.strictEqual(Save.loadGame(), null);
});

test('scores are kept sorted, best (lowest alarm) first, capped at twenty', () => {
  for (let total = 50; total >= 1; total -= 1) {
    const state = AgentDecker.createInitialState(cardDefs, missions, total);
    state.gameOver = 'campaignComplete';
    state.missionAlarms = [total];
    Save.recordScore(state);
  }
  const best = Save.scores();
  assert.strictEqual(best.length, 20);
  assert.strictEqual(best[0].total, 1);
  assert.ok(best.every((entry, i) => i === 0 || entry.total >= best[i - 1].total));
});
