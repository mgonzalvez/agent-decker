'use strict';

/* Pure rules engine: state in, state out. No DOM, no Math.random.
   Every action clones the state, so the caller keeps the previous state (undo/save). */
const Engine = (function () {
  function clone(state) {
    const copy = JSON.parse(JSON.stringify(state));
    copy.line = normalizeLine(copy.line);
    return copy;
  }

  function def(card, registry) {
    return registry[card.defId];
  }

  /* Every card in the game is printed with two names: the obstacle it is on the
     belt (bottom half of the front) and the thing the agent gets from it (the top
     half). While a card sits on the belt it is the obstacle; once it is in the
     agent's deck it is the item. The designer's wording, so the log and the
     board always agree with what the player is reading. */
  function agentName(def) {
    if (!def || def.isGoal) return def ? def.name : 'card';
    return (def.reward && def.reward.name) ? def.reward.name : def.name;
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
    return state[zone].find(function (c) { return c && c.uid === uid; });
  }

  function removeFrom(state, zone, uid) {
    const idx = state[zone].findIndex(function (c) { return c && c.uid === uid; });
    if (idx < 0) return null;
    /* A card removed from the line leaves its slot empty: the conveyor keeps its
       six positions and the hole is only filled when new obstacles are drawn. */
    if (zone === 'line') {
      const card = state[zone][idx];
      state[zone][idx] = null;
      return card;
    }
    return state[zone].splice(idx, 1)[0];
  }

  /* Resources are per-turn, and we remember which card produced them so the UI
     can say where the Stealth or Fighting in front of the player actually came
     from. */
  function addResource(state, res, source) {
    if (!res) return;
    const stealth = res.stealth || 0;
    const fighting = res.fighting || 0;
    state.resources.stealth += stealth;
    state.resources.fighting += fighting;
    if (!stealth && !fighting) return;
    state.sources = state.sources || [];
    state.sources.push({
      uid: source ? source.uid : null,
      name: source ? agentName(source) : 'resources',
      stealth: stealth,
      fighting: fighting
    });
  }

  function ensureSources(state) {
    if (state.sources && state.sources.length) return state.sources;
    state.sources = [{ uid: null, name: 'resources gathered this turn', stealth: state.resources.stealth, fighting: state.resources.fighting }];
    return state.sources;
  }

  function takeFromSources(state, type, amount) {
    const sources = state.sources || [];
    for (let i = 0; i < sources.length && amount > 0; i++) {
      const take = Math.min(sources[i][type] || 0, amount);
      if (take > 0) {
        sources[i][type] -= take;
        amount -= take;
      }
    }
    state.sources = sources.filter(function (src) { return src.stealth || src.fighting; });
    return amount;
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

  /* The line is six conveyor slots. Slots can be empty: a disarmed card leaves a
     hole, and the hole is only filled when new obstacles are drawn. A hand-built
     line of fewer than six cards is right-aligned, i.e. it sits at the exit end. */
  const LINE_SIZE = 6;

  function normalizeLine(line) {
    line = line || [];
    if (line.length === LINE_SIZE) return line;
    if (line.length > LINE_SIZE) return line.slice(0, LINE_SIZE);
    const gaps = [];
    for (let i = 0; i < LINE_SIZE - line.length; i++) gaps.push(null);
    return gaps.concat(line);
  }

  function lineCards(state) {
    return state.line.filter(Boolean);
  }

  function lineIndexOf(state, uid) {
    return state.line.findIndex(function (c) { return c && c.uid === uid; });
  }

  function rightmostIndex(state) {
    for (let i = state.line.length - 1; i >= 0; i--) if (state.line[i]) return i;
    return -1;
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

  function canAffordParts(state, parts) {
    if (state.resources.stealth < parts.stealth) return false;
    if (state.resources.fighting < parts.fighting) return false;
    return (state.resources.stealth - parts.stealth) + (state.resources.fighting - parts.fighting) >= parts.flexible;
  }

  function canAfford(state, registry, card) {
    return canAffordParts(state, costBreakdown(effectiveCost(state, registry, card)));
  }

  /* Every way the player could pay for this interaction: the printed cost out of
     this turn's resources, or an equipped item whose icon matches the obstacle.
     The UI offers a choice only when it is one of these. */
  function paymentOptions(state, registry, card) {
    const parts = costBreakdown(effectiveCost(state, registry, card));
    return {
      parts: parts,
      canPayResources: canAffordParts(state, parts),
      items: itemPayments(state, registry, card),
      sources: ensureSources(state).filter(function (src) { return src.stealth || src.fighting; })
    };
  }

  function canInteract(state, registry, card) {
    /* Every answer carries the cost breakdown, so the modal can always explain
       what the card would cost even when the interaction is not possible. */
    const options = paymentOptions(state, registry, card);
    const no = function (reason) { return { ok: false, reason: reason, items: [], canPayResources: false, parts: options.parts, sources: options.sources }; };
    if (state.faceDown[card.uid]) return no('already knocked out');
    if (state.interactionsLeft <= 0) return no('no interactions left this turn');
    const d = def(card, registry);
    if (lineIndexOf(state, card.uid) < 0) return no('not in the line');

    const hawk = state.line.some(function (c) {
      if (!c || state.faceDown[c.uid]) return false;
      const e = def(c, registry).effect;
      return e && e.type === 'blockStealthOnlyInteracts';
    });
    if (hawk && d.cost && d.cost.stealth && !d.cost.fighting && !d.cost.either) {
      return no('Hawk blocks stealth-only obstacles');
    }

    if (d.effect && d.effect.type === 'interactOnlyIfOnlyTypeInLine') {
      const matching = state.line.filter(function (c) {
        return c && !state.faceDown[c.uid] && def(c, registry).obstacleType === d.effect.targetType;
      }).length;
      if (matching > 1) {
        return no(d.name + ' can only be interacted with while it is the only ' + d.effect.targetType + ' in the line (' + matching + ' are face up)');
      }
    }

    if (!options.canPayResources && !options.items.length) {
      const parts = options.parts;
      const missing = [];
      if (parts.stealth > state.resources.stealth) missing.push((parts.stealth - state.resources.stealth) + ' Stealth');
      if (parts.fighting > state.resources.fighting) missing.push((parts.fighting - state.resources.fighting) + ' Fighting');
      if (!missing.length && parts.flexible) missing.push(parts.flexible + ' (any mix)');
      return { ok: false, reason: 'cannot pay the cost (needs ' + missing.join(' + ') + ')', items: [], canPayResources: false, parts: parts, sources: options.sources };
    }
    return { ok: true, reason: '', items: options.items, canPayResources: options.canPayResources, parts: options.parts, sources: options.sources };
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
    fireEquipPassive(state, registry, card);
    if (state.rules.quickHands) {
      state.interactionsLeft += 1;
      log(state, 'agent', 'Quick Hands — ' + agentName(def(card, registry)) + ' equipped, +1 interaction');
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

  /* Equipped items: resources printed "once per turn", and Siren's extra draws.
     A printed number on a card whose text is a one-shot use (Bazooka, Optic
     Camouflage) is not a per-turn passive — it is paid when the card is used. */
  /* An item that prints a per-turn resource pays it as soon as it hits the
     table, and again at every Card Refresh after that. `state.passives` keeps
     track of which items already paid in the current refresh so an item
     equipped during the refresh is not counted twice. */
  function fireEquipPassive(state, registry, card) {
    const d = def(card, registry);
    if (!d.reward || !d.reward.oncePerTurn) return;
    state.passives = state.passives || {};
    if (state.passives[card.uid]) return;
    state.passives[card.uid] = true;
    addResource(state, d.reward.resource, d);
    log(state, 'agent', agentName(d) + ' equipped — ' + resourceText(d.reward.resource));
  }

  function applyEquipPassives(state, registry) {
    const keeps = state.equip.filter(function (c) { return def(c, registry).keep; });
    keeps.forEach(function (card) {
      fireEquipPassive(state, registry, card);
      const d = def(card, registry);
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
        if (!state.line[i] || state.faceDown[state.line[i].uid]) continue;
        if (def(state.line[i], registry).obstacleType === e.targetType) { target = i; break; }
      }
      /* "Slide it all the way until it's adjacent to it": the dog stops in the
         slot immediately *before* the person, never past it. */
      if (target - 1 > idx) {
        state.line.splice(idx, 1);
        state.line.splice(target - 1, 0, card);
        event(state, 'moveCard', { card: card.uid, from: from, to: target - 1, reason: def(card, registry).name });
        log(state, 'line', def(card, registry).name + ' slides right until it is next to the first ' + e.targetType + ' on its right');
      }
    } else if (e.type === 'slideTypeToSelf') {
      /* "Slide all <type> all the way next to it": every target card moves
         toward the tower and stops as close as it can get, without ever
         crossing it. Targets on the left pack up immediately to its left,
         targets on the right immediately to its right. */
      const from = idx;
      const isTarget = function (c) {
        return c && c.uid !== card.uid && !state.faceDown[c.uid] && def(c, registry).obstacleType === e.targetType;
      };
      const left = state.line.slice(0, idx);
      const right = state.line.slice(idx + 1);
      const leftTargets = left.filter(isTarget);
      const rightTargets = right.filter(isTarget);
      const leftRest = left.filter(function (c) { return !isTarget(c); });
      const rightRest = right.filter(function (c) { return !isTarget(c); });
      const before = {};
      state.line.forEach(function (c, i) { if (c) before[c.uid] = i; });
      const moved = leftTargets.concat(rightTargets);
      state.line = leftRest.concat(leftTargets, [card], rightTargets, rightRest);
      state.line.forEach(function (c, i) {
        if (c && before[c.uid] !== i) {
          event(state, 'moveCard', { card: c.uid, from: before[c.uid], to: i, reason: def(card, registry).name });
        }
      });
      log(state, 'line', def(card, registry).name + ' drags ' + moved.map(function (c) { return def(c, registry).name; }).join(', ') + ' right next to itself');
    }
  }

  /* Cards enter the line one at a time. Setup deals from the right (rules C3):
     the first card drawn lands in the rightmost slot and the line grows leftward.
     A refill enters at the left of a five-card line. Either way the array is
     contiguous and the UI right-aligns a line that has fewer than six cards. */
  function dealLine(state, registry, count) {
    state.line = normalizeLine(state.line);
    /* Rules C3: the opening line is built from the right. After that, new cards
       enter at the left end of the conveyor and the holes stay where they are.
       The slot is chosen for each card, because an appearance effect (Guard Dog,
       Radio Tower) can rearrange the line between draws. */
    const opening = !lineCards(state).length;
    for (let n = 0; n < count; n++) {
      const card = drawObstacle(state);
      if (!card) {
        state.gameOver = 'time';
        return;
      }
      let slot = -1;
      if (opening) {
        for (let i = LINE_SIZE - 1; i >= 0; i--) if (!state.line[i]) { slot = i; break; }
      } else {
        for (let i = 0; i < LINE_SIZE; i++) if (!state.line[i]) { slot = i; break; }
      }
      if (slot < 0) return;
      state.line[slot] = card;
      event(state, 'dealLine', { card: card.uid, index: slot, slot: slot });
      log(state, 'line', def(card, registry).name + (slot === LINE_SIZE - 1 && opening ? ' is placed at the right end of the line' : ' enters the line'));
      applyAppearance(state, registry, card);
    }
  }

  function refillLine(state, registry) {
    dealLine(state, registry, LINE_SIZE - lineCards(state).length);
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
          addResource(s, d.reward.resource, d);
          log(s, 'agent', agentName(d) + ' — ' + resourceText(d.reward.resource));
        } else if (options.choice === 'draw') {
          drawToHand(s, registry, e.n);
          log(s, 'agent', agentName(d) + ' — drew ' + e.n + ' card' + (e.n === 1 ? '' : 's') + ' instead of the resource');
        } else {
          throw new Error(agentName(d) + ' needs a choice: ' + resourceText(d.reward.resource) + ' or draw ' + e.n + ' card' + (e.n === 1 ? '' : 's'));
        }
      } else {
        addResource(s, d.reward.resource, d);
      }
      if (e && !e.alternative) {
        if (e.type === 'draw') {
          drawToHand(s, registry, e.n);
        } else if (e.type === 'fightingPerDiscardPair') {
          addResource(s, { fighting: e.amount * Math.floor(s.discard.length / e.per) }, d);
        } else if (e.type === 'stealthPerCardToPlayArea') {
          (options.cards || []).forEach(function (u) {
            const c = removeFrom(s, 'hand', u);
            if (c) s.playArea.push(c);
          });
          addResource(s, { stealth: e.amount * (options.cards || []).length }, d);
        } else if (e.type === 'removeFromGame') {
          /* The purge is interactive: playing the card opens the Bin, and the
             player then bins as many cards as they want, one click at a time. */
          s.bin = { source: e.source === 'discard' ? 'discard' : 'hand', remaining: e.max === null ? -1 : e.max };
          log(s, 'agent', agentName(d) + ' — ' + (e.max === null
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
            const from = lineIndexOf(s, target.uid);
            /* "Pull an obstacle back to the start of the line" = the back of the
               conveyor, as if it were the newest card to appear. Everything
               between the start and its old slot shifts one place to the right. */
            s.line[from] = null;
            for (let i = from; i >= 1; i--) {
              if (!s.line[i] && s.line[i - 1]) {
                s.line[i] = s.line[i - 1];
                s.line[i - 1] = null;
              }
            }
            const slot = s.line.findIndex(function (c) { return !c; });
            s.line[slot < 0 ? 0 : slot] = target;
            event(s, 'moveCard', { card: target.uid, from: from, to: slot < 0 ? 0 : slot, reason: def(card, registry).name });
            log(s, 'agent', agentName(def(card, registry)) + ' drags ' + def(target, registry).name + ' to the back of the line');
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
        } else if (e.type === 'reorderTopOfDeck') {
          /* UI-driven: options.order is top-to-bottom (first entry is the next
             card you draw). */
          if (Array.isArray(options.order)) {
            const top = s.deck.slice(-e.n);
            const back = options.order.slice().reverse().map(function (u) { return findZone(s, 'deck', u); }).filter(Boolean);
            s.deck = s.deck.slice(0, s.deck.length - top.length).concat(back);
          }
        } else if (e.type === 'scoutDeck') {
          /* "Look at the top N. Keep one and put back the rest in any order." */
          const top = s.deck.slice(-e.n);
          const kept = options.keep ? top.find(function (c) { return c.uid === options.keep; }) : null;
          const rest = top.filter(function (c) { return !kept || c.uid !== kept.uid; });
          s.deck = s.deck.slice(0, s.deck.length - top.length);
          const order = Array.isArray(options.order) ? options.order : rest.slice().reverse().map(function (c) { return c.uid; });
          order.slice().reverse().forEach(function (uid) {
            const c = rest.find(function (x) { return x.uid === uid; });
            if (c) s.deck.push(c);
          });
          if (kept) {
            enterHand(s, registry, kept);
            event(s, 'draw', { card: kept.uid, from: 'deck' });
            log(s, 'agent', agentName(d) + ' — kept ' + def(kept, registry).name + ' from the top of the deck');
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

    log(s, 'agent', 'played ' + agentName(d) + ' (' + (d.reward && d.reward.resource ? resourceText(d.reward.resource) : d.reward ? d.reward.name : 'no resource') + ')');
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
    const slot = lineIndexOf(s, card.uid);
    const neighbours = [s.line[slot - 1], s.line[slot + 1]].filter(Boolean);
    const item = options.itemUid ? findZone(s, 'equip', options.itemUid) : null;
    if (options.itemUid && !item) throw new Error('item is not equipped: ' + options.itemUid);

    if (item) {
      const ieffect = def(item, registry).reward && def(item, registry).reward.effect;
      if (!ieffect || ieffect.type !== 'discardToInteract' || ieffect.targetType !== d.obstacleType) {
        throw new Error(def(item, registry).name + ' cannot be used on ' + d.name);
      }
      removeFrom(s, 'equip', item.uid);
      s.obstacleDiscard.push(item);
      event(s, 'play', { card: item.uid, to: 'obstacleDiscard' });
    } else {
      const parts = costBreakdown(cost);
      if (!canAffordParts(s, parts)) {
        throw new Error('cannot pay ' + costText(cost) + ' with ' + resourceText(s.resources) + ' available');
      }
      s.resources.stealth -= parts.stealth;
      s.resources.fighting -= parts.fighting;
      takeFromSources(s, 'stealth', parts.stealth);
      takeFromSources(s, 'fighting', parts.fighting);
      if (parts.flexible) {
        const fromStealth = Math.min(s.resources.stealth, parts.flexible);
        s.resources.stealth -= fromStealth;
        s.resources.fighting -= parts.flexible - fromStealth;
        takeFromSources(s, 'stealth', fromStealth);
        takeFromSources(s, 'fighting', parts.flexible - fromStealth);
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
      if (s.faceDown[target.uid]) throw new Error(def(target, registry).name + ' is already knocked out');
      if (!neighbours.some(function (n) { return n.uid === target.uid; })) {
        throw new Error(def(target, registry).name + ' is not adjacent to ' + d.name);
      }
      s.faceDown[target.uid] = true;
      log(s, 'agent', 'knocked out ' + def(target, registry).name + ' instead of ' + d.name);
      return s;
    }

    if (choice === 'knockOut') {
      s.faceDown[card.uid] = true;
      event(s, 'knockOut', { card: card.uid, slot: slot });
    } else if (choice === 'disarm') {
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
      /* The neighbours are the cards that were beside the barrel *before* it
         left the line, so they were captured up front. */
      neighbours.forEach(function (neighbour) {
        if (!s.faceDown[neighbour.uid]) {
          s.faceDown[neighbour.uid] = true;
          event(s, 'knockOut', { card: neighbour.uid, by: card.uid });
        }
      });
      log(s, 'agent', 'the Flammable Barrel sets off the cards on either side of it');
    }
    log(s, 'agent', (choice === 'knockOut' ? 'knocked out ' : 'disarmed ') + d.name + ' for ' + costText(effectiveCost(s, registry, card)));
    return s;
  }

  /* ---------- 3. Line Scroll ---------- */
  function hasFaceDownStasis(state, registry) {
    return state.line.some(function (c) {
      if (!c || state.faceDown[c.uid]) return false;
      const e = def(c, registry).effect;
      return e && e.type === 'faceDownCardsDoNotScroll';
    });
  }

  function exitLine(state, card, registry) {
    const d = def(card, registry);
    const down = state.faceDown[card.uid];
    const alarm = down ? 0 : d.alarm;
    state.obstacleDiscard.push(card);
    event(state, 'exitLine', { card: card.uid, alarm: alarm, total: Math.min(50, state.alarm + alarm) });
    if (alarm) event(state, 'alarm', { amount: alarm, total: Math.min(50, state.alarm + alarm) });
    state.alarm = Math.min(50, state.alarm + alarm);
    if (state.alarm >= 50) state.gameOver = 'alarm';
    log(state, 'line', d.name + ' left the line — alarm +' + alarm);
    /* A knocked-out card "ignores its Type and Effect", so a face-down Siren
       does not flush the line. */
    if (!down && d.effect && d.effect.type === 'flushLineToDiscardOnExit') {
      state.line.forEach(function (c) { if (c) state.obstacleDiscard.push(c); });
      state.line = normalizeLine([]);
      log(state, 'line', 'the Siren dumps the whole line on the obstacles discard');
    }
  }

  function applyScrollTriggers(state, registry) {
    state.line.forEach(function (card) {
      if (!card || state.faceDown[card.uid]) return;
      const e = def(card, registry).effect;
      if (!e || e.type !== 'flipLastLineCardFaceUp') return;
      const last = state.line[rightmostIndex(state)];
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

    if (rightmostIndex(s) < 0) return s;
    const stasis = hasFaceDownStasis(s, registry);
    /* Line Scroll always takes the last card of the line into the obstacles
       discard. A knocked-out card still leaves — it just raises no alarm (rules:
       "they won't raise the alarm during the Line Scroll"). Dormitory's "facedown
       cards don't slide to the right" holds face-down cards in place; it never
       stops the exit, so the conveyor can never jam. */
    const exitingIndex = rightmostIndex(s);
    const exiting = s.line[exitingIndex];
    s.line[exitingIndex] = null;
    const shifted = [];
    for (let i = exitingIndex - 1; i >= 0; i--) {
      if (!s.line[i]) continue;
      if (stasis && s.faceDown[s.line[i].uid]) continue;
      if (!s.line[i + 1]) {
        s.line[i + 1] = s.line[i];
        s.line[i] = null;
        shifted.push(s.line[i + 1].uid);
      }
    }
    event(s, 'scroll', { shift: shifted, exiting: exiting.uid });
    log(s, 'line', 'the line scrolls one step right; ' + def(exiting, registry).name + ' exits');
    exitLine(s, exiting, registry);
    if (s.gameOver) return s;
    if (!lineCards(s).length) {
      if (s.alarm >= 50) s.gameOver = 'alarm';
      return s;
    }

    for (let i = s.line.length - 1; i >= 0; i--) {
      const card = s.line[i];
      if (!card) continue;
      /* A knocked-out card ignores its type and its effect: no extra slide. */
      if (s.faceDown[card.uid]) continue;
      const e = def(card, registry).effect;
      if (!e || e.type !== 'extraScroll') continue;
      let pos = lineIndexOf(s, card.uid);
      for (let step = 0; step < e.n; step++) {
        const next = pos + 1;
        if (next < s.line.length) {
          if (s.line[next] && stasis && s.faceDown[s.line[next].uid]) {
            log(s, 'line', def(card, registry).name + ' is blocked by a knocked-out card and cannot slide further');
            break;
          }
          const t = s.line[pos];
          s.line[pos] = s.line[next];
          s.line[next] = t;
          pos = next;
          event(s, 'moveCard', { card: card.uid, from: next - 1, to: next, reason: def(card, registry).name });
          log(s, 'line', def(card, registry).name + ' moves an extra space right');
        } else {
          const slid = s.line[pos];
          s.line[pos] = null;
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
    s.passives = {};   /* every equipped item pays its once-per-turn bonus again */
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
    s.sources = [];
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
    log(s, 'agent', agentName(def(card, registry)) + ' goes in the Bin — out of the game for good');
    return s;
  }

  /* ---------- 2. Mission Check ---------- */
  function goalSatisfied(state, registry, missions) {
    const mission = missions[state.missionIndex];
    const g = mission.goal;
    if (g.handSize) return state.hand.length >= g.handSize;
    if (g.knockOutWholeLine) {
      const cards = lineCards(state);
      return cards.length === LINE_SIZE && cards.every(function (c) { return state.faceDown[c.uid]; });
    }
    const itemsOk = (g.itemsRequired || []).every(function (id) {
      return state.equip.some(function (c) { return c.defId === id; });
    });
    if (!itemsOk) return false;
    /* A goal printed with a Stealth triangle needs Stealth, one printed with a
       Fighting circle needs Fighting; only the combined "any mix" glyph can be
       paid with either resource. */
    if (g.resources) {
      if (state.resources.stealth < (g.resources.stealth || 0)) return false;
      if (state.resources.fighting < (g.resources.fighting || 0)) return false;
    }
    if (g.either) {
      const spare = (state.resources.stealth - (g.resources ? (g.resources.stealth || 0) : 0))
                  + (state.resources.fighting - (g.resources ? (g.resources.fighting || 0) : 0));
      if (spare < g.either) return false;
    }
    return true;
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
    s.obstacleDeck = shuffleInPlace(s.obstacleDeck.concat(s.obstacleDiscard, lineCards(s)), s);
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
    s.sources = [];
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
    if (!e || e.type !== 'usedCardToObstacleDiscard') throw new Error(agentName(d) + ' has no use action');
    addResource(s, d.reward.resource, d);
    removeFrom(s, 'equip', card.uid);
    s.obstacleDiscard.push(card);
    event(s, 'play', { card: card.uid, to: 'obstacleDiscard' });
    log(s, 'agent', 'used ' + agentName(d) + ' — ' + (d.reward.resource ? resourceText(d.reward.resource) + ', and ' : '') + 'it goes to the obstacles discard');
    return s;
  }

  return {
    clone, def, agentName, effectiveCost, costBreakdown, canAfford, canInteract, paymentOptions, goalSatisfied,
    playCard, interact, lineScroll, refresh, endTurn, completeMission, useItem, binCard,
    dealLine, event
  };
})();

if (typeof globalThis !== 'undefined') globalThis.Engine = Engine;
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
