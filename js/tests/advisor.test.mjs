import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';
import Advisor from '../advisor.js';

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(cardDefs);

function fresh(seed) {
  return AgentDecker.createInitialState(cardDefs, missions, seed);
}

function line(defIds) {
  return defIds.map((defId, i) => ({ uid: defId + '_x' + i, defId: defId }));
}

function stateWith(overrides) {
  const base = fresh(4242);
  return Object.assign(base, overrides);
}

function applyPlan(state, plan) {
  let s = state;
  for (const action of plan.actions) {
    const next = Advisor.applyAction(s, action, registry, missions);
    if (!next) return null;
    s = next;
  }
  return s;
}

test('every action the advisor enumerates is actually legal', () => {
  for (let seed = 1; seed < 25; seed++) {
    const state = fresh(seed * 31 + 7);
    Advisor.legalActions(state, registry, missions).forEach((action) => {
      const next = Advisor.applyAction(state, action, registry, missions);
      assert.ok(next, 'illegal action offered: ' + JSON.stringify(action));
      const problems = AgentDecker.checkInvariants(next, registry);
      assert.ok(problems.length === 0, 'action broke the state: ' + problems.join(', '));
    });
  }
});

test('a suggested plan can be executed step by step without throwing', () => {
  for (let seed = 1; seed < 20; seed++) {
    const state = fresh(seed * 97 + 3);
    const advice = Advisor.advise(state, registry, missions);
    assert.ok(advice, 'no advice for a live position');
    assert.ok(applyPlan(state, advice.best) !== null, 'plan could not be played: ' + JSON.stringify(advice.best.actions));
    if (advice.alternative) {
      assert.ok(applyPlan(state, advice.alternative) !== null, 'alternative plan could not be played');
    }
  }
});

test('the plan plays every card in hand before spending an interaction', () => {
  for (let seed = 1; seed < 10; seed++) {
    const state = fresh(seed * 71 + 11);
    const advice = Advisor.advise(state, registry, missions);
    const played = advice.best.actions.filter((a) => a.kind === 'play').length;
    assert.ok(played >= state.hand.length - 1,
      'the agent left ' + (state.hand.length - played) + ' cards unplayed in hand');
  }
});

test('plans always close the turn with Mission Check or End Turn', () => {
  for (let seed = 1; seed < 15; seed++) {
    const advice = Advisor.advise(fresh(seed * 13 + 1), registry, missions);
    const last = advice.best.actions[advice.best.actions.length - 1];
    assert.ok(last.kind === 'endTurn' || last.kind === 'missionCheck', 'plan does not end the turn');
  }
});

test('when the goal is reachable this turn, the Colonel says check the mission', () => {
  const state = stateWith({
    resources: { stealth: 6, fighting: 2 },
    hand: [],
    line: line(['obs_guard', 'obs_security_camera'])
  });
  assert.ok(Engine.goalSatisfied(state, registry, missions), 'fixture should satisfy Mission One');
  const advice = Advisor.advise(state, registry, missions);
  assert.ok(advice.missionDone, 'advisor missed an achievable mission check');
  assert.ok(advice.best.actions.some((a) => a.kind === 'missionCheck'));
});

test('the advisor prefers to silence the card about to exit', () => {
  /* Only one interaction, nothing else affordable: the 8-alarm camera at the exit
     beats the 4-alarm guard two slots back. */
  const state = stateWith({
    resources: { stealth: 2, fighting: 0 },
    hand: [],
    interactionsLeft: 1,
    line: [null, null, { uid: 'obs_guard_0', defId: 'obs_guard' }, null, null,
      { uid: 'obs_security_camera_0', defId: 'obs_security_camera' }]
  });
  const advice = Advisor.advise(state, registry, missions);
  const interacts = advice.best.actions.filter((a) => a.kind === 'interact');
  assert.ok(interacts.length === 1, 'expected exactly one interaction');
  assert.strictEqual(interacts[0].uid, 'obs_security_camera_0');
});

test('a knocked-out card is never offered as a target', () => {
  const state = stateWith({
    faceDown: { 'obs_guard_0': true },
    line: line(['obs_guard', 'obs_security_camera'])
  });
  Advisor.legalActions(state, registry, missions).forEach((a) => {
    if (a.kind === 'interact') assert.notStrictEqual(a.uid, 'obs_guard_0');
  });
});

test('advice is deterministic: the same position gives the same plan', () => {
  for (let seed = 1; seed < 12; seed++) {
    const a = Advisor.advise(fresh(seed * 51 + 5), registry, missions);
    const b = Advisor.advise(fresh(seed * 51 + 5), registry, missions);
    assert.strictEqual(JSON.stringify(a.best.actions), JSON.stringify(b.best.actions));
  }
});

test('the advisor never reads the obstacle deck order', () => {
  const source = readFileSync(new URL('../advisor.js', import.meta.url));
  assert.ok(!/obstacleDeck/.test(source), 'advisor touches the obstacle deck');
});

test('urgency weighting: the belt is scored by distance to the chute', () => {
  const farEnd = stateWith({ line: line(['obs_security_camera', 'obs_guard', 'obs_guard', 'obs_guard', 'obs_guard', 'obs_guard']) });
  const atExit = stateWith({ line: line(['obs_guard', 'obs_guard', 'obs_guard', 'obs_guard', 'obs_guard', 'obs_security_camera']) });
  assert.ok(Advisor.exposure(atExit, registry) > Advisor.exposure(farEnd, registry),
    'an alarm card at the exit must weigh more than the same card at the far end');
});

test('a Dormitory with a face-down card at the exit is flagged as a jam', () => {
  const state = stateWith({
    line: [null, null, null, { uid: 'obs_dormitory_0', defId: 'obs_dormitory' }, null,
      { uid: 'obs_guard_0', defId: 'obs_guard' }],
    faceDown: { 'obs_guard_0': true }
  });
  assert.ok(Advisor.beltJammed(state, registry), 'the belt should read as jammed');
  const notJammed = stateWith({ line: line(['obs_dormitory', 'obs_guard']) });
  assert.ok(!Advisor.beltJammed(notJammed, registry), 'a live belt is not jammed');
});

test('the search is fast enough to run on a button press', () => {
  const state = fresh(31337);
  const start = Date.now();
  Advisor.advise(state, registry, missions);
  assert.ok(Date.now() - start < 400, 'advice took too long for an interactive control');
});
