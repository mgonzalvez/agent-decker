import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(cardDefs);

function fresh(seed) {
  return AgentDecker.createInitialState(cardDefs, missions, seed);
}

function assertClean(state) {
  assert.deepStrictEqual(AgentDecker.checkInvariants(state, registry), []);
}

test('a full turn: cards are played, the line scrolls, the hand is redrawn', () => {
  let state = fresh(42);
  const exiting = state.line[5];
  const expectedAlarm = registry[exiting.defId].alarm;

  state.hand.slice().forEach((card) => {
    state = Engine.playCard(state, card.uid, registry);
  });
  assert.strictEqual(state.playArea.length + state.hand.length, 4);

  state = Engine.endTurn(state, registry);
  assertClean(state);
  assert.strictEqual(state.alarm, expectedAlarm);
  assert.strictEqual(state.line.length, 6);
  assert.strictEqual(state.obstacleDiscard.length, 1);
  assert.strictEqual(state.hand.length, 4);
  assert.strictEqual(state.resources.stealth + state.resources.fighting, 0, 'unspent resources evaporate');
  assert.strictEqual(state.interactionsLeft, 1);
  assert.strictEqual(state.turn, 2);
});

test('a knocked-out card raises no alarm when it leaves the line', () => {
  let state = fresh(1);
  state.obstacleDeck = [];
  state.obstacleDiscard = [];
  state.line = [
    { uid: 'obs_guard_0', defId: 'obs_guard' },
    { uid: 'obs_guard_1', defId: 'obs_guard' },
    { uid: 'obs_guard_2', defId: 'obs_guard' },
    { uid: 'obs_security_camera_0', defId: 'obs_security_camera' },
    { uid: 'obs_security_camera_1', defId: 'obs_security_camera' },
    { uid: 'obs_yard_door_0', defId: 'obs_yard_door' }
  ];
  state.faceDown['obs_yard_door_0'] = true;
  state = Engine.lineScroll(state, registry);
  assert.strictEqual(state.alarm, 0, 'the knocked-out card exits silently');
  assert.strictEqual(state.obstacleDiscard.length, 1);
});

test('only one interaction is allowed per turn at the start of the campaign', () => {
  let state = fresh(11);
  state = Engine.playCard(state, state.hand[0].uid, registry);
  state = Engine.playCard(state, state.hand[0].uid, registry);
  const affordable = state.line.filter((c) => Engine.canInteract(state, registry, c).ok);
  assert.ok(affordable.length, 'expected at least one affordable obstacle');
  state = Engine.interact(state, affordable[0].uid, 'knockOut', registry);
  const second = state.line.filter((c) => Engine.canInteract(state, registry, c).ok);
  assert.strictEqual(second.length, 0, 'interactions should be exhausted');
});

test('disarming a card with the KEEP icon equips it instead of sending it to the play area', () => {
  let state = fresh(3);
  const keep = state.line.find((c) => registry[c.defId].keep);
  if (!keep) return;
  const stealthCards = state.hand.filter((c) => registry[c.defId].reward && registry[c.defId].reward.resource && registry[c.defId].reward.resource.stealth);
  stealthCards.forEach((c) => { state = Engine.playCard(state, c.uid, registry); });
  if (!Engine.canInteract(state, registry, keep).ok) return;
  state = Engine.interact(state, keep.uid, 'disarm', registry);
  assert.ok(state.equip.some((c) => c.uid === keep.uid));
  assert.ok(!state.playArea.some((c) => c.uid === keep.uid));
});

test('guard dog slides right to the first person in the line when it appears', () => {
  let state = fresh(5);
  state.line = [
    { uid: 'obs_guard_0', defId: 'obs_guard' },
    { uid: 'obs_yard_door_0', defId: 'obs_yard_door' },
    { uid: 'obs_yard_door_1', defId: 'obs_yard_door' },
    { uid: 'obs_guard_1', defId: 'obs_guard' },
    { uid: 'obs_guard_2', defId: 'obs_guard' },
    { uid: 'obs_waste_room_0', defId: 'obs_waste_room' }
  ];
  state.obstacleDeck = [{ uid: 'obs_guard_dog_0', defId: 'obs_guard_dog' }];
  state.obstacleDiscard = [];
  state.line.pop();
  state = Engine.refresh(state, registry);
  const dogIndex = state.line.findIndex((c) => c.defId === 'obs_guard_dog');
  assert.ok(dogIndex > 0);
  assert.strictEqual(registry[state.line[dogIndex - 1].defId].obstacleType, 'person');
});

