'use strict';

/* localStorage persistence: resume-in-progress games and a score log.
   The storage object is injectable so the logic is testable without a browser. */
const Save = (function () {
  const GAME_KEY = 'agent-decker:game';
  const SCORE_KEY = 'agent-decker:scores';

  function store() {
    if (typeof globalThis !== 'undefined' && globalThis.__storage) return globalThis.__storage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
  }

  function read(key) {
    const s = store();
    if (!s) return null;
    try {
      const raw = s.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function write(key, value) {
    const s = store();
    if (!s) return false;
    try {
      s.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function saveGame(state) {
    if (!state || state.gameOver) return false;
    return write(GAME_KEY, { savedAt: new Date().toISOString(), state: state });
  }

  function loadGame() {
    const record = read(GAME_KEY);
    return record && record.state ? record : null;
  }

  function clearGame() {
    const s = store();
    if (s) {
      try { s.removeItem(GAME_KEY); } catch (err) { /* ignore */ }
    }
  }

  function recordScore(state) {
    if (state.gameOver !== 'campaignComplete') return false;
    const list = scores();
    list.push({
      total: state.missionAlarms.reduce(function (a, b) { return a + b; }, 0),
      missions: state.missionAlarms.slice(),
      seed: state.seed,
      turns: state.turn,
      at: new Date().toISOString()
    });
    list.sort(function (a, b) { return a.total - b.total; });
    return write(SCORE_KEY, list.slice(0, 20));
  }

  function scores() {
    const list = read(SCORE_KEY);
    return Array.isArray(list) ? list : [];
  }

  return { saveGame: saveGame, loadGame: loadGame, clearGame: clearGame, recordScore: recordScore, scores: scores };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Save;
