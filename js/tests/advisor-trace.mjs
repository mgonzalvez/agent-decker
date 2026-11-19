import { readFileSync } from 'node:fs';
import AgentDecker from '../state.js';
import Engine from '../engine.js';
import Advisor from '../advisor.js';

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = AgentDecker.buildRegistry(cardDefs);
const seed = Number(process.argv[2] || 12345);

let s = AgentDecker.createInitialState(cardDefs, missions, seed);
let t = 0;
while (!s.gameOver && t < 60) {
  t++;
  const advice = Advisor.advise(s, registry, missions);
  const desc = advice.best.actions.map((x) =>
    x.kind + (x.name ? ':' + x.name : '') + (x.choice ? '/' + x.choice : '') + (x.options ? JSON.stringify(x.options) : '')
  ).join(' -> ');
  for (const act of advice.best.actions) {
    const nx = Advisor.applyAction(s, act, registry, missions);
    if (nx) s = nx;
  }
  const line = s.line.map((c) => (c ? registry[c.defId].name + (s.faceDown[c.uid] ? '(KO)' : '') : '_')).join(' | ');
  console.log('t' + s.turn, 'alarm', s.alarm, 'done', (s.missionAlarms || []).length, '|', desc);
  console.log('   belt:', line);
}
console.log('reason', s.gameOver, 'missions', (s.missionAlarms || []).length, 'score', (s.missionAlarms || []).reduce((a, b) => a + b, 0));