test('the patrolling guard slides two spaces per scroll and exits with its alarm', () => {
  let state = fresh(6);
  state.obstacleDeck = [];
  state.obstacleDiscard = [];
  state.line = [
    { uid: 'obs_yard_door_0', defId: 'obs_yard_door' },
    { uid: 'obs_yard_door_1', defId: 'obs_yard_door' },
    { uid: 'obs_guard_0', defId: 'obs_guard' },
    { uid: 'obs_guard_1', defId: 'obs_guard' },
    { uid: 'obs_guard_2', defId: 'obs_guard' },
    { uid: 'obs_patrolling_guard_0', defId: 'obs_patrolling_guard' }
  ];
  state = Engine.lineScroll(state, registry);
  const guardIndex = state.line.findIndex((c) => c.defId === 'obs_patrolling_guard');
  assert.ok(guardIndex < 0, 'the patrolling guard slid off the line');
  assert.ok(state.obstacleDiscard.some((c) => c.defId === 'obs_patrolling_guard'));
  assert.ok(state.alarm >= registry.obs_patrolling_guard.alarm);
});

test('radio tower pulls every person in the line right next to it (and stays in the line)', () => {
  let state = fresh(9);
  state.obstacleDeck = [{ uid: 'obs_radio_tower_0', defId: 'obs_radio_tower' }];
  state.obstacleDiscard = [];
  state.line = [
    { uid: 'obs_guard_0', defId: 'obs_guard' },
    { uid: 'obs_yard_door_0', defId: 'obs_yard_door' },
    { uid: 'obs_guard_1', defId: 'obs_guard' },
    { uid: 'obs_security_camera_0', defId: 'obs_security_camera' },
    { uid: 'obs_guard_2', defId: 'obs_guard' }
  ];
  state = Engine.refresh(state, registry);
  const tower = state.line.findIndex((c) => c.defId === 'obs_radio_tower');
  assert.ok(tower >= 0, 'the radio tower is still in the line');
  assert.strictEqual(state.line.length, 6);
  assert.strictEqual(registry[state.line[tower + 1].defId].obstacleType, 'person');
  assert.strictEqual(registry[state.line[tower + 2].defId].obstacleType, 'person');
  assert.strictEqual(registry[state.line[tower + 3].defId].obstacleType, 'person');
});

test('mission 1 completes when 6 stealth are available in one turn', () => {
  let state = fresh(42);
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), false);
  state.resources.stealth = 6;
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), true);
  state = Engine.completeMission(state, registry, missions);
  assertClean(state);
  assert.strictEqual(state.missionIndex, 1);
  assert.strictEqual(state.alarm, 0);
  assert.strictEqual(state.line.length, 6);
  assert.ok(state.equip.some((c) => c.defId === 'goal_mission_one'), 'Map reward equipped');
  assert.ok(state.obstacleDiscard.length === 0, 'the injected obstacles were shuffled into the deck');
  assert.ok(state.missionDeck.length === 23 - 1 - 3);
});

test('mission 2 needs the Guard Uniform equipped, not just the resources', () => {
  let state = fresh(42);
  state = Engine.completeMission(state, registry, missions);
  state.resources.fighting = 6;
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), false);
  state.equip.push({ uid: 'obs_locker_room_0', defId: 'obs_locker_room' });
  assert.strictEqual(Engine.goalSatisfied(state, registry, missions), true);
  state = Engine.completeMission(state, registry, missions);
  assert.strictEqual(state.rules.interactionLimit, 2);
});

test('the campaign ends in game over when the alarm hits 50', () => {
  let state = fresh(13);
  state.alarm = 49;
  const exiting = state.line[5];
  if (registry[exiting.defId].alarm === 0) return;
  state = Engine.lineScroll(state, registry);
  assert.ok(state.alarm >= 50);
  assert.strictEqual(state.gameOver, 'alarm');
});

test('an equipped KEEP item can pay an interaction instead of resources, and goes to the discard', () => {
  let state = fresh(7);
  const keycard = state.obstacleDeck.find((c) => c.defId === 'obs_sleeping_guard');
  if (!keycard) return;
  state.obstacleDeck = state.obstacleDeck.filter((c) => c.uid !== keycard.uid);
  state.equip.push(keycard);
  state.resources = { stealth: 0, fighting: 0 };

  const person = state.line.find((c) => registry[c.defId].obstacleType === 'person');
  const door = state.line.find((c) => registry[c.defId].obstacleType === 'door');
  assert.ok(Engine.canInteract(state, registry, person).ok, 'Keycard makes a person interactable with no resources');
  if (door) assert.strictEqual(Engine.canInteract(state, registry, door).ok, false, 'Keycard only works on people');

  state = Engine.interact(state, person.uid, 'disarm', registry, { itemUid: keycard.uid });
  assertClean(state);
  assert.ok(state.discard.some((c) => c.uid === keycard.uid), 'the item is placed in the discard');
  assert.ok(!state.equip.some((c) => c.uid === keycard.uid));
  assert.ok(state.playArea.some((c) => c.uid === person.uid), 'the person is disarmed');
});

