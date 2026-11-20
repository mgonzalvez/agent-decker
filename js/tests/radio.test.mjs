import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';
import Advisor from '../advisor.js';
import Radio from '../radio.js';

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(cardDefs);

const BANNED = ['interact', 'slot', 'line scroll', 'card refresh', 'play area', 'equip area', 'phase', 'token'];

test('the Colonel never speaks like a rules sheet', () => {
  for (let seed = 1; seed < 15; seed++) {
    const state = AgentDecker.createInitialState(cardDefs, missions, seed * 41 + 3);
    const advice = Advisor.advise(state, registry, missions);
    const transmission = Radio.describe(advice, state, registry, missions);
    transmission.text.forEach((line) => {
      const lower = line.toLowerCase();
      BANNED.forEach((word) => {
        assert.ok(!lower.includes(word), 'radio copy used rules vocabulary "' + word + '": ' + line);
      });
    });
  }
});

test('the plain register does use the printed terms', () => {
  const state = AgentDecker.createInitialState(cardDefs, missions, 909);
  const advice = Advisor.advise(state, registry, missions);
  const transmission = Radio.describe(advice, state, registry, missions);
  const joined = transmission.plain.join(' ').toLowerCase();
  assert.ok(joined.includes('interact') || joined.includes('end turn'), 'plain mode should state the mechanics');
});

test('every belt move the Colonel recommends is a card the UI can light up', () => {
  for (let seed = 1; seed < 12; seed++) {
    const state = AgentDecker.createInitialState(cardDefs, missions, seed * 29 + 1);
    const advice = Advisor.advise(state, registry, missions);
    const transmission = Radio.describe(advice, state, registry, missions, { level: 'full' });
    advice.best.actions.forEach((action) => {
      if (action.kind !== 'interact') return;
      assert.ok(transmission.targets.includes(action.uid), 'missing highlight for ' + action.uid);
    });
    const reached = (advice.reached || []).map((r) => r.uid);
    const onBelt = state.line.filter(Boolean).map((card) => card.uid);
    assert.ok(transmission.targets.every((uid) => reached.includes(uid)), 'recommended a card that is not reachable');
    assert.ok(transmission.altTargets.every((uid) => onBelt.includes(uid) && !transmission.targets.includes(uid)), 'a left-behind mark is not a belt obstacle');
    reached.forEach((uid) => {
      assert.ok(transmission.targets.includes(uid) || transmission.altTargets.includes(uid), 'homebase said nothing about ' + uid);
    });
  }
});

test('the Colonel talks about the belt, never the hand', () => {
  for (let seed = 1; seed < 15; seed++) {
    const state = AgentDecker.createInitialState(cardDefs, missions, seed * 41 + 11);
    const advice = Advisor.advise(state, registry, missions);
    const transmission = Radio.describe(advice, state, registry, missions, { level: 'full' });
    const copy = transmission.text.join(' ').toLowerCase();
    advice.best.actions.filter((a) => a.kind === 'play').forEach((action) => {
      const name = action.name.toLowerCase();
      assert.ok(!copy.includes(name), 'the transmission read out a hand card "' + name + '": ' + transmission.text.join(' | '));
    });
    const belt = advice.best.actions.filter((a) => a.kind === 'interact');
    if (belt.length) {
      const fieldNames = belt.map((a) => Radio.FIELD_NAME[a.defId] || a.name.toLowerCase());
      assert.ok(fieldNames.some((name) => copy.includes(name)), 'no obstacle named: ' + transmission.text.join(' | '));
    }
  }
});

test('the transmission signs off and stays short', () => {
  for (let seed = 1; seed < 12; seed++) {
    const state = AgentDecker.createInitialState(cardDefs, missions, seed * 67 + 5);
    const advice = Advisor.advise(state, registry, missions);
    const transmission = Radio.describe(advice, state, registry, missions);
    assert.strictEqual(transmission.text[transmission.text.length - 1], 'Over.', 'homebase always signs off');
    assert.ok(transmission.text.length <= 8, 'too many lines: ' + transmission.text.length);
    transmission.text.forEach((line) => assert.ok(line.length <= 120, 'line too long: ' + line));
  }
});

test('the mission brief carries the real objective', () => {
  const brief = Radio.missionBrief(missions[0]);
  assert.ok(brief.includes('6 Stealth'), brief);
  assert.ok(Radio.missionBrief(missions[4]).includes('face down'), 'mission five is the whole line face down');
  assert.ok(Radio.missionBrief(missions[2]).includes('7 cards'), 'mission three is a hand-size goal');
});

test('the closing line matches how close the run was', () => {
  assert.ok(Radio.missionEnd(missions[0], 0).toLowerCase().includes('clean'));
  assert.ok(Radio.missionEnd(missions[0], 45).includes('45'));
});

test('advice is stable: the same position produces the same transmission', () => {
  const a = Radio.describe(
    Advisor.advise(AgentDecker.createInitialState(cardDefs, missions, 1234), registry, missions),
    AgentDecker.createInitialState(cardDefs, missions, 1234), registry, missions
  );
  const b = Radio.describe(
    Advisor.advise(AgentDecker.createInitialState(cardDefs, missions, 1234), registry, missions),
    AgentDecker.createInitialState(cardDefs, missions, 1234), registry, missions
  );
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

test('the nudge names one belt move, the full plan two', () => {
  for (let seed = 1; seed < 8; seed++) {
    const state = AgentDecker.createInitialState(cardDefs, missions, seed * 13 + 3);
    const advice = Advisor.advise(state, registry, missions);
    const nudge = Radio.describe(advice, state, registry, missions, { level: 'nudge' });
    const full = Radio.describe(advice, state, registry, missions, { level: 'full' });
    assert.ok(nudge.targets.length <= full.targets.length, 'the nudge never marks more than the plan');
    assert.ok(nudge.targets.length <= 1, 'the nudge should single out one move');
    assert.ok(full.targets.length <= 2, 'the full plan names at most two belt moves');
    assert.ok(nudge.targets.every((uid) => full.targets.includes(uid)), 'the nudge is a subset of the plan');
  }
});
