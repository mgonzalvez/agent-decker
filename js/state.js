'use strict';

/* Pure game state. No DOM, no Math.random — RNG is injected. */
const AgentDecker = (function () {
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function buildRegistry(cardDefs) {
    const byId = {};
    cardDefs.forEach(function (def) {
      byId[def.id] = def;
    });
    return byId;
  }

  function expand(setName, registry, excludeGoals) {
    const out = [];
    Object.keys(registry).forEach(function (id) {
      const def = registry[id];
      if (def.set !== setName) return;
      if (excludeGoals && def.isGoal) return;
      for (let i = 0; i < def.copies; i++) {
        out.push({ uid: id + '_' + i, defId: id });
      }
    });
    return out;
  }

  function missionDeck(registry) {
    const defs = Object.keys(registry)
      .map(function (id) { return registry[id]; })
      .filter(function (def) { return def.set === 'mission'; })
      .sort(function (a, b) { return a.missionLetter < b.missionLetter ? -1 : 1; });
    const out = [];
    defs.forEach(function (def) {
      for (let i = 0; i < def.copies; i++) out.push({ uid: def.id + '_' + i, defId: def.id });
    });
    return out;
  }

  function createInitialState(cardDefs, missions, seed) {
    const registry = buildRegistry(cardDefs);
    const rng = makeRng(seed);

    const playerCards = shuffle(expand('starting', registry), rng);
    const obstacleCards = shuffle(expand('obstacle', registry), rng);

    return {
      seed: seed,
      rngState: (seed >>> 0) || 1,
      missionIndex: 0,
      alarm: 0,
      missionAlarms: [],
      resources: { stealth: 0, fighting: 0 },
      line: obstacleCards.slice(0, 6),
      obstacleDeck: obstacleCards.slice(6),
      obstacleDiscard: [],
      hand: playerCards.slice(0, 4),
      deck: playerCards.slice(4),
      discard: [],
      playArea: [],
      equip: [],
      saved: [],
      removed: [],
      missionDeck: missionDeck(registry),
      faceDown: {},
      interactionsLeft: 1,
      rules: { interactionLimit: 1, handSize: 4 },
      phase: 'useCards',
      gameOver: null,
      turn: 1,
      log: []
    };
  }

  function checkInvariants(state, registry) {
    const zones = [state.line, state.hand, state.deck, state.discard, state.playArea, state.equip, state.saved,
      state.obstacleDeck, state.obstacleDiscard, state.missionDeck];
    const seen = new Set();
    const problems = [];

    zones.forEach(function (zone) {
      zone.forEach(function (card) {
        if (seen.has(card.uid)) problems.push('duplicate card instance: ' + card.uid);
        seen.add(card.uid);
      });
    });
    (state.removed || []).forEach(function (uid) { seen.add(uid); });

    if (!state.gameOver && state.line.length > 6) problems.push('line cannot exceed 6 cards (found ' + state.line.length + ')');
    if (state.hand.length > 12) problems.push('hand is implausibly large (' + state.hand.length + ')');
    if (state.alarm > 50) problems.push('alarm cannot exceed 50');
    if (!state.gameOver && state.alarm >= 50) problems.push('alarm reached 50 without ending the game');

    const expected = Object.keys(registry).reduce(function (n, id) {
      return n + registry[id].copies;
    }, 0);
    const tracked = seen.size;
    if (tracked !== expected - 1) problems.push('card count mismatch: ' + tracked + ' accounted vs ' + (expected - 1) + ' expected (alarm card excluded)');

    return problems;
  }

  return { makeRng, shuffle, buildRegistry, createInitialState, checkInvariants };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AgentDecker;
