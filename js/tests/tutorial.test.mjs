import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';
import Tutorial from '../tutorial.js';

const defs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(defs);

function guided(seed, maxTurns = 25) {
  let state = AgentDecker.createInitialState(defs, missions, seed);
  state.tutorial = true;
  let turns = 0;
  while (!state.gameOver && turns < maxTurns) {
    const plan = Tutorial.plan(state, registry, missions);
    if (!plan || plan.id === 'finished') break;

    if (plan.id === 'missionCheck') {
      state = Engine.completeMission(state, registry, missions);
      continue;
    }
    if (plan.allowed.play && state.hand.length) {
      state = Engine.playCard(state, state.hand[0].uid, registry, {});
      continue;
    }
    if (plan.allowed.interact && state.interactionsLeft > 0) {
      if (plan.highlight && plan.highlight.disarm) {
        state = Engine.interact(state, plan.highlight.disarm, 'disarm', registry);
      } else if (plan.highlight && plan.highlight.knockOut) {
        state = Engine.interact(state, plan.highlight.knockOut, 'knockOut', registry);
      } else {
        state = Engine.endTurn(state, registry);
        turns++;
        continue;
      }
      continue;
    }
    state = Engine.endTurn(state, registry);
    turns++;
  }
  return { state, turns };
}

test('the coach starts by telling the player to play their hand', () => {
  const state = AgentDecker.createInitialState(defs, missions, 19);
  state.tutorial = true;
  const plan = Tutorial.plan(state, registry, missions);
  assert.equal(plan.id, 'play');
  assert.ok(plan.allowed.play);
  assert.ok(!plan.allowed.endTurn);
});

test('following the coach completes Mission One without tripping the alarm', () => {
  for (const seed of [11, 19, 21, 35, 41]) {
    const { state, turns } = guided(seed);
    assert.ok(!state.gameOver, 'seed ' + seed + ' should not be a loss');
    assert.equal(state.missionIndex, 1, 'seed ' + seed + ' should reach Mission Two');
    assert.ok(turns <= 12, 'seed ' + seed + ' took ' + turns + ' turns');
  }
});

test('the coach always highlights something legal', () => {
  const { state } = guided(19);
  assert.equal(state.missionIndex, 1);
  let fresh = AgentDecker.createInitialState(defs, missions, 19);
  fresh.tutorial = true;
  for (let i = 0; i < 5; i++) {
    const plan = Tutorial.plan(fresh, registry, missions);
    if (plan.highlight && plan.highlight.disarm) {
      const card = fresh.line.find((c) => c.uid === plan.highlight.disarm);
      assert.ok(Engine.canInteract(fresh, registry, card).ok);
    }
    if (plan.allowed.play) fresh = Engine.playCard(fresh, fresh.hand[0].uid, registry, {});
    else if (plan.allowed.interact && plan.highlight && plan.highlight.knockOut) {
      fresh = Engine.interact(fresh, plan.highlight.knockOut, 'knockOut', registry);
    } else {
      fresh = Engine.endTurn(fresh, registry);
    }
  }
});

test('after Mission One the coach hands the player to the campaign', () => {
  let state = guided(19).state;
  const plan = Tutorial.plan(state, registry, missions);
  assert.equal(plan.id, 'finished');
  assert.ok(plan.allowed.campaign);
});
