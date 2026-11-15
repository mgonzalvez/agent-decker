'use strict';

/* Pure rules engine: state in, state out. No DOM, no Math.random.
   Every action clones the state, so the caller keeps the previous state (undo/save). */
const Engine = (function () {
  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function def(card, registry) {
    return registry[card.defId];
  }

  function rand(state) {
    state.rngState = (state.rngState * 1664525 + 1013904223) >>> 0;
    return state.rngState / 4294967296;
  }

  function shuffleInPlace(list, state) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand(state) * (i + 1));
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }

  function findZone(state, zone, uid) {
    return state[zone].find(function (c) { return c.uid === uid; });
  }

  function removeFrom(state, zone, uid) {
    const idx = state[zone].findIndex(function (c) { return c.uid === uid; });
    return idx < 0 ? null : state[zone].splice(idx, 1)[0];
  }

  function addResource(state, res) {
    if (!res) return;
    state.resources.stealth += res.stealth || 0;
    state.resources.fighting += res.fighting || 0;
  }

  /* Every mutation the player can see is recorded as an event so the table layer
     can replay it as animation. Events are transient: each action starts fresh. */
  function event(state, type, data) {
    if (!state.events) state.events = [];
    const e = { type: type, turn: state.turn };
    if (data) Object.keys(data).forEach(function (k) { e[k] = data[k]; });
    state.events.push(e);
    return e;
  }

  function resetEvents(state) {
    state.events = [];
  }

  /* The Mission Log: every entry carries the turn it happened on and whether it
     was the agent acting or the line doing something on its own. */
  function log(state, kind, text) {
    state.log.push({ turn: state.turn, kind: kind, text: text });
  }

  function resourceText(r) {
    const parts = [];
    if (r && r.stealth) parts.push(r.stealth + ' Stealth');
    if (r && r.fighting) parts.push(r.fighting + ' Fighting');
    return parts.join(' + ');
  }

  function costText(c) {
    const parts = [];
    if (c.stealth) parts.push(c.stealth + ' Stealth');
    if (c.fighting) parts.push(c.fighting + ' Fighting');
    if (c.either) parts.push(c.either + ' in any mix');
    if (c.extra) parts.push('+' + c.extra + ' (Watchtower)');
    return parts.join(' + ') || 'nothing';
  }

  function lineIndexOf(state, uid) {
    return state.line.findIndex(function (c) { return c.uid === uid; });
  }

  /* ---------- costs & passive line effects ---------- */
  function effectiveCost(state, registry, card) {
    const c = def(card, registry).cost;
    if (!c) return { stealth: 0, fighting: 0, either: 0, extra: 0, total: 0 };
    let extra = 0;
    const idx = lineIndexOf(state, card.uid);
    if (idx >= 0) {
      [idx - 1, idx + 1].forEach(function (n) {
        const neighbour = state.line[n];
        if (!neighbour) return;
        const e = def(neighbour, registry).effect;
        if (state.faceDown[neighbour.uid]) return;
      if (e && e.type === 'adjacentCostModifier') extra += e.amount;
      });
    }
    return {
      stealth: c.stealth || 0,
      fighting: c.fighting || 0,
      either: c.either || 0,
      extra: extra,
      total: (c.stealth || 0) + (c.fighting || 0) + (c.either || 0) + extra
    };
  }

  /* An equipped item pays an interaction only when its printed icon matches the
     obstacle's type icon. A missing targetType is a data bug, never a wildcard. */
  function itemPayments(state, registry, card) {
    const targetType = def(card, registry).obstacleType;
    return state.equip.filter(function (c) {
      const reward = def(c, registry).reward;
      const e = reward && reward.effect;
      return e && e.type === 'discardToInteract' && e.targetType === targetType;
    });
  }

  /* A cost written as "3 Stealth" must be paid in Stealth. Only the "any mix"
     (either) cost can be split across the two resources. Watchtower's +2 follows
     the resource type of the card it is attached to. */
  function costBreakdown(cost) {
    let stealth = cost.stealth || 0;
    let fighting = cost.fighting || 0;
    let flexible = cost.either || 0;
    if (cost.extra) {
      if (stealth && !fighting && !flexible) stealth += cost.extra;
      else if (fighting && !stealth && !flexible) fighting += cost.extra;
      else flexible += cost.extra;
    }
    return { stealth: stealth, fighting: fighting, flexible: flexible, total: stealth + fighting + flexible };
  }

  function canAfford(state, registry, card) {
    const parts = costBreakdown(effectiveCost(state, registry, card));
    if (state.resources.stealth < parts.stealth) return false;
    if (state.resources.fighting < parts.fighting) return false;
    return (state.resources.stealth - parts.stealth) + (state.resources.fighting - parts.fighting) >= parts.flexible;
  }

  function canInteract(state, registry, card) {
    if (state.faceDown[card.uid]) return { ok: false, reason: 'already knocked out' };
    if (state.interactionsLeft <= 0) return { ok: false, reason: 'no interactions left this turn' };
    const d = def(card, registry);
    if (lineIndexOf(state, card.uid) < 0) return { ok: false, reason: 'not in the line' };

    const hawk = state.line.some(function (c) {
      if (state.faceDown[c.uid]) return false;
      const e = def(c, registry).effect;
      return e && e.type === 'blockStealthOnlyInteracts';
    });
    if (hawk && d.cost && d.cost.stealth && !d.cost.fighting && !d.cost.either) {
      return { ok: false, reason: 'Hawk blocks stealth-only obstacles' };
    }

    if (d.effect && d.effect.type === 'interactOnlyIfOnlyTypeInLine') {
      const matching = state.line.filter(function (c) {
        return !state.faceDown[c.uid] && def(c, registry).obstacleType === d.effect.targetType;
      }).length;
      if (matching > 1) {
        return { ok: false, reason: d.name + ' can only be interacted with while it is the only ' + d.effect.targetType + ' in the line (' + matching + ' are face up)' };
      }
    }

    const items = itemPayments(state, registry, card);
    if (!canAfford(state, registry, card) && !items.length) {
      const parts = costBreakdown(effectiveCost(state, registry, card));
      const missing = [];
      if (parts.stealth > state.resources.stealth) missing.push((parts.stealth - state.resources.stealth) + ' Stealth');
      if (parts.fighting > state.resources.fighting) missing.push((parts.fighting - state.resources.fighting) + ' Fighting');
      if (!missing.length && parts.flexible) missing.push(parts.flexible + ' (any mix)');
      return { ok: false, reason: 'cannot pay the cost (needs ' + missing.join(' + ') + ')' };
    }
    return { ok: true, reason: '', items: items };
  }

  /* ---------- drawing ---------- */
  function drawPlayer(state, n) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (!state.deck.length) {
        if (!state.discard.length) break;
        state.deck = shuffleInPlace(state.discard, state);
        state.discard = [];
      }
      drawn.push(state.deck.pop());
    }
    return drawn;
  }

  /* Putting an item on the table. The optional "Quick Hands" house rule makes
     every newly equipped item grant one extra interaction that turn. */
  function equipCard(state, registry, card) {
    state.equip.push(card);
    if (state.rules.quickHands) {
      state.interactionsLeft += 1;
      log(state, 'agent', 'Quick Hands — ' + def(card, registry).name + ' equipped, +1 interaction');
    }
  }

  /* Cards entering the hand: an item (KEEP) goes straight to the Equip Area
     instead of occupying a hand slot, so the hand is still filled to its size. */
  function enterHand(state, registry, card) {
    if (!card) return;
    if (def(card, registry).keep) equipCard(state, registry, card);
    else state.hand.push(card);
  }

  function drawToHand(state, registry, n) {
    let added = 0;
    while (added < n) {
      if (!state.deck.length) {
        if (!state.discard.length) break;
        state.deck = shuffleInPlace(state.discard, state);
        state.discard = [];
      }
      const card = state.deck.pop();
      event(state, 'draw', { card: card.uid, from: 'deck' });
      if (def(card, registry).keep) state.equip.push(card);
      else {
        state.hand.push(card);
        added += 1;
      }
    }
  }

  /* Equipped items: "once per turn" resources and Siren's extra draws. */
  function applyEquipPassives(state, registry) {
    const keeps = state.equip.filter(function (c) { return def(c, registry).keep; });
    keeps.forEach(function (card) {
      const d = def(card, registry);
      addResource(state, d.reward && d.reward.resource);
      const e = d.reward && d.reward.effect;
      if (e && e.type === 'drawPerEquippedKeep') {
        drawToHand(state, registry, Math.min(e.max || 3, keeps.length));
      }
    });
  }

  function drawObstacle(state) {
    if (!state.obstacleDeck.length) {
      if (!state.obstacleDiscard.length) return null;
      state.obstacleDeck = shuffleInPlace(state.obstacleDiscard, state);
      state.obstacleDiscard = [];
    }
    return state.obstacleDeck.pop();
  }

  /* ---------- obstacle effects that fire when a card appears in the line ---------- */
  function applyAppearance(state, registry, card) {
    const e = def(card, registry).effect;
    if (!e) return;
    const idx = lineIndexOf(state, card.uid);

    if (e.type === 'slideRightToType') {
      const from = idx;
      let target = -1;
      for (let i = idx + 1; i < state.line.length; i++) {
        if (state.faceDown[state.line[i].uid]) continue;
        if (def(state.line[i], registry).obstacleType === e.targetType) { target = i; break; }
      }
      if (target > idx) {
        state.line.splice(idx, 1);
        state.line.splice(target, 0, card);
        event(state, 'moveCard', { card: card.uid, from: from, to: target, reason: def(card, registry).name });
        log(state, 'line', def(card, registry).name + ' slides right beside the first ' + e.targetType + ' in the line');
      }
    } else if (e.type === 'slideTypeToSelf') {
      const from = idx;
      const moved = state.line.filter(function (c) {
        return c.uid !== card.uid && !state.faceDown[c.uid] && def(c, registry).obstacleType === e.targetType;
      });
      state.line = state.line.filter(function (c) { return moved.indexOf(c) < 0; });
      const pos = state.line.indexOf(card);
      moved.forEach(function (c, k) { state.line.splice(pos + 1 + k, 0, c); });
      event(state, 'moveCard', { card: card.uid, from: from, to: pos, reason: def(card, registry).name, pulled: moved.map(function (c) { return c.uid; }) });
      log(state, 'line', def(card, registry).name + ' pulls ' + moved.map(function (c) { return def(c, registry).name; }).join(', ') + ' next to itself');
    }
  }

  /* Cards enter the line one at a time. Setup deals from the right (rules C3):
     the first card drawn lands in the rightmost slot and the line grows leftward.
     A refill enters at the left of a five-card line. Either way the array is
     contiguous and the UI right-aligns a line that has fewer than six cards. */
  function dealLine(state, registry, count) {
    for (let i = 0; i < count; i++) {
      const card = drawObstacle(state);
      if (!card) {
        state.gameOver = 'time';
        return;
      }
      state.line.unshift(card);
      const enteredAtLeft = state.line.length > 1;
      event(state, 'dealLine', { card: card.uid, index: 0, slot: 6 - state.line.length });
      log(state, 'line', def(card, registry).name + (enteredAtLeft ? ' enters the line at the left' : ' is placed at the right end of the line'));
      applyAppearance(state, registry, card);
    }
  }

  function refillLine(state, registry) {
    dealLine(state, registry, 6 - state.line.length);
  }

  /* ---------- 1. Use Cards ---------- */
  function playCard(state, uid, registry, options) {
    options = options || {};
    const s = clone(state);
    resetEvents(s);
    const card = removeFrom(s, 'hand', uid);
    if (!card) throw new Error('card is not in hand: ' + uid);
    const d = def(card, registry);

    if (d.reward) {
      const e = d.reward.effect;
      if (e && e.alternative) {
        /* Printed as "X or Y" — the player must pick one of them. */
        if (options.choice === 'resource') {
          addResource(s, d.reward.resource);
          log(s, 'agent', d.name + ' — ' + resourceText(d.reward.resource));
        } else if (options.choice === 'draw') {
          drawToHand(s, registry, e.n);
          log(s, 'agent', d.name + ' — drew ' + e.n + ' card' + (e.n === 1 ? '' : 's') + ' instead of the resource');
        } else {
          throw new Error(d.name + ' needs a choice: ' + resourceText(d.reward.resource) + ' or draw ' + e.n + ' card' + (e.n === 1 ? '' : 's'));
        }
      } else {
        addResource(s, d.reward.resource);
      }
      if (e && !e.alternative) {
        if (e.type === 'draw') {
          drawToHand(s, registry, e.n);
        } else if (e.type === 'fightingPerDiscardPair') {
          s.resources.fighting += e.amount * Math.floor(s.discard.length / e.per);
        } else if (e.type === 'stealthPerCardToPlayArea') {
          (options.cards || []).forEach(function (u) {
            const c = removeFrom(s, 'hand', u);
            if (c) s.playArea.push(c);
          });
          s.resources.stealth += e.amount * (options.cards || []).length;
        } else if (e.type === 'removeFromGame') {
          /* The purge is interactive: playing the card opens the Bin, and the
             player then bins as many cards as they want, one click at a time. */
          s.bin = { source: e.source === 'discard' ? 'discard' : 'hand', remaining: e.max === null ? -1 : e.max };
          log(s, 'agent', d.name + ' — ' + (e.max === null
            ? 'the Bin is open: purge as many cards as you like'
            : 'the Bin is open: purge up to ' + e.max + ' cards from your ' + e.source));
        } else if (e.type === 'discardToHand') {
          const pick = options.uid ? findZone(s, 'discard', options.uid) : s.discard[s.discard.length - 1];
          if (pick) {
            removeFrom(s, 'discard', pick.uid);
            enterHand(s, registry, pick);
          }
        } else if (e.type === 'saveHandCardForNextTurn') {
          const saved = options.uid ? removeFrom(s, 'hand', options.uid) : null;
          if (saved) s.saved.push(saved);
        } else if (e.type === 'moveObstacleToStartOfLine') {
          const target = options.uid ? findZone(s, 'line', options.uid) : null;
          if (target) {
            removeFrom(s, 'line', target.uid);
            s.line.unshift(target);
          }
        } else if (e.type === 'reshuffleObstacleDiscardIntoDeck') {
          s.obstacleDeck = shuffleInPlace(s.obstacleDeck.concat(s.obstacleDiscard), s);
          s.obstacleDiscard = [];
        } else if (e.type === 'searchDeckToTop') {
          const pick = options.uid ? findZone(s, 'deck', options.uid) : s.deck[s.deck.length - 1];
          if (pick) {
            removeFrom(s, 'deck', pick.uid);
            shuffleInPlace(s.deck, s);
            s.deck.push(pick);
          }
        } else if (e.type === 'scoutDeck' || e.type === 'reorderTopOfDeck') {
          /* UI-driven: the engine exposes the top of the deck and reorders from options.order */
          if (Array.isArray(options.order)) {
            const top = s.deck.slice(-e.n);
            s.deck = s.deck.slice(0, s.deck.length - e.n).concat(options.order.map(function (u) { return findZone(s, 'deck', u); }).filter(Boolean));
          }
        } else if (e.type === 'swapDeckAndDiscard') {
          const t = s.deck;
          s.deck = s.discard;
          s.discard = t;
        }
      }
    }

    const routesToObstacles = d.reward && d.reward.effect && d.reward.effect.type === 'usedCardToObstacleDiscard';
    if (routesToObstacles) {
      s.obstacleDiscard.push(card);
      event(s, 'play', { card: card.uid, to: 'obstacleDiscard' });
    } else if (d.keep) {
      equipCard(s, registry, card);
      event(s, 'play', { card: card.uid, to: 'equip' });
    } else {
      s.playArea.push(card);
      event(s, 'play', { card: card.uid, to: 'playArea' });
    }

    log(s, 'agent', 'played ' + d.name + ' (' + (d.reward && d.reward.resource ? resourceText(d.reward.resource) : d.reward ? d.reward.name : 'no resource') + ')');
    return s;
  }

  /* ---------- 1b. Interact: Disarm / Knock Out ---------- */
  function interact(state, uid, choice, registry, options) {
    options = options || {};
    const s = clone(state);
    resetEvents(s);
    const card = findZone(s, 'line', uid);
    if (!card) throw new Error('card is not in the line: ' + uid);
    const check = canInteract(s, registry, card);
    if (!check.ok) throw new Error('cannot interact: ' + check.reason);

    const d = def(card, registry);
    const cost = effectiveCost(s, registry, card);
    const item = options.itemUid ? findZone(s, 'equip', options.itemUid) : null;
    if (options.itemUid && !item) throw new Error('item is not equipped: ' + options.itemUid);

    if (item) {
      const ieffect = def(item, registry).reward && def(item, registry).reward.effect;
      if (!ieffect || ieffect.type !== 'discardToInteract' || ieffect.targetType !== d.obstacleType) {
        throw new Error(def(item, registry).name + ' cannot be used on ' + d.name);
      }
      removeFrom(s, 'equip', item.uid);
      s.discard.push(item);
    } else {
      const parts = costBreakdown(cost);
      s.resources.stealth -= parts.stealth;
      s.resources.fighting -= parts.fighting;
      if (parts.flexible) {
        const fromStealth = Math.min(s.resources.stealth, parts.flexible);
        s.resources.stealth -= fromStealth;
        s.resources.fighting -= parts.flexible - fromStealth;
      }
    }
    s.interactionsLeft -= 1;

    if (choice === 'knockOutAdjacent') {
      if (!d.effect || d.effect.type !== 'knockOutAdjacentInsteadOfInteract') {
        throw new Error(d.name + ' does not let you knock out an adjacent card');
      }
      event(s, 'knockOutAdjacent', { card: options.uid, by: card.uid });
      const target = findZone(s, 'line', options.uid);
      if (!target) throw new Error('target is not in the line');
      if (Math.abs(lineIndexOf(s, card.uid) - lineIndexOf(s, target.uid)) !== 1) {
        throw new Error(def(target, registry).name + ' is not adjacent to ' + d.name);
      }
      s.faceDown[target.uid] = true;
      log(s, 'agent', 'knocked out ' + def(target, registry).name + ' instead of ' + d.name);
      return s;
    }

    if (choice === 'knockOut') {
      const slot = lineIndexOf(s, card.uid);
      s.faceDown[card.uid] = true;
      event(s, 'knockOut', { card: card.uid, slot: slot });
    } else if (choice === 'disarm') {
      const slot = lineIndexOf(s, card.uid);
      removeFrom(s, 'line', card.uid);
      if (d.keep) {
        equipCard(s, registry, card);
        event(s, 'disarm', { card: card.uid, from: slot, to: 'equip' });
      } else {
        s.playArea.push(card);
        event(s, 'disarm', { card: card.uid, from: slot, to: 'playArea' });
      }
    } else {
      throw new Error('unknown interaction: ' + choice);
    }

    if (d.effect && d.effect.type === 'knockOutAdjacentOnInteract') {
      const i = lineIndexOf(s, card.uid);
      [i - 1, i + 1].forEach(function (n) {
        if (s.line[n]) s.faceDown[s.line[n].uid] = true;
      });
    }
    log(s, 'agent', (choice === 'knockOut' ? 'knocked out ' : 'disarmed ') + d.name + ' for ' + costText(effectiveCost(s, registry, card)));
    return s;
  }

  /* ---------- 3. Line Scroll ---------- */
  function hasFaceDownStasis(state, registry) {
    return state.line.some(function (c) {
      if (state.faceDown[c.uid]) return false;
      const e = def(c, registry).effect;
      return e && e.type === 'faceDownCardsDoNotScroll';
    });
  }

  function exitLine(state, card, registry) {
    const d = def(card, registry);
    const alarm = state.faceDown[card.uid] ? 0 : d.alarm;
    state.obstacleDiscard.push(card);
    event(state, 'exitLine', { card: card.uid, alarm: alarm, total: Math.min(50, state.alarm + alarm) });
    if (alarm) event(state, 'alarm', { amount: alarm, total: Math.min(50, state.alarm + alarm) });
    state.alarm = Math.min(50, state.alarm + alarm);
    if (state.alarm >= 50) state.gameOver = 'alarm';
    log(state, 'line', d.name + ' left the line — alarm +' + alarm);
    if (d.effect && d.effect.type === 'flushLineToDiscardOnExit') {
      state.line.forEach(function (c) { state.obstacleDiscard.push(c); });
      state.line = [];
    }
  }

  function applyScrollTriggers(state, registry) {
    state.line.forEach(function (card) {
      if (state.faceDown[card.uid]) return;
      const e = def(card, registry).effect;
      if (!e || e.type !== 'flipLastLineCardFaceUp') return;
      const last = state.line[state.line.length - 1];
      if (last && state.faceDown[last.uid]) {
        state.faceDown[last.uid] = false;
        event(state, 'flipUp', { card: last.uid, reason: def(card, registry).name });
        log(state, 'line', def(last, registry).name + ' was flipped face up by ' + def(card, registry).name);
        applyAppearance(state, registry, last);
      }
    });
  }

  function lineScroll(state, registry) {
    const s = clone(state);
    resetEvents(s);
    if (!s.line.length) return s;
    applyScrollTriggers(s, registry);

    const stasis = hasFaceDownStasis(s, registry);
    let exitingIndex = s.line.length - 1;
    if (stasis) {
      exitingIndex = -1;
      for (let i = s.line.length - 1; i >= 0; i--) {
        if (!s.faceDown[s.line[i].uid]) { exitingIndex = i; break; }
      }
    }
    if (exitingIndex < 0) {
      log(s, 'line', 'the line is locked — every card is knocked out and nothing scrolls');
      return s;
    }

    const exiting = s.line.splice(exitingIndex, 1)[0];
    event(s, 'scroll', { shift: s.line.map(function (c) { return c.uid; }), exiting: exiting.uid });
    log(s, 'line', 'the line scrolls one step right; ' + def(exiting, registry).name + ' exits');
    exitLine(s, exiting, registry);
    if (s.gameOver) return s;
    if (!s.line.length) {
      if (s.alarm >= 50) s.gameOver = 'alarm';
      return s;
    }

    for (let i = s.line.length - 1; i >= 0; i--) {
      const card = s.line[i];
      if (s.faceDown[card.uid] && hasFaceDownStasis(s, registry)) continue;
      const e = def(card, registry).effect;
      if (!e || e.type !== 'extraScroll') continue;
      let pos = i;
      for (let step = 0; step < e.n; step++) {
        const next = pos + 1;
        if (next < s.line.length) {
          const t = s.line[pos];
          s.line[pos] = s.line[next];
          s.line[next] = t;
          pos = next;
          event(s, 'moveCard', { card: card.uid, from: next - 1, to: next, reason: def(card, registry).name });
          log(s, 'line', def(card, registry).name + ' moves an extra space right');
        } else {
          const slid = s.line.splice(pos, 1)[0];
          log(s, 'line', def(slid, registry).name + ' scrolls off the end of the line');
          exitLine(s, slid, registry);
          break;
        }
      }
    }
    if (s.alarm >= 50) s.gameOver = 'alarm';
    return s;
  }

  /* ---------- 4. Card Refresh ---------- */
  function refresh(state, registry) {
    const s = clone(state);
    if (!s.events) s.events = [];
    refillLine(s, registry);
    if (s.gameOver) return s;

    s.hand.forEach(function (card) {
      if (def(card, registry).keep) equipCard(s, registry, card);
      else { s.discard.push(card); event(s, 'discard', { card: card.uid, from: 'hand' }); }
    });
    const persistent = [];
    s.playArea.forEach(function (card) {
      if (def(card, registry).keep) { equipCard(s, registry, card); return; }
      s.discard.push(card);
      event(s, 'discard', { card: card.uid, from: 'playArea' });
    });
    s.playArea = persistent;
    s.hand = [];
    drawToHand(s, registry, s.rules.handSize);
    s.saved.forEach(function (card) { enterHand(s, registry, card); });
    s.saved = [];

    s.interactionsLeft = s.rules.interactionLimit;
    s.resources = { stealth: 0, fighting: 0 };
    s.bin = null;
    applyEquipPassives(s, registry);
    s.phase = 'useCards';
    log(s, 'agent', 'card refresh — hand redrawn, unspent resources evaporated');
    return s;
  }

  function endTurn(state, registry) {
    const s = refresh(lineScroll(state, registry), registry);
    s.turn += 1;
    return s;
  }

  /* Bin: a card the player purges from the game for good. */
  function binCard(state, registry, uid) {
    const s = clone(state);
    resetEvents(s);
    if (!s.bin || s.bin.remaining === 0) throw new Error('the Bin is not open');
    const zone = s.bin.source === 'discard' ? 'discard' : 'hand';
    const card = findZone(s, zone, uid);
    if (!card) throw new Error('cannot bin ' + uid + ': it is not in your ' + zone);
    removeFrom(s, zone, uid);
    if (s.bin.remaining > 0) s.bin.remaining -= 1;
    s.removed.push({ uid: card.uid, defId: card.defId });
    event(s, 'bin', { card: card.uid });
    log(s, 'agent', def(card, registry).name + ' goes in the Bin — out of the game for good');
    return s;
  }

  /* ---------- 2. Mission Check ---------- */
  function goalSatisfied(state, registry, missions) {
    const mission = missions[state.missionIndex];
    const g = mission.goal;
    if (g.handSize) return state.hand.length >= g.handSize;
    if (g.knockOutWholeLine) return state.line.length === 6 && state.line.every(function (c) { return state.faceDown[c.uid]; });
    const itemsOk = (g.itemsRequired || []).every(function (id) {
      return state.equip.some(function (c) { return c.defId === id; });
    });
    if (!itemsOk) return false;
    const need = (g.resources ? (g.resources.stealth || 0) + (g.resources.fighting || 0) : 0) + (g.either || 0);
    if (need === 0) return true;
    if (g.resources && g.resources.stealth && state.resources.stealth < g.resources.stealth) return false;
    return state.resources.stealth + state.resources.fighting >= need;
  }

  function completeMission(state, registry, missions) {
    const s = clone(state);
    resetEvents(s);
    const mission = missions[s.missionIndex];
    s.missionAlarms.push(s.alarm);
    log(s, 'mission', missions[s.missionIndex].name + ' complete — alarm ' + s.alarm + ' goes on the score');

    const goalCard = findZone(s, 'missionDeck', mission.goalCardId + '_0');
    if (goalCard) {
      removeFrom(s, 'missionDeck', goalCard.uid);
      const d = def(goalCard, registry);
      const e = d.reward && d.reward.effect;
      if (e && e.type === 'interactionLimit') s.rules.interactionLimit = e.value;
      if (e && e.type === 'handDrawSize') s.rules.handSize = e.value;
      s.equip.push(goalCard);
    }

    if (s.missionIndex >= missions.length - 1) {
      s.gameOver = 'campaignComplete';
      log(s, 'mission', 'campaign complete');
      return s;
    }

    s.missionIndex += 1;
    missions[s.missionIndex].obstaclesIntroduced.forEach(function (id) {
      const card = findZone(s, 'missionDeck', id + '_0');
      if (card) {
        removeFrom(s, 'missionDeck', card.uid);
        s.obstacleDiscard.push(card);
      }
    });

    event(s, 'mission', { missionIndex: s.missionIndex, reward: goalCard ? goalCard.uid : null });
    s.obstacleDeck = shuffleInPlace(s.obstacleDeck.concat(s.obstacleDiscard, s.line), s);
    s.obstacleDiscard = [];
    s.line = [];
    dealLine(s, registry, 6);
    s.alarm = 0;
    s.faceDown = {};

    const kept = [];
    const folded = [];
    s.playArea.forEach(function (card) {
      (def(card, registry).keep ? kept : folded).push(card);
    });
    s.playArea = [];
    s.equip.push.apply(s.equip, kept);

    /* the unused hand and the spent non-item cards are folded back into the deck */
    s.deck = shuffleInPlace(s.deck.concat(s.discard, folded, s.hand), s);
    s.discard = [];
    s.saved = [];
    s.bin = null;
    s.hand = [];
    drawToHand(s, registry, s.rules.handSize);

    /* Completing a mission skips Line Scroll and Card Refresh (player aid) and
       the new mission "begins at step 1" — that is a fresh turn. The interaction
       allowance therefore belongs to the new turn, not the one that just ended,
       so finishing a mission never hands the agent a second interaction. */
    s.turn += 1;
    s.interactionsLeft = s.rules.interactionLimit;
    s.resources = { stealth: 0, fighting: 0 };
    applyEquipPassives(s, registry);
    log(s, 'mission', missions[s.missionIndex].name + ' begins (turn ' + s.turn + '): ' + missions[s.missionIndex].goalText);
    return s;
  }

  /* Deliberately using an equipped item: it leaves the Equip Area for its effect. */
  function useItem(state, uid, registry) {
    const s = clone(state);
    resetEvents(s);
    const card = findZone(s, 'equip', uid);
    if (!card) throw new Error('item is not equipped: ' + uid);
    const d = def(card, registry);
    const e = d.reward && d.reward.effect;
    if (!e || e.type !== 'usedCardToObstacleDiscard') throw new Error(d.name + ' has no use action');
    removeFrom(s, 'equip', card.uid);
    s.obstacleDiscard.push(card);
    log(s, 'agent', 'used ' + d.name + ' — it goes to the obstacles discard');
    return s;
  }

  return {
    clone, def, effectiveCost, costBreakdown, canAfford, canInteract, goalSatisfied,
    playCard, interact, lineScroll, refresh, endTurn, completeMission, useItem, binCard,
    dealLine, event
  };
})();

if (typeof globalThis !== 'undefined') globalThis.Engine = Engine;
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
