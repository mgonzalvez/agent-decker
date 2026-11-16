'use strict';

/* Player intent → engine calls. No rules here, only dispatch and UI-facing helpers. */
const Actions = (function () {
  function needsChoice(def) {
    const e = def.reward && def.reward.effect;
    if (!e) return null;
    if (e.alternative) return { kind: 'choice', label: (def.reward.name || def.name) + ' — choose one of the two printed options' };
    if (e.type === 'stealthPerCardToPlayArea') return { kind: 'hand', label: 'Choose cards to place in the Play Area (2 Stealth each)' };
    if (e.type === 'saveHandCardForNextTurn') return { kind: 'hand', label: 'Choose a card to save for the next turn', single: true };
    if (e.type === 'discardToHand') return { kind: 'discard', label: 'Choose a card from your discard pile to put in your hand', single: true };
    if (e.type === 'searchDeckToTop') return { kind: 'deck', label: 'Choose a card from your deck to put on top of it', single: true };
    if (e.type === 'reorderTopOfDeck') return { kind: 'order', n: e.n, label: 'Look at the top ' + e.n + ' cards of your deck and put them back in any order (first = next drawn)' };
    if (e.type === 'scoutDeck') return { kind: 'keep', n: e.n, label: 'Look at the top ' + e.n + ' cards of your deck: keep one, put the rest back in any order' };
    if (e.type === 'moveObstacleToStartOfLine') return { kind: 'line', label: 'Choose an obstacle in the line to pull back to the start of it', single: true };
    return null;
  }

  function play(state, uid, registry, options) {
    return Engine.playCard(state, uid, registry, options || {});
  }

  function interact(state, uid, choice, registry, options) {
    return Engine.interact(state, uid, choice, registry, options || {});
  }

  function endTurn(state, registry) {
    return Engine.endTurn(state, registry);
  }

  function missionCheck(state, registry, missions) {
    return Engine.goalSatisfied(state, registry, missions);
  }

  function completeMission(state, registry, missions) {
    return Engine.completeMission(state, registry, missions);
  }

  function neighbours(state, registry, uid) {
    const i = state.line.findIndex(function (c) { return c && c.uid === uid; });
    return [state.line[i - 1], state.line[i + 1]].filter(Boolean);
  }

  function topOfDeck(state, n) {
    return state.deck.slice(-(n || 5)).reverse();
  }

  return { needsChoice, play, interact, endTurn, missionCheck, completeMission, neighbours, topOfDeck };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Actions;
