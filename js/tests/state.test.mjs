import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';

const cards = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url)));
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url)));

test('card set totals match the printed components (8/22/23/1 = 54)', () => {
  const totals = {};
  for (const def of cards.cards) totals[def.set] = (totals[def.set] || 0) + def.copies;
  assert.deepStrictEqual(totals, { starting: 8, obstacle: 22, mission: 23, alarm: 1 });
  assert.strictEqual(cards.cards.reduce((n, d) => n + d.copies, 0), 54);
});

test('every obstacle card has a type, a cost and an alarm value', () => {
  for (const def of cards.cards) {
    if (def.set === 'obstacle' || (def.set === 'mission' && !def.isGoal)) {
      assert.ok(def.obstacleType, def.id + ' missing obstacleType');
      assert.ok(def.cost, def.id + ' missing cost');
      assert.strictEqual(typeof def.alarm, 'number', def.id + ' missing alarm');
    }
  }
});

test('every card has exactly as many art files as copies', () => {
  for (const def of cards.cards) assert.strictEqual(def.art.length, def.copies, def.id);
});

test('mission letters and injected obstacles agree', () => {
  const letters = cards.cards.filter((d) => d.missionLetter && !d.isGoal).map((d) => d.id).sort();
  const injected = missions.missions.flatMap((m) => m.obstaclesIntroduced).sort();
  assert.deepStrictEqual(injected, letters);
  assert.strictEqual(missions.missions.length, 5);
});

test('the mission deck is ordered A..I and holds all 23 mission cards', () => {
  const registry = AgentDecker.buildRegistry(cards.cards);
  const state = AgentDecker.createInitialState(cards.cards, missions.missions, 7);
  const letters = state.missionDeck.map((c) => registry[c.defId].missionLetter).join('');
  assert.strictEqual(letters, 'ABBBCDDDDEFFFFFGHHHHHHI');
  assert.strictEqual(state.missionDeck.length, 23);
});

test('setup satisfies the invariants for any seed', () => {
  for (const seed of [1, 42, 777, 20260113]) {
    const registry = AgentDecker.buildRegistry(cards.cards);
    const state = AgentDecker.createInitialState(cards.cards, missions.missions, seed);
    assert.deepStrictEqual(AgentDecker.checkInvariants(state, registry), []);
    assert.strictEqual(state.line.length, 6);
    assert.strictEqual(state.hand.length, 4);
    assert.strictEqual(state.obstacleDeck.length, 16);
    assert.strictEqual(state.deck.length, 4);
    assert.strictEqual(state.alarm, 0);
  }
});

test('the same seed produces the same opening board', () => {
  const registry = AgentDecker.buildRegistry(cards.cards);
  const a = AgentDecker.createInitialState(cards.cards, missions.missions, 12345);
  const b = AgentDecker.createInitialState(cards.cards, missions.missions, 12345);
  assert.deepStrictEqual(a.line.map((c) => c.uid), b.line.map((c) => c.uid));
  assert.deepStrictEqual(a.hand.map((c) => c.uid), b.hand.map((c) => c.uid));
});

test('no card instance appears in two zones at setup', () => {
  const registry = AgentDecker.buildRegistry(cards.cards);
  const state = AgentDecker.createInitialState(cards.cards, missions.missions, 99);
  const all = [...state.line, ...state.hand, ...state.deck, ...state.obstacleDeck]
    .map((c) => c.uid);
  assert.strictEqual(new Set(all).size, all.length);
});

test('every type-based effect names a real printed icon', () => {
  const registry = AgentDecker.buildRegistry(cards.cards);
  assert.deepStrictEqual(AgentDecker.validateTypes(registry), []);
});

test('the Keycard targets doors, not people', () => {
  const registry = AgentDecker.buildRegistry(cards.cards);
  const keycard = registry.obs_sleeping_guard.reward.effect;
  assert.strictEqual(keycard.type, 'discardToInteract');
  assert.strictEqual(keycard.targetType, 'door');
  assert.strictEqual(registry.obs_infimary.reward.effect.targetType, 'person');
  assert.strictEqual(registry.obs_engineering_bay.reward.effect.targetType, 'equipment');
});
