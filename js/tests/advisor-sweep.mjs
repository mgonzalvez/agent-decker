/* Weight sweep for the Homebase advisor.
   Run: node js/tests/advisor-sweep.mjs
   Every variant plays the same seeds with the advisor and reports how far it gets.
   Nothing here is a test; it is the tuning bench behind js/advisor.js. */
import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';
import Advisor from '../advisor.js';

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(cardDefs);

const BASE = Object.assign({}, Advisor.WEIGHTS);
const SEEDS = Array.from({ length: 10 }, (_, i) => 1013 + i * 41);
const TURN_CAP = 80;

const DRIVE = { progress: 60, pool: 30, stall: 6, alarm: 12, exposure: 7 };

const VARIANTS = [
  { name: 'bw6 pool10', horizon: 4, beamWidth: 6, weights: { ...DRIVE, pool: 10 } },
  { name: 'bw12 pool10', horizon: 4, beamWidth: 12, weights: { ...DRIVE, pool: 10 } },
  { name: 'bw12 pool20', horizon: 4, beamWidth: 12, weights: { ...DRIVE, pool: 20 } },
  { name: 'bw16 pool20', horizon: 4, beamWidth: 16, weights: { ...DRIVE, pool: 20 } },
  { name: 'bw12 pool20 h3', horizon: 3, beamWidth: 12, weights: { ...DRIVE, pool: 20, progress: 30, stall: 0 } }
];

function play(seed, horizon, beamWidth) {
  let state = AgentDecker.createInitialState(cardDefs, missions, seed);
  let turns = 0;
  while (!state.gameOver && turns < TURN_CAP) {
    turns++;
    const advice = Advisor.advise(state, registry, missions, { horizon, beamWidth });
    if (!advice) break;
    for (const action of advice.best.actions) {
      const next = Advisor.applyAction(state, action, registry, missions);
      if (next) state = next;
    }
  }
  const done = (state.missionAlarms || []).length;
  return {
    finished: state.gameOver === 'campaignComplete',
    missions: done,
    turns,
    alarm: done ? (state.missionAlarms || []).reduce((a, b) => a + b, 0) : 0
  };
}

for (const variant of VARIANTS) {
  Object.assign(Advisor.WEIGHTS, BASE, variant.weights || {});
  const horizon = variant.horizon || 4;
  const beamWidth = variant.beamWidth || 6;
  const results = SEEDS.map((seed) => play(seed, horizon, beamWidth));
  const finished = results.filter((r) => r.finished).length;
  const missionsAvg = results.reduce((s, r) => s + r.missions, 0) / results.length;
  const turnsAvg = results.reduce((s, r) => s + r.turns, 0) / results.length;
  const completed = results.filter((r) => r.finished);
  const alarmAvg = completed.length
    ? (completed.reduce((s, r) => s + r.alarm, 0) / completed.length).toFixed(1)
    : 'n/a';
  console.log(
    variant.name.padEnd(22),
    '| finished ' + finished + '/' + SEEDS.length,
    '| missions ' + missionsAvg.toFixed(2),
    '| turns ' + turnsAvg.toFixed(1),
    '| score ' + alarmAvg
  );
}
Object.assign(Advisor.WEIGHTS, BASE);
