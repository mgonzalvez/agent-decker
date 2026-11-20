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
      remove: (name) => this._classes.delete(name),
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
    const direct = this.children.find((c) => c.className === wanted || c.tag === selector);
    if (direct) return direct;
    for (const child of this.children) {
      const deeper = child.querySelector && child.querySelector(selector);
      if (deeper) return deeper;
    }
    return null;
  }
}

function textOf(node) {
  return (node.textContent || '') + ' ' + (node.children || []).map(textOf).join(' ');
}

const ids = [
  'mission-banner', 'alarm', 'alarm-label', 'alarm-value', 'alarm-mark', 'alarm-danger', 'seed', 'new-game', 'how-to-play',
  'goal-card', 'goal-card-face', 'obstacle-deck', 'obstacle-deck-count', 'obstacle-discard-count',
  'player-deck-count', 'player-discard-count', 'player-hand-count', 'player-deck-breakdown', 'line', 'hand',
  'play-area', 'play-area-cards', 'equip-area', 'equip-area-cards', 'log',
  'res-stealth', 'res-fighting', 'interactions-left', 'turn-number',
  'mission-check', 'end-turn', 'overlay', 'modal', 'modal-title', 'modal-body',
  'modal-choices', 'modal-close', 'save-status', 'about', 'sound-toggle', 'music-toggle', 'music-track', 'replay-seed', 'quick-hands', 'fast-table', 'bin', 'bin-count', 'bin-cards', 'bin-note', 'undo', 'training-run', 'coach', 'coach-title', 'coach-text', 'coach-how', 'coach-exit',
  'radio', 'radio-screen', 'radio-readout', 'radio-link', 'call-homebase', 'radio-plain', 'radio-plan', 'radio-why', 'radio-signal', 'colonel', 'radio-frequency'
];
const map = {};
ids.forEach((id) => { map[id] = new El('div'); });
map['mission-banner'].appendChild(new El('span')).className = 'mission-letter';
map['mission-banner'].appendChild(new El('span')).className = 'mission-name';
map['mission-banner'].appendChild(new El('span')).className = 'mission-goal';
map['goal-card-face'] = new El('button');
map['goal-card-face'].className = 'goal-face';
map['goal-card'].appendChild(map['goal-card-face']).appendChild(new El('img'));
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
globalThis.localStorage = globalThis.__storage;
globalThis.Save = require('../save.js');
const playedSounds = [];
let chosenTrack = 'nightline';
globalThis.Sound = {
  play: function (name) { playedSounds.push(name); },
  toggle: function () { return true; },
  toggleMusic: function () { return true; },
  setTension: function () {},
  isMuted: function () { return false; },
  tracks: function () { return [{ id: 'nightline' }, { id: 'waltz' }]; },
  setTrack: function (id) { chosenTrack = id; return id; },
  currentTrack: function () { return chosenTrack; }
};
globalThis.AgentDecker = require('../state.js');
globalThis.Engine = require('../engine.js');
globalThis.Actions = require('../actions.js');
globalThis.Advisor = require('../advisor.js');
globalThis.Radio = require('../radio.js');
globalThis.Tutorial = require('../tutorial.js');
globalThis.Table = require('../table.js');
const UI = require('../ui.js');

function lineCards(state) { return (state.line || []).filter(Boolean); }

const cardDefs = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url))).cards;
const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url))).missions;
const registry = globalThis.AgentDecker.buildRegistry(cardDefs);

export { El, map, textOf, fire, UI, cardDefs, missions, registry, lineCards, playedSounds };
