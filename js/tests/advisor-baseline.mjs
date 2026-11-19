import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';
import Advisor from '../advisor.js';

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(cardDefs);

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* "Casual player": play what you can, deal with whatever looks scary, end the turn. */
function casualTurn(state) {
  let s = state;
  const hand = s.hand.slice();
  for (const card of hand) {
    if (!s.hand.some((c) => c.uid === card.uid)) continue;
    try { s = Engine.playCard(s, card.uid, registry, null); } catch (e) { /* skip */ }
  }
  if (Engine.goalSatisfied(s, registry, missions)) return Engine.completeMission(s, registry, missions);
  const acts = Advisor.legalActions(s, registry, missions).filter((a) => a.kind === 'interact');
  acts.sort((a, b) => b.alarm - a.alarm);
  for (const a of acts) {
    const nx = Advisor.applyAction(s, a, registry, missions);
    if (nx) { s = nx; break; }
  }
  if (Engine.goalSatisfied(s, registry, missions)) return Engine.completeMission(s, registry, missions);
  return Engine.endTurn(s, registry);
}

function play(seed, policy) {
  let s = AgentDecker.createInitialState(cardDefs, missions, seed);
  let guard = 0;
  while (!s.gameOver && guard < 400) {
    guard++;
    if (policy === 'advisor') {
      const a = Advisor.advise(s, registry, missions, policyOpts);
      if (!a) break;
      for (const act of a.best.actions) {
        const nx = Advisor.applyAction(s, act, registry, missions);
        if (!nx) break;
        s = nx;
        if (s.gameOver) break;
      }
    } else if (policy === 'casual') {
      s = casualTurn(s);
    } else {
      const acts = Advisor.legalActions(s, registry, missions);
      const r = rng(s.turn * 977 + seed);
      let picked = acts[Math.floor(r() * acts.length)];
      if (picked.kind === 'endTurn') picked = acts[Math.floor(r() * acts.length)];
      const nx = Advisor.applyAction(s, picked, registry, missions);
      if (nx) s = nx;
      if (!s.gameOver) s = Engine.endTurn(s, registry);
    }
  }
  return {
    missions: (s.missionAlarms || []).length,
    score: (s.missionAlarms || []).reduce((a, b) => a + b, 0),
    reason: s.gameOver,
    turns: s.turn
  };
}

const policyOpts = { horizon: Number(process.argv[2] || 3), beamWidth: Number(process.argv[3] || 6), maxActions: Number(process.argv[4] || 4) };
const seeds = [];
for (let i = 0; i < 30; i++) seeds.push(i * 7919 + 13);

function summarise(name, results) {
  const done = results.filter((r) => r.reason === 'campaignComplete');
  const avgMissions = results.reduce((a, r) => a + r.missions, 0) / results.length;
  const avgTurns = results.reduce((a, r) => a + r.turns, 0) / results.length;
  const perMission = results.filter((r) => r.missions).map((r) => r.score / r.missions);
  console.log(name.padEnd(9),
    'campaigns finished:', done.length + '/' + results.length,
    '| avg missions reached:', avgMissions.toFixed(2),
    '| avg alarm per completed mission:', perMission.length ? (perMission.reduce((a, b) => a + b, 0) / perMission.length).toFixed(1) : 'n/a',
    '| avg turns survived:', avgTurns.toFixed(1));
}

summarise('random', seeds.map((s) => play(s, 'random')));
summarise('casual', seeds.map((s) => play(s, 'casual')));
summarise('advisor', seeds.map((s) => play(s, 'advisor')));
