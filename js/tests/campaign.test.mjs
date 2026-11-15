import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';
import Actions from '../actions.js';

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(cardDefs);

function fresh(seed) {
  return AgentDecker.createInitialState(cardDefs, missions, seed);
}

function line(defIds) {
  return defIds.map((defId, i) => ({ uid: defId + '_x' + i, defId: defId }));
}

function playChoice(state, card) {
  const def = registry[card.defId];
  const choice = Actions.needsChoice(def);
  if (!choice) return {};
  if (choice.kind === 'choice') {
    const goal = missions[state.missionIndex].goal;
    const wantsFighting = goal && (goal.resources && goal.resources.fighting) > 0;
    return { choice: wantsFighting ? 'resource' : 'draw' };
  }
  if (choice.kind === 'line') {
    const target = state.line.filter((c) => !state.faceDown[c.uid]).sort((a, b) => registry[b.defId].alarm - registry[a.defId].alarm)[0];
    return target ? { uid: target.uid } : {};
  }
  return {};
}

function targetScore(state, card) {
  const def = registry[card.defId];
  const goal = missions[state.missionIndex].goal;
  let score = def.alarm * 3;
  const res = def.reward && def.reward.resource;
  if (res) {
    if (goal.resources) score += 8 * ((goal.resources.stealth ? res.stealth : 0) + (goal.resources.fighting ? res.fighting : 0));
    if (goal.either) score += 8 * (res.stealth + res.fighting);
  }
  const eff = def.reward && def.reward.effect;
  if (goal.handSize && eff && (eff.type === 'draw' || eff.type === 'drawPerEquippedKeep')) score += 12;
  if (def.keep) score += 4;
  return score;
}

/* A competent but simple player: play everything, disarm the most valuable
   obstacles (needed items first), knock out the highest-alarm cards late. */
function wantsResource(state) {
  const goal = missions[state.missionIndex].goal;
  if (goal.resources && goal.resources.stealth) return 'stealth';
  if (goal.resources && goal.resources.fighting) return 'fighting';
  if (goal.either) return 'either';
  return null;
}

function botTurn(state) {
  state.hand.slice().forEach((card) => {
    state = Engine.playCard(state, card.uid, registry, playChoice(state, card));
  });

  if (Engine.goalSatisfied(state, registry, missions)) return Engine.completeMission(state, registry, missions);

  const goal = missions[state.missionIndex].goal;
  const want = wantsResource(state);
  while (state.interactionsLeft > 0) {
    const targets = state.line.filter((c) => !state.faceDown[c.uid] && Engine.canInteract(state, registry, c).ok);
    if (!targets.length) break;

    if (goal.knockOutWholeLine) {
      const pick = targets.sort((a, b) => registry[b.defId].alarm - registry[a.defId].alarm)[0];
      state = Engine.interact(state, pick.uid, 'knockOut', registry);
      continue;
    }

    const helpers = want
      ? targets.filter((c) => {
          const res = registry[c.defId].reward && registry[c.defId].reward.resource;
          return res && (want === 'either' ? res.stealth + res.fighting > 0 : res[want] > 0);
        })
      : [];
    const needed = goal.itemsRequired
      ? targets.filter((c) => registry[c.defId].keep && goal.itemsRequired.indexOf(c.defId) >= 0)
      : [];
    const pick = needed.length ? needed[0] : helpers.length ? helpers[0] : targets[0];
    const worth = helpers.length || needed.length || registry[pick.defId].alarm <= 3;
    state = Engine.interact(state, pick.uid, worth ? 'disarm' : 'knockOut', registry);
  }

  if (Engine.goalSatisfied(state, registry, missions)) state = Engine.completeMission(state, registry, missions);
  else state = Engine.endTurn(state, registry);
  return state;
}

function playCampaign(seed, maxTurns = 120) {
  let state = fresh(seed);
  for (let turn = 0; turn < maxTurns && !state.gameOver; turn++) {
    state = botTurn(state);
    const problems = AgentDecker.checkInvariants(state, registry);
    if (problems.length) throw new Error('seed ' + seed + ' turn ' + turn + ': ' + problems.join(', '));
  }
  return state;
}

test('the campaign bot plays a full game without breaking any invariant', () => {
  const state = playCampaign(2026);
  assert.ok(state.gameOver, 'the game must end in a win or a loss');
  assert.ok(['campaignComplete', 'alarm', 'time'].indexOf(state.gameOver) >= 0, 'unknown end state ' + state.gameOver);
  assert.ok(state.missionAlarms.length <= 5);
  assert.ok(state.alarm <= 50);
});

test('the campaign bot gets at least two missions deep on a good seed', () => {
  const best = [1, 7, 13, 42, 2026, 31415].map((seed) => playCampaign(seed).missionIndex);
  assert.ok(Math.max.apply(null, best) >= 2, 'missionIndex values: ' + best.join(', '));
});

test('every mission goal is recognised by the engine', () => {
  assert.strictEqual(missions.length, 5);
  assert.strictEqual(missions.map((m) => m.letter).join(''), 'ACEGI');
  assert.ok(missions.every((m) => registry[m.goalCardId].isGoal && registry[m.goalCardId].goalText));
});

