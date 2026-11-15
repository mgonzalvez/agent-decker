'use strict';

/* ---------- table physics ----------
   The engine decides what happened; this layer decides how it looks and sounds.
   Every mutation the engine makes is recorded in state.events, so the table can
   replay a turn as physical card movement without knowing anything about rules. */
const Table = (function () {
  const DUR = {
    deal: 240, move: 320, scroll: 260, knockOut: 200, disarm: 260,
    play: 220, draw: 180, exit: 340, flipUp: 220
  };
  const SOUND = {
    dealLine: 'deal', moveCard: 'slide', scroll: 'scroll', exitLine: 'exit',
    knockOut: 'knockOut', knockOutAdjacent: 'knockOut', disarm: 'disarm',
    play: 'play', draw: 'draw', flipUp: 'flip'
  };
  const STEP = 130;

  let fast = false;

  function setFast(value) { fast = !!value; }
  function isFast() { return fast; }

  function reduced() {
    return typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function supports() {
    return typeof document !== 'undefined' &&
      typeof document.querySelectorAll === 'function' &&
      typeof requestAnimationFrame === 'function';
  }

  /* Where every card on the board currently sits, keyed by uid. */
  function snapshot(root) {
    const map = {};
    if (!root || !root.querySelectorAll) return map;
    const nodes = root.querySelectorAll('[data-uid]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const uid = typeof el.getAttribute === 'function' ? el.getAttribute('data-uid') : null;
      if (!uid || typeof el.getBoundingClientRect !== 'function') continue;
      const r = el.getBoundingClientRect();
      map[uid] = { x: r.left, y: r.top, el: el };
    }
    return map;
  }

  /* Pure: turn an event stream into timed animation steps. Testable without a DOM. */
  function plan(state, before, after) {
    const steps = [];

    function delta(uid) {
      const from = before[uid];
      const to = after[uid];
      if (!from || !to) return null;
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return null;
      return { uid: uid, dx: dx, dy: dy, el: to.el };
    }

    function ghost(uid) {
      const from = before[uid];
      if (!from || !from.el) return null;
      return { uid: uid, ghost: true, from: from };
    }

    const ghosted = {};

    ((state && state.events) || []).forEach(function (event) {
      const moves = [];

      if (event.type === 'scroll') {
        (event.shift || []).forEach(function (uid) {
          const m = delta(uid);
          if (m) moves.push(m);
        });
        const g = ghost(event.exiting);
        if (g) { ghosted[event.exiting] = true; moves.push(g); }
      } else if (event.type === 'exitLine') {
        if (ghosted[event.card]) return;
        const g = ghost(event.card);
        if (g) { ghosted[event.card] = true; moves.push(g); }
      } else {
        const m = delta(event.card);
        if (m) moves.push(m);
        else if (after[event.card] && (event.type === 'dealLine' || event.type === 'draw' || event.type === 'play')) {
          moves.push({ uid: event.card, enter: true, el: after[event.card].el });
        }
      }

      if (moves.length) steps.push({ kind: event.type, sound: SOUND[event.type], moves: moves });
    });

    return steps;
  }

  function flip(move, duration, delay) {
    const el = move.el;
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = 'translate(' + move.dx + 'px, ' + move.dy + 'px)';
    setTimeout(function () {
      requestAnimationFrame(function () {
        el.style.transition = 'transform ' + duration + 'ms ease-out';
        el.style.transform = 'translate(0, 0)';
      });
    }, delay);
  }

  function enter(move, duration, delay) {
    const el = move.el;
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateX(-34px) scale(.92)';
    setTimeout(function () {
      requestAnimationFrame(function () {
        el.style.transition = 'transform ' + duration + 'ms ease-out, opacity ' + duration + 'ms ease-out';
        el.style.opacity = '1';
        el.style.transform = 'translate(0, 0)';
      });
    }, delay);
  }

  function leave(move, duration, delay) {
    const original = move.from.el;
    const clone = original.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.left = move.from.x + 'px';
    clone.style.top = move.from.y + 'px';
    clone.style.width = (original.offsetWidth || 140) + 'px';
    clone.style.zIndex = '40';
    clone.style.opacity = '1';
    clone.style.transition = 'none';
    document.body.appendChild(clone);
    setTimeout(function () {
      requestAnimationFrame(function () {
        clone.style.transition = 'transform ' + duration + 'ms ease-in, opacity ' + duration + 'ms ease-in';
        clone.style.transform = 'translateX(120px) rotate(7deg)';
        clone.style.opacity = '0';
        setTimeout(function () {
          if (clone.parentNode) clone.parentNode.removeChild(clone);
        }, duration + 120);
      });
    }, delay);
  }

  function run(steps, options) {
    options = options || {};
    if (!supports() || fast || reduced()) return 0;
    steps.forEach(function (step, index) {
      const base = index * STEP;
      step.moves.forEach(function (move, i) {
        const delay = base + i * 40;
        const duration = DUR[step.kind] || 240;
        if (move.ghost) leave(move, DUR.exit, delay);
        else if (move.enter) enter(move, duration, delay);
        else flip(move, duration, delay);
      });
      if (step.sound && options.sound) setTimeout(function () { options.sound(step.sound); }, base);
    });
    return steps.length;
  }

  return {
    plan: plan,
    run: run,
    snapshot: snapshot,
    setFast: setFast,
    isFast: isFast,
    reduced: reduced,
    supports: supports
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Table;
