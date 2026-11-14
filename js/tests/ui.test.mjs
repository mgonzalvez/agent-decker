import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

class El {
  constructor(tag) {
    this.tag = tag;
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.src = '';
    this.alt = '';
    this.type = '';
    this.hidden = false;
    this.style = {};
    this.listeners = {};
    this._classes = new Set();
    this.classList = {
      toggle: (name, on) => { if (on === undefined || on) this._classes.add(name); else this._classes.delete(name); },
      add: (name) => this._classes.add(name),
      contains: (name) => this._classes.has(name)
    };
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  set innerHTML(value) {
    if (value === '') this.children = [];
  }
  get innerHTML() {
    return '';
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  click() {
    if (this.listeners.click) this.listeners.click();
  }
  querySelector(selector) {
    const wanted = selector.replace('.', '');
    return this.children.find((c) => c.className === wanted || c.tag === selector) || null;
  }
}

function textOf(node) {
  return (node.textContent || '') + ' ' + (node.children || []).map(textOf).join(' ');
}

const ids = [
  'mission-banner', 'alarm', 'alarm-label', 'alarm-value', 'alarm-fill', 'alarm-danger', 'seed', 'new-game', 'how-to-play',
  'goal-card', 'obstacle-deck', 'obstacle-deck-count', 'obstacle-discard-count',
  'player-deck-count', 'player-discard-count', 'player-hand-count', 'player-deck-breakdown', 'line', 'hand',
  'play-area', 'play-area-cards', 'equip-area', 'equip-area-cards', 'log',
  'res-stealth', 'res-fighting', 'interactions-left', 'turn-number',
  'mission-check', 'end-turn', 'overlay', 'modal', 'modal-title', 'modal-body',
  'modal-choices', 'modal-close', 'save-status', 'about', 'sound-toggle', 'music-toggle', 'replay-seed', 'training-run', 'coach', 'coach-title', 'coach-text', 'coach-how', 'coach-exit'
];
const map = {};
ids.forEach((id) => { map[id] = new El('div'); });
map['mission-banner'].appendChild(new El('span')).className = 'mission-name';
map['mission-banner'].appendChild(new El('span')).className = 'mission-goal';
map['goal-card'].appendChild(new El('img'));
map['goal-card'].appendChild(new El('figcaption'));

globalThis.document = {
  createElement: (tag) => new El(tag),
  getElementById: (id) => map[id],
  querySelector: (selector) => {
    const parts = selector.split(' ');
    let node = map[parts[0].replace('#', '')];
    for (let i = 1; i < parts.length && node; i++) node = node.querySelector(parts[i]);
    return node || null;
  },
  addEventListener: (type, fn) => { documentListeners[type] = fn; }
};

const documentListeners = {};
function fire(type, event) {
  if (documentListeners[type]) documentListeners[type](event);
}

const require = createRequire(import.meta.url);
globalThis.__storage = {
  items: {},
  getItem(key) { return this.items[key] === undefined ? null : this.items[key]; },
  setItem(key, value) { this.items[key] = String(value); },
  removeItem(key) { delete this.items[key]; }
};
globalThis.Save = require('../save.js');
globalThis.Sound = { play: function () {}, toggle: function () { return true; }, toggleMusic: function () { return true; }, setTension: function () {}, isMuted: function () { return false; } };
globalThis.AgentDecker = require('../state.js');
globalThis.Engine = require('../engine.js');
globalThis.Actions = require('../actions.js');
globalThis.Tutorial = require('../tutorial.js');
const UI = require('../ui.js');

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;

test('the alarm gauge tracks the counter and escalates green → amber → red', () => {
  UI.init(cardDefs, missions, 42);
  const state = UI.getState();
  state.alarm = 25;
  UI.setState(state);
  assert.ok(String(map['alarm-fill'].style.width).includes('50%'));
  assert.ok(map['alarm']._classes.has('level-mid'));
  state.alarm = 44;
  UI.setState(state);
  assert.ok(map['alarm']._classes.has('level-high'));
  assert.ok(!map['alarm-danger'].hidden);
  state.alarm = 48;
  UI.setState(state);
  assert.ok(map['alarm']._classes.has('level-critical'));
  state.alarm = 0;
  UI.setState(state);
  assert.ok(String(map['alarm-fill'].style.width).includes('0%'));
  assert.ok(map['alarm']._classes.has('level-low'));
  assert.ok(map['alarm-danger'].hidden);
});

test('the board renders from the starting state', () => {
  UI.init(cardDefs, missions, 42);
  assert.strictEqual(map.line.children.length, 6);
  assert.strictEqual(map.hand.children.length, 4);
  assert.strictEqual(String(map['obstacle-deck-count'].textContent), '16');
  assert.strictEqual(String(map['player-deck-count'].textContent), '4');
  assert.strictEqual(String(map['alarm-value'].textContent), '0');
  assert.strictEqual(map['mission-banner'].querySelector('.mission-name').textContent, 'Mission One (A)');
  assert.ok(map['goal-card'].querySelector('img').src.endsWith('032.jpg'));
  assert.strictEqual(String(map['interactions-left'].textContent), '1');
});

test('the draw deck panel shows how many cards are left and what is in it', () => {
  assert.strictEqual(String(map['player-deck-count'].textContent), '4');
  assert.strictEqual(String(map['player-hand-count'].textContent), '4');
  assert.ok(map['player-deck-breakdown'].textContent.includes('Punch') || map['player-deck-breakdown'].textContent.includes('Hide'));
});

test('playing a hand card adds resources and moves it to the Play Area', () => {
  const first = map.hand.children[0];
  const button = first.children.find((c) => c.className === 'play-btn');
  assert.ok(button, 'every hand card has a Play button');
  button.click();
  assert.ok(Number(map['res-stealth'].textContent) + Number(map['res-fighting'].textContent) > 0);
  assert.ok(map['play-area-cards'].children.length > 0);
});

test('clicking a line card zooms it and shows its printed text', () => {
  map.line.children[0].click();
  assert.strictEqual(map.overlay.hidden, false);
  assert.ok(map['modal-title'].textContent.length > 0);
  assert.ok(map['modal-body'].children.some((c) => c.tag === 'img'), 'the zoom modal shows the card art');
  map['modal-close'].click();
  assert.strictEqual(map.overlay.hidden, true);
});

test('every card definition carries its printed text', () => {
  assert.ok(cardDefs.every((c) => typeof c.topText === 'string'));
  assert.ok(cardDefs.every((c) => typeof c.bottomText === 'string'));
});

test('hand cards and area thumbnails are buttons, so they work with the keyboard', () => {
  const fig = map.hand.children[0];
  const face = fig.children.find((c) => c.className === 'card-face');
  assert.ok(face && face.tag === 'button', 'the card face is a real button');
  assert.ok(face['aria-label'], 'the zoom button is labelled for screen readers');
  assert.ok(map.line.children[0]['aria-label'], 'line slots describe their cost and alarm');
});

test('the game is saved to local storage after every action', () => {
  const saved = Save.loadGame();
  assert.ok(saved && saved.state, 'a save exists');
  assert.strictEqual(saved.state.turn, 1);
  assert.ok(saved.savedAt);
});

test('a card with a choice-driven effect asks before it is played', () => {
  const s = UI.getState();
  s.hand.push({ uid: 'watchtower_ui_0', defId: 'obs_watchtower' });
  UI.setState(s);
  const fig = map.hand.children[map.hand.children.length - 1];
  const button = fig.children.find((c) => c.className === 'play-btn');
  button.click();
  assert.strictEqual(map.overlay.hidden, false);
  const body = map['modal-body'].children.filter((c) => c.tag === 'p').map((c) => c.textContent).join(' ');
  assert.ok(body.includes('top'), 'the prompt explains what the card does');
  const choices = map['modal-choices'].children;
  assert.strictEqual(choices.length, Math.min(5, s.deck.length) + 1, 'the top of the deck plus a confirm button');
  choices.slice(0, choices.length - 1).forEach((c) => c.click());
  const finalChoices = map['modal-choices'].children;
  assert.ok(finalChoices[finalChoices.length - 1].textContent.includes('Put them back'), 'the order is confirmed once all of them are picked');
  map['modal-close'].click();
});

test('the About screen carries the credit and the score log', () => {
  map['about'].click();
  const body = textOf(map['modal-body']);
  assert.ok(body.includes('Manuel Correia'), 'the credit is present');
  assert.ok(body.includes('CC BY-NC'), 'the license is present');
  map['modal-close'].click();
});

test('the sound toggle flips its label', () => {
  map['sound-toggle'].click();
  assert.strictEqual(map['sound-toggle'].textContent, 'Sound: on');
});

test('Escape closes the card zoom', () => {
  map.line.children[0].click();
  assert.strictEqual(map.overlay.hidden, false);
  fire('keydown', { key: 'Escape' });
  assert.strictEqual(map.overlay.hidden, true);
});

test('replaying the seed restarts the same game from turn 1', () => {
  const seed = UI.getState().seed;
  map['replay-seed'].click();
  assert.strictEqual(UI.getState().seed, seed);
  assert.strictEqual(UI.getState().turn, 1);
});

test('clicking End Turn advances the turn without breaking the board', () => {
  map['end-turn'].click();
  assert.strictEqual(String(map['turn-number'].textContent), '2');
  assert.strictEqual(map.line.children.length, 6);
  assert.ok(Number(map['obstacle-discard-count'].textContent) >= 1);
  assert.ok(map.log.children.length > 0);
});

test('the campaign score screen lists the alarm at the end of each mission', () => {
  const s = UI.getState();
  s.missionAlarms = [4, 9, 12, 7, 0];
  s.gameOver = 'campaignComplete';
  UI.setState(s);
  assert.strictEqual(map.overlay.hidden, false);
  const score = map['modal-body'].children.find((c) => c.className === 'score');
  assert.ok(score, 'the score block is rendered');
  const rows = score.children.filter((c) => c.className === 'score-row');
  assert.strictEqual(rows.length, 5);
  assert.ok(rows[0].children.some((c) => c.className === 'score-alarm' && c.textContent === '4'));
  assert.ok(score.children.some((c) => c.className === 'score-total'));
  map['modal-close'].click();
});

test('the training run shows a coach and gates what you can do', () => {
  UI.startTraining();
  assert.ok(UI.getState().tutorial);
  assert.strictEqual(map['coach'].hidden, false);
  assert.ok(map['end-turn'].disabled);
  assert.ok(map['mission-check'].disabled);
  UI.exitTraining();
  assert.ok(!UI.getState().tutorial);
  assert.strictEqual(map['coach'].hidden, true);
  assert.ok(!map['end-turn'].disabled);
});

test('the End Turn button glows when there are no moves left', () => {
  UI.init(cardDefs, missions, 42);
  let state = UI.getState();
  state.hand = [];
  state.interactionsLeft = 0;
  state.resources = { stealth: 0, fighting: 0 };
  UI.setState(state);
  assert.ok(map['end-turn']._classes.has('glow'));

  state = UI.getState();
  state.hand = state.hand.length ? state.hand : [];
  state.interactionsLeft = 1;
  UI.setState(state);
  assert.ok(!map['end-turn']._classes.has('glow'));
});

test('cards you can afford light up in the line', () => {
  UI.init(cardDefs, missions, 42);
  let state = UI.getState();
  state.resources = { stealth: 5, fighting: 5 };
  UI.setState(state);
  const line = map['line'].children;
  const lit = line.filter((slot) => slot.className.includes('can-interact'));
  assert.ok(lit.length > 0, 'at least one obstacle should be payable');

  state = UI.getState();
  state.resources = { stealth: 0, fighting: 0 };
  UI.setState(state);
  assert.ok(map['line'].children.every((slot) => !slot.className.includes('can-interact')));
});