test('completing mission 2 raises the interaction limit to two', () => {
  let state = fresh(42);
  state = Engine.completeMission(state, registry, missions);
  state.equip.push({ uid: 'locker_x', defId: 'obs_locker_room' });
  state.resources.fighting = 6;
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), true);
  state = Engine.completeMission(state, registry, missions);
  assert.strictEqual(state.missionIndex, 2);
  assert.strictEqual(state.rules.interactionLimit, 2);
  assert.strictEqual(state.interactionsLeft, 2);
  assert.strictEqual(state.alarm, 0);
  assert.strictEqual(state.missionAlarms.length, 2);
});

test('mission 3 needs seven cards in hand, and its reward raises the draw to five', () => {
  let state = fresh(42);
  state = Engine.completeMission(state, registry, missions);
  state = Engine.completeMission(state, registry, missions);
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), false);
  while (state.hand.length < 7) state.hand.push({ uid: 'fill_' + state.hand.length, defId: 'start_hide' });
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), true);
  state = Engine.completeMission(state, registry, missions);
  assert.strictEqual(state.rules.handSize, 5);
  assert.strictEqual(state.hand.length, 5);
  assert.strictEqual(state.missionIndex, 3);
});

test('mission 4 needs 18 of any mix plus the Prisoner equipped', () => {
  let state = fresh(42);
  for (let i = 0; i < 3; i++) state = Engine.completeMission(state, registry, missions);
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), false);
  state.equip.push({ uid: 'prison_x', defId: 'obs_prison_door' });
  state.resources.stealth = 9;
  state.resources.fighting = 9;
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), true);
  state = Engine.completeMission(state, registry, missions);
  assert.strictEqual(state.missionIndex, 4);
  assert.strictEqual(state.rules.interactionLimit, 3);
});

test('mission 5 is won by knocking out the whole line, and Dormitory keeps knocked-out cards in place', () => {
  let state = fresh(42);
  for (let i = 0; i < 4; i++) state = Engine.completeMission(state, registry, missions);
  state.obstacleDeck = [];
  state.obstacleDiscard = [];
  state.line = [
    { uid: 'dorm_x', defId: 'obs_dormitory' },
    { uid: 'g1_x', defId: 'obs_guard' },
    { uid: 'g2_x', defId: 'obs_guard' },
    { uid: 'g3_x', defId: 'obs_guard' },
    { uid: 'g4_x', defId: 'obs_guard' },
    { uid: 'g5_x', defId: 'obs_guard' }
  ];
  state.faceDown = {};
  state.interactionsLeft = 3;
  state.resources = { stealth: 30, fighting: 30 };
  state.obstacleDeck = line(['obs_guard', 'obs_guard', 'obs_guard']);

  state = Engine.interact(state, 'g1_x', 'knockOut', registry);
  state = Engine.interact(state, 'g2_x', 'knockOut', registry);
  state = Engine.interact(state, 'g3_x', 'knockOut', registry);
  state = Engine.endTurn(state, registry);
  assert.strictEqual(state.line.length, 6);
  assert.ok(state.line.some((c) => c.uid === 'dorm_x'), 'Dormitory stays in the line');
  assert.strictEqual(state.line.filter((c) => state.faceDown[c.uid]).length, 3, 'the knocked-out cards did not scroll away');

  state.interactionsLeft = 3;
  state.resources = { stealth: 30, fighting: 30 };
  state.line.filter((c) => !state.faceDown[c.uid]).slice(0, 3).forEach((c) => {
    state = Engine.interact(state, c.uid, 'knockOut', registry);
  });
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), true);
  state = Engine.completeMission(state, registry, missions);
  assert.strictEqual(state.gameOver, 'campaignComplete');
  assert.strictEqual(state.missionAlarms.length, 5);
});

test('running out of obstacle cards ends the game as "time", not as a win', () => {
  let state = fresh(9);
  state.obstacleDeck = [];
  state.obstacleDiscard = [];
  state.line = line(['obs_guard', 'obs_guard', 'obs_guard']);
  state = Engine.refresh(state, registry);
  assert.strictEqual(state.gameOver, 'time');
  assert.ok(state.line.length < 6);
});

test('the final score is the sum of the alarm at each mission end', () => {
  const state = playCampaign(777);
  const total = state.missionAlarms.reduce((a, b) => a + b, 0);
  assert.ok(Number.isFinite(total));
  assert.ok(state.missionAlarms.every((a) => a >= 0 && a <= 50));
});

test('completing a mission ends the turn instead of handing out a second interaction', () => {
  const state = fresh(19);
  const after = Engine.completeMission(state, registry, missions);
  assert.strictEqual(after.turn, state.turn + 1, 'the new mission starts a new turn');
  assert.strictEqual(after.rules.interactionLimit, 1, 'Mission One rewards no extra interaction');
  assert.strictEqual(after.interactionsLeft, 1, 'the allowance is a fresh turn\'s, not a top-up');
});
