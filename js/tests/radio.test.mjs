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

test('every suggestion names the cards the UI has to light up', () => {
  for (let seed = 1; seed < 12; seed++) {
    const state = AgentDecker.createInitialState(cardDefs, missions, seed * 29 + 1);
    const advice = Advisor.advise(state, registry, missions);
    const transmission = Radio.describe(advice, state, registry, missions, { level: 'full' });
    advice.best.actions.forEach((action) => {
      if (action.kind === 'endTurn') return;
      assert.ok(transmission.targets.includes(action.uid), 'missing highlight for ' + action.uid);
    });
  }
});

test('transmissions are short enough to read on a radio set', () => {
  for (let seed = 1; seed < 12; seed++) {
    const state = AgentDecker.createInitialState(cardDefs, missions, seed * 67 + 5);
    const advice = Advisor.advise(state, registry, missions);
    const transmission = Radio.describe(advice, state, registry, missions);
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

test('a nudge marks only the decisive move; the full plan spells out the whole turn', () => {
  for (let seed = 1; seed < 8; seed++) {
    const state = AgentDecker.createInitialState(cardDefs, missions, seed * 13 + 3);
    const advice = Advisor.advise(state, registry, missions);
    const nudge = Radio.describe(advice, state, registry, missions, { level: 'nudge' });
    const full = Radio.describe(advice, state, registry, missions, { level: 'full' });
    assert.ok(nudge.targets.length <= full.targets.length, 'the nudge never marks more than the plan');
    assert.ok(nudge.targets.every((uid) => full.targets.includes(uid)), 'the nudge is a subset of the plan');
    const named = advice.best.actions.filter((a) => a.kind === 'play').map((a) => a.name.toLowerCase());
    if (named.length) {
      assert.ok(full.text.join(' ').toLowerCase().includes(named[0]), 'the full plan names the cards to play');
      assert.ok(!nudge.text.join(' ').toLowerCase().includes(named[0]), 'the nudge does not read the hand out card by card');
    }
  }
});