test('only a card with the right effect may knock out an adjacent card instead of itself', () => {
  let state = fresh(7);
  state.obstacleDeck = [];
  state.obstacleDiscard = [];
  state.line = [
    { uid: 'inspector_0', defId: 'obs_inspector' },
    { uid: 'clumsy_0', defId: 'obs_clumsy_guard' },
    { uid: 'guard_0', defId: 'obs_guard' }
  ];
  state.faceDown = {};
  state.interactionsLeft = 1;
  state.resources = { stealth: 0, fighting: 8 };

  state = Engine.interact(state, 'clumsy_0', 'knockOutAdjacent', registry, { uid: 'guard_0' });
  assert.ok(state.faceDown['guard_0'], 'the adjacent guard is knocked out');
  assert.ok(!state.faceDown['clumsy_0'], 'Clumsy Guard stays in the line');
  assert.strictEqual(state.resources.fighting, 0, 'the cost is still paid');

  let other = fresh(7);
  other.obstacleDeck = [];
  other.obstacleDiscard = [];
  other.line = [
    { uid: 'guard_a', defId: 'obs_guard' },
    { uid: 'guard_b', defId: 'obs_guard' }
  ];
  other.faceDown = {};
  other.interactionsLeft = 1;
  other.resources = { stealth: 6, fighting: 0 };
  assert.throws(() => Engine.interact(other, 'guard_a', 'knockOutAdjacent', registry, { uid: 'guard_b' }), /does not let you/);

  let far = fresh(7);
  far.obstacleDeck = [];
  far.obstacleDiscard = [];
  far.line = [
    { uid: 'clumsy_far', defId: 'obs_clumsy_guard' },
    { uid: 'door_a', defId: 'obs_yard_door' },
    { uid: 'guard_c', defId: 'obs_guard' }
  ];
  far.faceDown = {};
  far.interactionsLeft = 1;
  far.resources = { stealth: 0, fighting: 8 };
  assert.throws(() => Engine.interact(far, 'clumsy_far', 'knockOutAdjacent', registry, { uid: 'guard_c' }), /not adjacent/);
});

test('Inspector flips the last card of the line face up so it raises its alarm on exit', () => {
  let state = fresh(7);
  state.obstacleDeck = [];
  state.obstacleDiscard = [];
  state.line = [
    { uid: 'inspector_x', defId: 'obs_inspector' },
    { uid: 'door_x', defId: 'obs_yard_door' },
    { uid: 'camera_x', defId: 'obs_security_camera' },
    { uid: 'guard_x', defId: 'obs_guard' }
  ];
  state.faceDown = { guard_x: true };
  state = Engine.lineScroll(state, registry);
  assert.strictEqual(state.alarm, registry.obs_guard.alarm, 'the flipped card raises alarm when it leaves the line');
  assert.ok(state.obstacleDiscard.some((c) => c.uid === 'guard_x'));
  assert.ok(state.line.some((c) => c.defId === 'obs_inspector'), 'Inspector stays in the line');
});

function giveToHand(state, defId) {
  for (const zone of ['deck', 'discard', 'obstacleDeck', 'obstacleDiscard', 'missionDeck', 'playArea']) {
    const i = state[zone].findIndex((c) => c.defId === defId);
    if (i >= 0) {
      const card = state[zone].splice(i, 1)[0];
      state.hand.push(card);
      return card;
    }
  }
  return null;
}

test('Recall (Inspector) moves a chosen discard card into your hand', () => {
  let state = fresh(7);
  const inspector = giveToHand(state, 'obs_inspector');
  const recycled = state.deck.pop();
  state.discard.push(recycled);
  state = Engine.playCard(state, inspector.uid, registry, { uid: recycled.uid });
  assertClean(state);
  assert.ok(state.hand.some((c) => c.uid === recycled.uid));
  assert.ok(!state.discard.some((c) => c.uid === recycled.uid));
});

test('Plan Ahead (Archive Door) reorders the top of the deck as chosen', () => {
  let state = fresh(7);
  const door = giveToHand(state, 'obs_archive_door');
  const top = state.deck.slice(-3).map((c) => c.uid);
  state = Engine.playCard(state, door.uid, registry, { order: top.slice().reverse() });
  assertClean(state);
  assert.deepStrictEqual(state.deck.slice(-3).map((c) => c.uid), top.slice().reverse());
});

