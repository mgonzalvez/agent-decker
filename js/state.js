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

    const state = {
      seed: seed,
      rngState: (seed >>> 0) || 1,
      missionIndex: 0,
      alarm: 0,
      missionAlarms: [],
      resources: { stealth: 0, fighting: 0 },
      line: [],
      obstacleDeck: obstacleCards,
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
      rules: { interactionLimit: 1, handSize: 4, quickHands: false },
      phase: 'useCards',
      gameOver: null,
      turn: 1,
      log: [],
      events: []
    };

    /* Rules C3: the line is built one card at a time, starting from the right,
       reading each card as it lands (Guard Dog, Radio Tower, etc. move things). */
    if (typeof globalThis.Engine !== 'undefined' && globalThis.Engine.dealLine) {
      globalThis.Engine.dealLine(state, registry, 6);
    } else {
      state.line = obstacleCards.slice(0, 6).reverse();
      state.obstacleDeck = obstacleCards.slice(6);
    }
    return state;
  }

  /* The five printed obstacle icons. Any effect that names a type must name one
     of these; an item without a declared type is a data bug, not a wildcard. */
  const OBSTACLE_TYPES = ['person', 'animal', 'door', 'location', 'equipment'];

  function validateTypes(registry) {
    const problems = [];
    Object.keys(registry).forEach(function (id) {
      const d = registry[id];
      if (d.obstacleType && OBSTACLE_TYPES.indexOf(d.obstacleType) < 0) {
        problems.push(d.name + ' has an unknown obstacle type: ' + d.obstacleType);
      }
      const effects = [d.effect, d.reward && d.reward.effect].filter(Boolean);
      effects.forEach(function (e) {
        if (e.targetType && OBSTACLE_TYPES.indexOf(e.targetType) < 0) {
          problems.push(d.name + ' targets an unknown type: ' + e.targetType);
        }
        if (e.type === 'discardToInteract' && !e.targetType) {
          problems.push(d.name + ' is an interaction item with no printed type');
        }
        if ((e.type === 'slideRightToType' || e.type === 'slideTypeToSelf' || e.type === 'interactOnlyIfOnlyTypeInLine') && !e.targetType) {
          problems.push(d.name + ' has a type-based effect with no targetType');
        }
      });
    });
    return problems;
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

  return { makeRng, shuffle, buildRegistry, createInitialState, checkInvariants, validateTypes, OBSTACLE_TYPES };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AgentDecker;
