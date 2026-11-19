'use strict';

/* Homebase advisor. Pure: state in, ranked plans out.
   No DOM, no text, no Math.random. Every candidate is applied to a clone produced by the
   engine, so the live state is never touched.

   It answers one question: given this position and this turn, what should the agent do,
   in what order, and what is the trade-off against the second-best line of action?

   Two ideas hold the whole thing together:

   1. A turn is not the unit of play. A beautiful move that leaves the belt ticking up kills
      you three turns later, so the search beams across several turns and scores the
      position it ends up in. The plan handed to the player is only the first turn.

   2. The deck is the long game. Disarming costs resources now but puts a better card in
      your deck; knocking out is cheaper but builds nothing. The goal-shortfall term is
      what makes the agent build toward the mission instead of just mopping the belt.

   Honest limits: the advisor reads the belt, the hand, the discard, the play area, the
   equip area and the alarm. It does not read the obstacle deck order. It only looks at
   the player's own deck where the printed card shows it to the player (Plan Ahead,
   Foresight, Just The Thing). */
const Advisor = (function () {
  const LINE_SIZE = 6;

  const WEIGHTS = {
    death: -1000000,
    missionComplete: 100000,   /* banking a mission ends the turn: the belt never scrolls */
    alarm: 12,                 /* every alarm point is a score point, paid for good */
    exposure: 7,               /* alarm still live on the belt, weighted by urgency */
    urgency: [1.0, 0.72, 0.5, 0.36, 0.26, 0.18],   /* slots from the exit chute */
    jam: 45,                   /* Dormitory + a face-down card at the exit: belt stops dead */
    sirenGift: 14,             /* Siren on the belt sweeps the line clean when she exits */
    inflation: 0.15,           /* Watchtower making its neighbours cost more */
    hand: 5,                   /* what the hand in front of you can produce */
    gear: 4,                   /* rewards banked in the deck from cards you disarmed */
    removed: 6,                /* cards binned out of the game for good */
    progress: 60,              /* how close the goal is right now */
    pool: 10,                  /* goal resources the deck can produce in a hand */
    buying: 2,                 /* general purchasing power for "any mix" costs */
    resource: 3,               /* resources in hand this turn, before they evaporate */
    stall: 6                   /* penalty per turn spent without banking a mission */
  };

  /* ---------- position helpers ---------- */

  function lineIndex(state, uid) {
    return state.line.findIndex(function (c) { return c && c.uid === uid; });
  }

  function distanceToExit(state, card) {
    const i = lineIndex(state, card.uid);
    if (i < 0) return LINE_SIZE;
    return LINE_SIZE - 1 - i;
  }

  function totalAlarm(state) {
    return (state.missionAlarms || []).reduce(function (a, b) { return a + b; }, 0) + (state.alarm || 0);
  }

  function goalProfile(mission) {
    const g = mission && mission.goal;
    if (!g) return { stealth: 0, fighting: 0, either: 0 };
    return {
      stealth: (g.resources && g.resources.stealth) || 0,
      fighting: (g.resources && g.resources.fighting) || 0,
      either: g.either || 0
    };
  }

  function cardValue(def, goal) {
    if (!def) return 0;
    let v = 0;
    const r = def.reward && def.reward.resource;
    if (r) {
      v += (r.stealth || 0) * (goal && goal.stealth ? 3 : 1.2);
      v += (r.fighting || 0) * (goal && goal.fighting ? 3 : 1.2);
      if (goal && goal.either) v += (r.stealth || 0) * 1.5 + (r.fighting || 0) * 1.5;
    }
    const e = def.reward && def.reward.effect;
    if (e) {
      if (e.type === 'draw') v += 1.6 * (e.n || 1);
      if (e.type === 'discardToInteract') v += 5;
      if (e.type === 'drawPerEquippedKeep') v += 4;
      if (e.type === 'scoutDeck' || e.type === 'searchDeckToTop' || e.type === 'reorderTopOfDeck') v += 3;
    }
    if (def.keep) v += 2;
    return v;
  }

  /* Alarm still live on the belt, weighted by how soon it reaches the chute.
     A face-down card raises nothing on the scroll, so it carries no exposure. */
  function exposure(state, registry) {
    let sum = 0;
    state.line.forEach(function (card) {
      if (!card || state.faceDown[card.uid]) return;
      const def = registry[card.defId];
      const dist = distanceToExit(state, card);
      sum += (def.alarm || 0) * WEIGHTS.urgency[Math.min(dist, LINE_SIZE - 1)];
    });
    return sum;
  }

  /* Dormitory says face-down cards do not slide. If the card at the exit is face down
     while the Dormitory is face up, nothing ever leaves the belt and the mission stalls. */
  function beltJammed(state, registry) {
    let dorm = false;
    let exit = null;
    for (let i = state.line.length - 1; i >= 0; i--) {
      const card = state.line[i];
      if (!card) continue;
      if (!exit) exit = card;
      if (!state.faceDown[card.uid]) {
        const e = registry[card.defId].effect;
        if (e && e.type === 'faceDownCardsDoNotScroll') dorm = true;
      }
    }
    return dorm && exit && state.faceDown[exit.uid];
  }

  function sirenOnBelt(state, registry) {
    return state.line.some(function (card) {
      if (!card || state.faceDown[card.uid]) return false;
      const e = registry[card.defId].effect;
      return !!e && e.type === 'flushLineToDiscardOnExit';
    });
  }

  function adjacentInflation(state, registry) {
    let penalty = 0;
    state.line.forEach(function (card, i) {
      if (!card || state.faceDown[card.uid]) return;
      const e = registry[card.defId].effect;
      if (!e || e.type !== 'adjacentCostModifier') return;
      [i - 1, i + 1].forEach(function (n) {
        const neighbour = state.line[n];
        if (neighbour && !state.faceDown[neighbour.uid]) {
          penalty += globalThis.Engine.effectiveCost(state, registry, neighbour).total * WEIGHTS.inflation;
        }
      });
    });
    return penalty;
  }

  function handValue(state, registry, goal) {
    return state.hand.reduce(function (sum, card) {
      return sum + cardValue(registry[card.defId], goal);
    }, 0);
  }

  /* How much of the goal resource this deck can produce in a single hand. The pool is
     everything the player owns; a hand is drawn from it, so the best realistic yield is
     the top handSize cards. This is the term that makes the agent build a deck instead of
     only mopping the belt. */
  function goalYield(def, goal) {
    const r = def.reward && def.reward.resource;
    const stealth = r ? (r.stealth || 0) : 0;
    const fighting = r ? (r.fighting || 0) : 0;
    const e = def.reward && def.reward.effect;
    let drawBoost = 0;
    if (e && e.type === 'draw') drawBoost = 1.5 * (e.n || 1);
    if (e && e.type === 'fightingPerDiscardPair') drawBoost += 1;
    if (goal.stealth) return stealth;
    if (goal.fighting) return fighting;
    if (goal.either) return stealth + fighting;
    return 1 + drawBoost;   /* hand-size and whole-line goals: every card counts */
  }

  function buyYield(def) {
    const r = def.reward && def.reward.resource;
    const stealth = r ? (r.stealth || 0) : 0;
    const fighting = r ? (r.fighting || 0) : 0;
    const e = def.reward && def.reward.effect;
    let drawBoost = 0;
    if (e && e.type === 'draw') drawBoost = 1.2 * (e.n || 1);
    return stealth + fighting + drawBoost;
  }

  function poolPotential(state, registry, goal) {
    const cards = state.deck.concat(state.discard, state.hand, state.playArea, state.saved);
    if (!cards.length) return { goal: 0, buy: 0 };
    /* The hand is drawn at random from the pool, so what matters is the average quality
       of the deck, not its best card. Pruning junk (the Bin) raises the average. */
    let goalSum = 0, buySum = 0;
    cards.forEach(function (c) {
      goalSum += goalYield(registry[c.defId], goal);
      buySum += buyYield(registry[c.defId]);
    });
    state.equip.forEach(function (c) {
      const d = registry[c.defId];
      if (d.reward && d.reward.oncePerTurn) { goalSum += goalYield(d, goal); buySum += buyYield(d); }
    });
    const perCard = 1 / cards.length;
    return {
      goal: goalSum * perCard * state.rules.handSize,
      buy: buySum * perCard * state.rules.handSize
    };
  }

  function goalShortfall(state, registry, missions) {
    const mission = missions[state.missionIndex];
    const goal = goalProfile(mission);
    const need = goal.stealth || goal.fighting || goal.either || 0;
    if (!need) return 0;
    return Math.max(0, need - poolPotential(state, registry, goal).goal);
  }

  function goalProgress(state, mission) {
    const g = mission && mission.goal;
    if (!g) return 0;
    if (g.handSize) return Math.min(1, state.hand.length / g.handSize);
    if (g.knockOutWholeLine) {
      const cards = state.line.filter(Boolean);
      if (!cards.length) return 0;
      return cards.filter(function (c) { return state.faceDown[c.uid]; }).length / cards.length;
    }
    const items = (g.itemsRequired || []).filter(function (id) {
      return state.equip.some(function (c) { return c.defId === id; });
    }).length;
    const itemShare = g.itemsRequired && g.itemsRequired.length ? items / g.itemsRequired.length : 1;
    let resourceShare = 1;
    if (g.resources) {
      const need = (g.resources.stealth || 0) + (g.resources.fighting || 0);
      const have = Math.min(state.resources.stealth, g.resources.stealth || 0) +
                   Math.min(state.resources.fighting, g.resources.fighting || 0);
      resourceShare = need ? have / need : 1;
    }
    if (g.either) {
      const spent = g.resources ? (g.resources.stealth || 0) + (g.resources.fighting || 0) : 0;
      const spare = (state.resources.stealth + state.resources.fighting) - spent;
      resourceShare = Math.min(1, Math.max(0, spare) / g.either * 0.5 + resourceShare * 0.5);
    }
    return Math.max(0, Math.min(1, itemShare * resourceShare));
  }

  function evaluate(state, registry, missions) {
    if (state.gameOver === 'alarm' || state.gameOver === 'time') {
      return { score: WEIGHTS.death, parts: { death: WEIGHTS.death }, alarm: state.alarm, exposure: 0 };
    }
    const mission = missions[state.missionIndex];
    const goal = goalProfile(mission);
    const pool = poolPotential(state, registry, goal);
    const parts = {};

    parts.alarm = -totalAlarm(state) * WEIGHTS.alarm;
    parts.missions = (state.missionAlarms || []).length * WEIGHTS.missionComplete;
    if (state.gameOver === 'campaignComplete') parts.missions += WEIGHTS.missionComplete;
    parts.exposure = -exposure(state, registry);
    parts.jam = beltJammed(state, registry) ? -WEIGHTS.jam : 0;
    parts.siren = sirenOnBelt(state, registry) ? WEIGHTS.sirenGift : 0;
    parts.inflation = -adjacentInflation(state, registry);
    parts.resource = (state.resources.stealth + state.resources.fighting) * WEIGHTS.resource;
    parts.pool = pool.goal * WEIGHTS.pool + pool.buy * WEIGHTS.buying;
    parts.progress = goalProgress(state, mission) * WEIGHTS.progress;
    parts.stall = -(state.turn - (state.missionAlarms || []).length) * WEIGHTS.stall;
    parts.removed = -(state.removed || []).reduce(function (sum, entry) {
      return sum + goalYield(registry[entry.defId], goal);
    }, 0) * WEIGHTS.removed;

    const score = Object.keys(parts).reduce(function (s, k) { return s + parts[k]; }, 0);
    return { score: score, parts: parts, alarm: state.alarm, exposure: exposure(state, registry) };
  }

  function gearValue(state, registry, goal) {
    const owned = state.deck.concat(state.discard, state.playArea, state.equip, state.saved);
    return owned.reduce(function (sum, card) {
      const def = registry[card.defId];
      if (def.set !== 'obstacle' && def.set !== 'mission') return sum;
      return sum + cardValue(def, goal) * 0.4;
    }, 0);
  }

  /* ---------- what a turn looks like ----------
     Playing a card is free and unspent resources evaporate at the refresh, so the
     correct play is always "play everything in your hand, then spend what you got".
     The real decision — the one the Colonel is worth asking about — is which obstacle
     to spend the interaction on. So the search fixes the card plays and beams over the
     interactions. */
  function pickCardToPlay(state, registry, goal) {
    let best = null, bestValue = -1;
    state.hand.forEach(function (card) {
      const def = registry[card.defId];
      const e = def.reward && def.reward.effect;
      const drawFirst = e && (e.type === 'draw' || e.type === 'drawPerEquippedKeep' || e.alternative);
      const value = (drawFirst ? 100 : 0) + cardValue(def, goal);
      if (value > bestValue) { bestValue = value; best = card; }
    });
    return best;
  }

  function playOptions(state, registry, card, goal) {
    const def = registry[card.defId];
    const e = def.reward && def.reward.effect;
    if (!e) return null;
    if (e.alternative) {
      /* Drawing is only better than the resource when the mission wants a big hand. */
      const wantDraw = missions[state.missionIndex] && missions[state.missionIndex].goal &&
        missions[state.missionIndex].goal.handSize && state.hand.length < 4;
      return { choice: wantDraw ? 'draw' : 'resource' };
    }
    if (e.type === 'stealthPerCardToPlayArea') {
      return { cards: state.hand.filter(function (c) { return c.uid !== card.uid; }).map(function (c) { return c.uid; }) };
    }
    if (e.type === 'discardToHand') {
      const pick = pickBest(state.discard, registry, goal);
      return pick ? { uid: pick.uid } : null;
    }
    if (e.type === 'saveHandCardForNextTurn') {
      const pick = pickBest(state.hand.filter(function (c) { return c.uid !== card.uid; }), registry, goal);
      return pick ? { uid: pick.uid } : null;
    }
    if (e.type === 'searchDeckToTop') {
      const pick = pickBest(state.deck, registry, goal);
      return pick ? { uid: pick.uid } : null;
    }
    if (e.type === 'moveObstacleToStartOfLine') {
      /* Dormitory's Distraction: pull the most dangerous card back to the far end of the belt. */
      let target = null, worst = -1;
      state.line.forEach(function (c) {
        if (!c || state.faceDown[c.uid]) return;
        const alarm = registry[c.defId].alarm || 0;
        if (alarm > worst) { worst = alarm; target = c; }
      });
      return target ? { uid: target.uid } : null;
    }
    if (e.type === 'reorderTopOfDeck') {
      const top = state.deck.slice(-e.n).slice().sort(function (a, b) {
        return cardValue(registry[b.defId], goal) - cardValue(registry[a.defId], goal);
      });
      return { order: top.map(function (c) { return c.uid; }) };
    }
    if (e.type === 'scoutDeck') {
      const top = state.deck.slice(-e.n);
      const keep = pickBest(top, registry, goal);
      if (!keep) return null;
      return { keep: keep.uid, order: top.filter(function (c) { return c.uid !== keep.uid; }).map(function (c) { return c.uid; }) };
    }
    return null;
  }

  function pickBest(cards, registry, goal) {
    let best = null, bestValue = -1;
    cards.forEach(function (c) {
      const v = cardValue(registry[c.defId], goal);
      if (v > bestValue) { bestValue = v; best = c; }
    });
    return best;
  }

  function playAllCards(state, registry, missions) {
    const goal = goalProfile(missions[state.missionIndex]);
    let s = state;
    const acts = [];
    let guard = 0;
    while (s.hand.length && guard < 16) {
      guard++;
      const card = pickCardToPlay(s, registry, goal);
      if (!card) break;
      let next = null;
      try { next = globalThis.Engine.playCard(s, card.uid, registry, playOptions(s, registry, card, goal)); } catch (err) { break; }
      if (!next) break;
      acts.push({ kind: 'play', uid: card.uid, name: registry[card.defId].name, options: playOptions(s, registry, card, goal) });
      s = next;
    }
    return { state: s, acts: acts };
  }

  /* ---------- candidate enumeration ---------- */

  function subsets(list, max) {
    const out = [[]];
    for (let i = 0; i < list.length && i < max; i++) {
      const n = out.length;
      for (let j = 0; j < n; j++) out.push(out[j].concat([list[i]]));
    }
    return out.slice(0, 10);
  }

  function playVariants(state, registry, card, goal) {
    const def = registry[card.defId];
    const e = def.reward && def.reward.effect;
    if (!e) return [null];

    if (e.alternative) return [{ choice: 'resource' }, { choice: 'draw' }];

    if (e.type === 'stealthPerCardToPlayArea') {
      const others = state.hand.filter(function (c) { return c.uid !== card.uid; });
      return subsets(others.map(function (c) { return c.uid; }), 3).map(function (cards) {
        return { cards: cards };
      });
    }
    if (e.type === 'discardToHand') {
      if (!state.discard.length) return [null];
      return state.discard.slice(-6).map(function (c) { return { uid: c.uid }; });
    }
    if (e.type === 'saveHandCardForNextTurn') {
      return state.hand.filter(function (c) { return c.uid !== card.uid; }).map(function (c) { return { uid: c.uid }; });
    }
    if (e.type === 'moveObstacleToStartOfLine') {
      return state.line.filter(function (c) { return c && !state.faceDown[c.uid]; }).map(function (c) { return { uid: c.uid }; });
    }
    if (e.type === 'searchDeckToTop') {
      const ranked = state.deck.slice().sort(function (a, b) {
        return cardValue(registry[b.defId], goal) - cardValue(registry[a.defId], goal);
      });
      return ranked.slice(0, 6).map(function (c) { return { uid: c.uid }; });
    }
    if (e.type === 'reorderTopOfDeck') {
      const top = state.deck.slice(-e.n);
      if (!top.length) return [null];
      const ranked = top.slice().sort(function (a, b) {
        return cardValue(registry[b.defId], goal) - cardValue(registry[a.defId], goal);
      });
      const orders = [ranked.map(function (c) { return c.uid; }), top.map(function (c) { return c.uid; })];
      top.forEach(function (c) {
        orders.push([c.uid].concat(top.filter(function (x) { return x.uid !== c.uid; }).map(function (x) { return x.uid; })));
      });
      return orders.map(function (order) { return { order: order }; });
    }
    if (e.type === 'scoutDeck') {
      const top = state.deck.slice(-e.n);
      if (!top.length) return [null];
      const out = [];
      top.forEach(function (keep) {
        const rest = top.filter(function (c) { return c.uid !== keep.uid; });
        out.push({ keep: keep.uid, order: rest.map(function (c) { return c.uid; }) });
        out.push({ keep: keep.uid, order: rest.slice().reverse().map(function (c) { return c.uid; }) });
      });
      return out;
    }
    return [null];
  }

  function legalActions(state, registry, missions) {
    const goal = goalProfile(missions[state.missionIndex]);
    const acts = [];

    state.hand.forEach(function (card) {
      const def = registry[card.defId];
      playVariants(state, registry, card, goal).forEach(function (options) {
        acts.push({ kind: 'play', uid: card.uid, name: def.name, options: options });
      });
    });

    state.line.forEach(function (card, i) {
      if (!card) return;
      const check = globalThis.Engine.canInteract(state, registry, card);
      if (!check.ok) return;
      const def = registry[card.defId];
      const payments = [null].concat(check.items.map(function (item) { return item.uid; }));
      payments.forEach(function (itemUid) {
        ['disarm', 'knockOut'].forEach(function (choice) {
          acts.push({
            kind: 'interact', uid: card.uid, choice: choice, itemUid: itemUid, slot: i,
            name: def.name, type: def.obstacleType, alarm: def.alarm || 0,
            cost: check.parts, canPayResources: check.canPayResources
          });
        });
      });
      if (def.effect && def.effect.type === 'knockOutAdjacentInsteadOfInteract') {
        [state.line[i - 1], state.line[i + 1]].forEach(function (n) {
          if (n && !state.faceDown[n.uid]) {
            acts.push({
              kind: 'interact', uid: card.uid, choice: 'knockOutAdjacent', targetUid: n.uid,
              slot: i, name: def.name, type: def.obstacleType, alarm: def.alarm || 0,
              cost: check.parts, canPayResources: check.canPayResources
            });
          }
        });
      }
    });

    state.equip.forEach(function (card) {
      const def = registry[card.defId];
      const e = def.reward && def.reward.effect;
      if (e && e.type === 'usedCardToObstacleDiscard') acts.push({ kind: 'useItem', uid: card.uid, name: def.name });
    });

    if (state.bin && state.bin.remaining !== 0) {
      const zone = state.bin.source === 'discard' ? state.discard : state.hand;
      zone.forEach(function (card) {
        acts.push({ kind: 'bin', uid: card.uid, name: registry[card.defId].name });
      });
    }

    if (globalThis.Engine.goalSatisfied(state, registry, missions)) acts.push({ kind: 'missionCheck' });
    acts.push({ kind: 'endTurn' });

    return acts;
  }

  function applyAction(state, act, registry, missions) {
    try {
      if (act.kind === 'play') return globalThis.Engine.playCard(state, act.uid, registry, act.options);
      if (act.kind === 'interact') {
        return globalThis.Engine.interact(state, act.uid, act.choice, registry, { itemUid: act.itemUid, uid: act.targetUid });
      }
      if (act.kind === 'useItem') return globalThis.Engine.useItem(state, act.uid, registry);
      if (act.kind === 'bin') return globalThis.Engine.binCard(state, act.uid, registry);
      if (act.kind === 'missionCheck') return globalThis.Engine.completeMission(state, registry, missions);
      if (act.kind === 'endTurn') return globalThis.Engine.endTurn(state, registry);
    } catch (err) {
      return null;
    }
    return null;
  }

  /* ---------- search ---------- */

  /* All the ways to close one turn, ranked by the position they leave. */
  function turnPlans(state, registry, missions, beamWidth, maxActions) {
    const played = playAllCards(state, registry, missions);
    let beam = [{ state: played.state, acts: played.acts, score: evaluate(played.state, registry, missions).score }];
    const closed = [];

    /* Doing nothing is always a legal way to end the turn. */
    const plain = applyAction(played.state, { kind: 'endTurn' }, registry, missions);
    if (plain) closed.push({ state: plain, acts: played.acts.concat([{ kind: 'endTurn' }]), score: evaluate(plain, registry, missions).score });
    if (globalThis.Engine.goalSatisfied(played.state, registry, missions)) {
      const check = applyAction(played.state, { kind: 'missionCheck' }, registry, missions);
      if (check) closed.push({ state: check, acts: played.acts.concat([{ kind: 'missionCheck' }]), score: evaluate(check, registry, missions).score });
    }

    for (let depth = 0; depth < maxActions; depth++) {
      const expanded = [];
      beam.forEach(function (node) {
        legalActions(node.state, registry, missions).forEach(function (act) {
          if (act.kind === 'play' || act.kind === 'endTurn' || act.kind === 'missionCheck') return;
          const after = applyAction(node.state, act, registry, missions);
          if (!after) return;
          const acts = node.acts.concat([act]);
          const score = evaluate(after, registry, missions).score;
          expanded.push({ state: after, acts: acts, score: score });
          if (globalThis.Engine.goalSatisfied(after, registry, missions)) {
            const check = applyAction(after, { kind: 'missionCheck' }, registry, missions);
            if (check) closed.push({ state: check, acts: acts.concat([{ kind: 'missionCheck' }]), score: evaluate(check, registry, missions).score });
          }
          const done = applyAction(after, { kind: 'endTurn' }, registry, missions);
          if (done) closed.push({ state: done, acts: acts.concat([{ kind: 'endTurn' }]), score: evaluate(done, registry, missions).score });
        });
      });
      if (!expanded.length) break;
      expanded.sort(function (a, b) { return b.score - a.score; });
      beam = expanded.slice(0, beamWidth);
    }
    closed.sort(function (a, b) { return b.score - a.score; });
    return closed;
  }

  function horizonScore(state, registry, missions) {
    if (state.gameOver === 'alarm') return WEIGHTS.death + state.turn * 100;   /* surviving longer is better */
    if (state.gameOver === 'time') return WEIGHTS.death + 2000;
    if (state.gameOver === 'campaignComplete') return 1000000 - totalAlarm(state) * WEIGHTS.alarm;
    return evaluate(state, registry, missions).score;
  }

  /* Beam search across several turns. The plan the player receives is the first turn;
     the score is the position the line of action ends up in. */
  function searchPlans(state, registry, missions, opts) {
    opts = opts || {};
    const horizon = opts.horizon || 4;
    const beamWidth = opts.beamWidth || 12;
    const maxActions = opts.maxActions || 5;
    let frontier = [{ state: state, first: [], score: 0 }];

    for (let t = 0; t < horizon; t++) {
      const next = [];
      frontier.forEach(function (node) {
        turnPlans(node.state, registry, missions, Math.max(2, beamWidth - 3), maxActions).forEach(function (plan) {
          next.push({
            state: plan.state,
            first: t === 0 ? plan.acts : node.first,
            score: plan.score
          });
        });
      });
      next.sort(function (a, b) { return b.score - a.score; });
      frontier = next.slice(0, beamWidth);
      if (!frontier.length) break;
    }

    frontier.forEach(function (n) { n.total = horizonScore(n.state, registry, missions); });
    frontier.sort(function (a, b) { return b.total - a.total; });
    return frontier;
  }

  function signature(actions) {
    return actions.map(function (a) {
      return a.kind + ':' + (a.uid || '') + ':' + (a.choice || '') + ':' + (a.targetUid || '');
    }).join('>');
  }

  function advise(state, registry, missions, opts) {
    if (!state || state.gameOver) return null;
    const plans = searchPlans(state, registry, missions, opts || {});
    if (!plans.length) return null;

    const seen = new Set();
    const distinct = [];
    plans.forEach(function (p) {
      const s = signature(p.first);
      if (seen.has(s)) return;
      seen.add(s);
      distinct.push(p);
    });

    const best = distinct[0];
    /* The alternative worth hearing about: the best plan that is materially different.
       Sometimes the only way to finish the mission is to let something expensive walk
       out of the belt; the Colonel should say so plainly. */
    let alternative = null;
    for (let i = 1; i < distinct.length; i++) {
      const p = distinct[i];
      if (Math.abs(p.total - best.total) > 4) { alternative = p; break; }
    }

    const targets = [];
    best.first.forEach(function (a) {
      if (a.kind === 'interact' || a.kind === 'play') targets.push(a.uid);
    });

    return {
      best: { actions: best.first, state: best.state, score: best.total },
      alternative: alternative ? { actions: alternative.first, state: alternative.state, score: alternative.total } : null,
      targets: targets,
      confidence: distinct.length > 1 ? Math.max(0, Math.min(1, (best.total - distinct[1].total) / 120)) : 1,
      alarmAfter: best.state.alarm,
      exposureAfter: exposure(best.state, registry),
      missionDone: best.first.some(function (a) { return a.kind === 'missionCheck'; }),
      alternatives: distinct.slice(0, 6).map(function (p) {
        return {
          actions: p.first,
          score: p.total,
          alarm: p.state.alarm,
          exposure: exposure(p.state, registry)
        };
      })
    };
  }

  return {
    advise, legalActions, applyAction, searchPlans, turnPlans, horizonScore, evaluate, exposure,
    beltJammed, goalProfile, goalProgress, goalYield, poolPotential, goalShortfall, cardValue, WEIGHTS
  };
})();

if (typeof globalThis !== 'undefined') globalThis.Advisor = Advisor;
if (typeof module !== 'undefined' && module.exports) module.exports = Advisor;