test('Just The Thing (Sniper) puts a chosen deck card on top and reshuffles the rest', () => {
  let state = fresh(7);
  const sniper = giveToHand(state, 'obs_sniper');
  const chosen = state.deck[0];
  state = Engine.playCard(state, sniper.uid, registry, { uid: chosen.uid });
  assertClean(state);
  assert.strictEqual(state.deck[state.deck.length - 1].uid, chosen.uid);
});

test('Distraction (Dormitory) pulls a chosen obstacle to the start of the line', () => {
  let state = fresh(7);
  const dormitory = giveToHand(state, 'obs_dormitory');
  const target = state.line[state.line.length - 1];
  state = Engine.playCard(state, dormitory.uid, registry, { uid: target.uid });
  assertClean(state);
  assert.strictEqual(state.line[0].uid, target.uid);
});

test('Bazooka and Optic Camouflage go to the obstacles discard when used, not to your own', () => {
  let state = fresh(7);
  const bazooka = giveToHand(state, 'obs_guard_with_bazooka');
  state = Engine.playCard(state, bazooka.uid, registry);
  assert.ok(state.obstacleDiscard.some((c) => c.uid === bazooka.uid));
  assert.strictEqual(state.resources.fighting, 5);

  const camouflage = giveToHand(state, 'obs_tech_container');
  state = Engine.playCard(state, camouflage.uid, registry);
  assertClean(state);
  assert.ok(state.obstacleDiscard.some((c) => c.uid === camouflage.uid));
  assert.ok(!state.equip.some((c) => c.uid === camouflage.uid));
});

function takeFromAny(state, defId, zone) {
  for (const from of ['deck', 'discard', 'obstacleDeck', 'obstacleDiscard', 'missionDeck', 'playArea', 'line', 'hand', 'equip']) {
    const i = state[from].findIndex((c) => c.defId === defId);
    if (i >= 0) {
      const card = state[from].splice(i, 1)[0];
      if (zone) state[zone].push(card);
      return card;
    }
  }
  return null;
}

test('drawing an item (KEEP) card equips it instead of taking a hand slot', () => {
  let state = fresh(11);
  const keycard = takeFromAny(state, 'obs_sleeping_guard', null);
  state.hand.forEach((c) => state.deck.push(c));
  state.hand = [];
  state.deck.push(keycard);
  state = Engine.refresh(state, registry);
  assertClean(state);
  assert.ok(state.equip.some((c) => c.uid === keycard.uid), 'the item went to the Equip Area');
  assert.strictEqual(state.hand.length, 4, 'the hand is still filled to its size');
});

test('equipped items give their once-per-turn resources, and Siren draws one card per item (max three)', () => {
  let state = fresh(21);
  const map = takeFromAny(state, 'goal_mission_one', 'equip');
  const uniform = takeFromAny(state, 'obs_locker_room', 'equip');
  const siren = takeFromAny(state, 'obs_siren', 'equip');
  state.hand.forEach((c) => state.deck.push(c));
  state.hand = [];
  state = Engine.refresh(state, registry);
  assertClean(state);
  assert.ok(map && uniform && siren);
  assert.strictEqual(state.hand.length, 7, '4 drawn + 3 from Gear Up');
  assert.strictEqual(state.resources.stealth, 2, 'Map and Guard Uniform each give 1 Stealth once per turn');
});

test('Optic Camouflage can be used from the Equip Area and lands in the obstacles discard', () => {
  let state = fresh(31);
  const camouflage = takeFromAny(state, 'obs_tech_container', 'equip');
  state = Engine.useItem(state, camouflage.uid, registry);
  assertClean(state);
  assert.ok(state.obstacleDiscard.some((c) => c.uid === camouflage.uid));
  assert.ok(!state.equip.some((c) => c.uid === camouflage.uid));
});

test('a scripted 40-turn bot keeps every invariant and terminates', () => {
  let state = fresh(2026);
  for (let turn = 0; turn < 40 && !state.gameOver; turn++) {
    state.hand.slice().forEach((card) => {
      state = Engine.playCard(state, card.uid, registry);
    });
    const target = state.line.find((c) => Engine.canInteract(state, registry, c).ok);
    if (target) state = Engine.interact(state, target.uid, 'knockOut', registry);
    if (Engine.goalSatisfied(state, registry, missions)) state = Engine.completeMission(state, registry, missions);
    else state = Engine.endTurn(state, registry);
    assertClean(state);
  }
  assert.ok(state.gameOver, 'the bot should eventually win or lose');
});
