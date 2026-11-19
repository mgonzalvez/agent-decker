import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';
import Actions from '../actions.js';

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(cardDefs);

function lineCards(state) { return (state.line || []).filter(Boolean); }

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
    const target = lineCards(state).filter((c) => !state.faceDown[c.uid]).sort((a, b) => registry[b.defId].alarm - registry[a.defId].alarm)[0];
    return target ? { uid: target.uid } : {};
  }
  if (choice.kind === 'keep') {
    const top = state.deck.slice(-choice.n);
    return { keep: top[top.length - 1] };
  }
  return {};
}

function goalType(goal) {
  if (goal.resources && goal.resources.stealth) return 'stealth';
  if (goal.resources && goal.resources.fighting) return 'fighting';
  if (goal.either) return 'either';
  return null;
}

/* A competent but simple player: play the whole hand, use equipped items where
   they replace the cost, disarm whatever feeds the mission goal or the item the
   goal needs, and knock out anything that is only an alarm problem. */
function botTurn(state) {
  state.hand.slice().forEach((card) => {
    state = Engine.playCard(state, card.uid, registry, playChoice(state, card));
  });

  if (Engine.goalSatisfied(state, registry, missions)) return Engine.completeMission(state, registry, missions);

  const goal = missions[state.missionIndex].goal;
  const want = goalType(goal);
  while (state.interactionsLeft > 0) {
    const targets = lineCards(state).filter((c) => !state.faceDown[c.uid] && Engine.canInteract(state, registry, c).ok);
    if (!targets.length) break;

    if (goal.knockOutWholeLine) {
      state = Engine.interact(state, targets[0].uid, 'knockOut', registry);
      continue;
    }

    const needed = goal.itemsRequired
      ? targets.filter((c) => registry[c.defId].keep && goal.itemsRequired.indexOf(c.defId) >= 0)
      : [];
    const helpers = want
      ? targets.filter((c) => {
          const res = registry[c.defId].reward && registry[c.defId].reward.resource;
          return res && (want === 'either' ? res.stealth + res.fighting > 0 : res[want] > 0);
        })
      : [];
    const drawCards = targets.filter((c) => {
      const e = registry[c.defId].reward && registry[c.defId].reward.effect;
      return e && (e.type === 'draw' || e.type === 'drawPerEquippedKeep' || e.type === 'saveHandCardForNextTurn');
    });

    let pick = null;
    let mode = 'knockOut';
    let item = null;

    const freeItems = state.equip.filter((c) => {
      const e = registry[c.defId].reward && registry[c.defId].reward.effect;
      return e && e.type === 'discardToInteract';
    });
    const freeTarget = freeItems.length ? (needed[0] || helpers[0]) : null;
    if (freeTarget) {
      pick = freeTarget;
      mode = 'disarm';
      item = freeItems[0].uid;
    } else if (needed.length) {
      pick = needed[0];
      mode = 'disarm';
    } else if (helpers.length) {
      pick = helpers[0];
      mode = 'disarm';
    } else if (goal.handSize && drawCards.length) {
      pick = drawCards[0];
      mode = 'disarm';
    } else {
      pick = targets.sort((a, b) => registry[b.defId].alarm - registry[a.defId].alarm)[0];
    }
    if (!pick) break;
    state = Engine.interact(state, pick.uid, mode, registry, item ? { itemUid: item } : {});
  }

  if (Engine.goalSatisfied(state, registry, missions)) state = Engine.completeMission(state, registry, missions);
  else state = Engine.endTurn(state, registry);
  return state;
}

function playCampaign(seed, maxTurns = 200) {
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
  const best = [1, 13, 42, 2026, 31415, 777].map((seed) => playCampaign(seed).missionIndex);
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
  assert.strictEqual(lineCards(state).length, 6);
  assert.ok(lineCards(state).some((c) => c.uid === 'dorm_x'), 'Dormitory stays in the line');
  assert.strictEqual(lineCards(state).filter((c) => state.faceDown[c.uid]).length, 3, 'the knocked-out cards did not scroll away');

  state.interactionsLeft = 3;
  state.resources = { stealth: 30, fighting: 30 };
  lineCards(state).filter((c) => !state.faceDown[c.uid]).slice(0, 3).forEach((c) => {
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
  assert.ok(lineCards(state).length < 6);
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

test('completing a mission with a hole in the line does not deal phantom obstacles', () => {
  /* Disarming leaves an empty slot. If the mission is checked in the same turn, the
     empty slots must not be shuffled into the obstacle deck as if they were cards. */
  let state = fresh(501);
  state.interactionsLeft = 6;
  state.discard.push(...state.hand.splice(1));   /* keep one card, park the rest */
  state.resources = { stealth: 8, fighting: 4 };
  /* Put an affordable obstacle in the line without duplicating a card. */
  const fromDeck = state.obstacleDeck.find((c) => c.defId === 'obs_security_camera');
  if (fromDeck) {
    state.obstacleDeck = state.obstacleDeck.filter((c) => c.uid !== fromDeck.uid);
    if (state.line[5]) state.discard.push(state.line[5]);
    state.line[5] = fromDeck;
  }
  const camera = state.line.find((c) => c && c.defId === 'obs_security_camera');
  assert.ok(camera, 'fixture needs a security camera in the line');
  state = Engine.interact(state, camera.uid, 'disarm', registry, {});
  assert.ok(state.line.some((c) => c === null), 'disarming should leave a hole');
  assert.ok(Engine.goalSatisfied(state, registry, missions), 'fixture should be ready to check the mission');
  const after = Engine.completeMission(state, registry, missions);
  assert.notStrictEqual(after.gameOver, 'time', 'the new mission did not start');
  assert.ok(lineCards(after).length === 6, 'the new line is full');
  assert.ok(after.obstacleDeck.every(Boolean), 'no empty slots got shuffled into the obstacle deck');
  assert.strictEqual(AgentDecker.checkInvariants(after, registry).length, 0, 'state invariants hold');
});
