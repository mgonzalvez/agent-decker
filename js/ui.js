'use strict';

const UI = (function () {
  const TRAINING_SEED = 19;
  let state = null;
  let registry = {};
  let missions = [];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function defOf(card) { return registry[card.defId]; }

  /* An equipped item is named after the thing it gives you (Infimary carries
   the Chloroform), which is what the player reads on the card front. */
  function itemName(def) {
    return (def.reward && def.reward.name) ? def.reward.name : def.name;
  }

  function typeLabel(def) {
    if (def.obstacleType) return def.obstacleType;
    if (def.isGoal) return 'mission';
    return 'agent';
  }

  function costLabel(card) {
    const c = Engine.effectiveCost(state, registry, card);
    const parts = [];
    if (c.stealth) parts.push(c.stealth + ' Stealth');
    if (c.fighting) parts.push(c.fighting + ' Fighting');
    if (c.either) parts.push(c.either + ' (any mix)');
    if (c.extra) parts.push('+' + c.extra + ' (Watchtower)');
    return parts.join(' + ') || 'free';
  }

  /* Undo: the engine is pure, so a snapshot of the previous state is a perfect
     rewind. Only moves inside the current turn are rewindable. */
  let undoStack = [];
  let openMenus = [];
  const UNDO_LIMIT = 20;

  function defIdFromUid(uid) {
    return String(uid).replace(/_\d+$/, '');
  }

  function updateUndoButton() {
    const button = document.getElementById('undo');
    if (!button) return;
    button.disabled = !undoStack.length || !state || !!state.gameOver;
  }

  function pushUndo() {
    if (!state || state.gameOver) return;
    undoStack.push(JSON.parse(JSON.stringify(state)));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }

  function undo() {
    if (!undoStack.length || !state || state.gameOver) return null;
    const previous = undoStack.pop();
    previous.events = [];
    state = previous;
    if (typeof window !== 'undefined') window.gameState = state;
    if (typeof Save !== 'undefined') Save.saveGame(state);
    if (typeof Sound !== 'undefined') Sound.play('undo');
    closeOverlay();
    render();
    updateUndoButton();
    return 'move undone';
  }

  function cardAlt(def) {
    if (def.set === 'starting') return def.name;
    if (def.isGoal) return def.name + ' — goal: ' + def.goalText;
    return def.name + ' — ' + def.obstacleType + ', cost ' + (def.cost ? (def.cost.either ? def.cost.either + ' any mix' : (def.cost.stealth || 0) + ' stealth / ' + (def.cost.fighting || 0) + ' fighting') : '') + ', alarm ' + def.alarm;
  }

  function thumb(card, zone) {
    const isGoal = defOf(card).isGoal;
    const div = el('div', 'thumb' + (isGoal ? ' goal-card' : ''));
    div.setAttribute('data-uid', card.uid);
    const face = el('button', 'thumb-face');
    face.type = 'button';
    face.setAttribute('aria-label', 'Zoom ' + defOf(card).name);
    const img = el('img');
    img.src = defOf(card).art[0];
    img.alt = cardAlt(defOf(card));
    face.appendChild(img);
    face.addEventListener('click', function () {
      /* Cards sitting in the Equip or Play Area are not in the line, so there is
         nothing to pay for: clicking one blows it up to a readable size instead. */
      if (zone === 'equip' || zone === 'play') openZoom(defOf(card), areaCaption(defOf(card), zone));
      else openCard(card, zone || 'area');
    });
    div.appendChild(face);
    if (zone === 'equip') {
      const d = defOf(card);
      const effect = d.reward && d.reward.effect;
      if (effect && effect.type === 'discardToInteract') {
        div.appendChild(el('span', 'equip-note', itemName(d) + ' — works on ' + effect.targetType));
      }
      if (effect && effect.type === 'usedCardToObstacleDiscard') {
        const button = el('button', 'use-btn');
        button.type = 'button';
        button.textContent = 'Use';
        button.addEventListener('click', function () {
          apply(Engine.useItem(state, card.uid, registry), d.name + ' used', 'disarm', true);
        });
        div.appendChild(button);
      }
    }
    return div;
  }

  function fillArea(id, cards, zone) {
    const box = document.getElementById(id);
    box.innerHTML = '';
    if (!cards.length) {
      const nothing = zone === 'equip' ? 'nothing equipped yet'
        : zone === 'bin' ? 'nothing binned'
        : zone === 'play' ? 'nothing played this turn'
        : 'nothing here';
      box.appendChild(el('p', 'empty', nothing));
      return;
    }
    cards.forEach(function (card) { box.appendChild(thumb(card, zone)); });
  }

  function plan() {
    return typeof Tutorial !== 'undefined' ? Tutorial.plan(state, registry, missions) : null;
  }

  function allowed(key) {
    const p = plan();
    return !p || !!p.allowed[key];
  }

  function renderLine() {
    const line = document.getElementById('line');
    line.innerHTML = '';
    const p = plan();
    const mark = p && p.highlight ? p.highlight : {};
    const canAct = state.interactionsLeft > 0 && !state.gameOver;
    let lastSlot = -1;
    for (let i = state.line.length - 1; i >= 0; i--) if (state.line[i]) { lastSlot = i; break; }
    state.line.forEach(function (card, index) {
      if (!card) {
        const hole = el('div', 'slot slot-empty');
        hole.style.gridColumn = String(index + 1);
        hole.setAttribute('aria-hidden', 'true');
        hole.appendChild(el('span', 'slot-meta', 'empty slot'));
        line.appendChild(hole);
        return;
      }
      const def = defOf(card);
      const isLast = index === lastSlot;
      let extra = isLast ? ' exiting' : '';
      if (mark.disarm === card.uid) extra += ' tut-disarm';
      if (mark.knockOut === card.uid) extra += ' tut-knock';
      if (mark.exiting === card.uid) extra += ' tut-exit';
      if (isFresh() && radio.transmission.targets.indexOf(card.uid) >= 0) extra += ' radio-mark';
      if (isFresh() && (radio.transmission.altTargets || []).indexOf(card.uid) >= 0) extra += ' radio-mark-alt';
      const payable = canAct && !state.faceDown[card.uid] && Engine.canInteract(state, registry, card).ok;
      if (payable) extra += ' can-interact';
      const slot = el('button', 'slot' + (state.faceDown[card.uid] ? ' face-down' : '') + extra);
      slot.type = 'button';
      slot.setAttribute('data-uid', card.uid);
      slot.style.gridColumn = String(index + 1);
      const img = el('img');
      img.src = def.art[0];
      img.alt = cardAlt(def);
      slot.setAttribute('aria-label', def.name + ' (' + typeLabel(def) + ') — ' + (state.faceDown[card.uid] ? 'knocked out' : costLabel(card) + ', alarm ' + def.alarm));
      slot.appendChild(img);
      slot.appendChild(el('span', 'slot-meta' + (payable ? ' meta-afford' : ''), state.faceDown[card.uid]
        ? def.name + ' — knocked out'
        : def.name + ' · ' + costLabel(card) + ' · alarm ' + def.alarm + (isLast ? ' · exits next' : '')));
      slot.addEventListener('click', function () { openCard(card, 'line'); });
      line.appendChild(slot);
    });
  }

  function renderHand() {
    const hand = document.getElementById('hand');
    hand.innerHTML = '';
    state.hand.forEach(function (card) {
      const def = defOf(card);
      const fig = el('figure', 'card' + (isFresh() && radio.transmission.targets.indexOf(card.uid) >= 0 ? ' radio-mark' : ''));
      fig.setAttribute('data-uid', card.uid);
      const face = el('button', 'card-face');
      face.type = 'button';
      face.setAttribute('aria-label', 'Zoom ' + def.name);
      const img = el('img');
      img.src = def.art[0];
      img.alt = cardAlt(def);
      face.appendChild(img);
      face.addEventListener('click', function () { openCard(card, 'hand'); });
      fig.appendChild(face);
      const caption = el('figcaption', null, def.name);
      fig.appendChild(caption);
      if (state.bin && !state.gameOver) {
        fig.appendChild(el('span', 'card-effect', effectSummary(def)));
      }
      const button = el('button', 'play-btn');
      button.type = 'button';
      button.textContent = 'Play';
      button.setAttribute('aria-label', 'Play ' + def.name + ' from your hand');
      button.disabled = !allowed('play');
      button.addEventListener('click', function () { playCard(card); });
      fig.appendChild(button);
      if (state.bin && !state.gameOver) {
        const binButton = el('button', 'bin-btn');
        binButton.type = 'button';
        binButton.textContent = 'Bin';
        binButton.title = 'Remove ' + def.name + ' from the game for good';
        binButton.addEventListener('click', function () {
          apply(Engine.binCard(state, registry, card.uid), def.name + ' binned', 'bin', true);
        });
        fig.appendChild(binButton);
      }
      hand.appendChild(fig);
    });
  }

  function breakdown(cards) {
    const counts = {};
    cards.forEach(function (card) {
      const name = defOf(card).name;
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.keys(counts).map(function (name) { return name + ' ×' + counts[name]; }).join(' · ') || 'empty';
  }

  function renderCoach() {
    const coach = document.getElementById('coach');
    if (!coach) return;
    const p = plan();
    if (!p) {
      coach.hidden = true;
      return;
    }
    coach.hidden = false;
    document.getElementById('coach-title').textContent = p.title;
    document.getElementById('coach-text').textContent = p.text;
    if (p.id === 'finished' && !document.getElementById('coach-campaign')) {
      const button = el('button', 'play-btn');
      button.id = 'coach-campaign';
      button.type = 'button';
      button.textContent = 'Start the campaign';
      button.addEventListener('click', function () { start(state.seed); });
      const actions = document.querySelector('.coach-actions');
      if (actions) actions.appendChild(button);
    }
  }

  function render() {
    const mission = missions[state.missionIndex];
    document.querySelector('#mission-banner .mission-name').textContent = mission.name;
    document.querySelector('#mission-banner .mission-goal').textContent = 'Goal: ' + registry[mission.goalCardId].goalText;
    const letter = document.querySelector('#mission-banner .mission-letter');
    if (letter) letter.textContent = mission.letter;

    const alarmBox = document.getElementById('alarm');
    const alarmValue = document.getElementById('alarm-value');
    const level = state.alarm >= 45 ? 'critical' : state.alarm >= 40 ? 'high' : state.alarm >= 20 ? 'mid' : 'low';
    if (alarmBox) {
      ['level-low', 'level-mid', 'level-high', 'level-critical'].forEach(function (name) {
        alarmBox.classList.toggle(name, name === 'level-' + level);
      });
      alarmBox.setAttribute('aria-label', 'Alarm level: ' + state.alarm + ' of 50');
    }
    alarmValue.textContent = state.alarm;
    const mark = document.getElementById('alarm-mark');
    if (mark) {
      const pos = (Math.min(50, state.alarm) / 50) * 100;
      mark.setAttribute('x1', pos.toFixed(1));
      mark.setAttribute('x2', pos.toFixed(1));
    }
    const danger = document.getElementById('alarm-danger');
    if (danger) danger.hidden = state.alarm < 40;
    const check = document.getElementById('mission-check');
    if (check) {
      check.disabled = !allowed('missionCheck');
      check.classList.toggle('is-ready', !check.disabled && Actions.missionCheck(state, registry, missions));
    }
    const end = document.getElementById('end-turn');
    if (end) {
      const outOfMoves = state.hand.length === 0 && state.interactionsLeft === 0 && !state.gameOver;
      end.disabled = !allowed('endTurn');
      end.classList.toggle('is-ready', !end.disabled && outOfMoves);
    }
    document.getElementById('seed').textContent = 'seed: ' + state.seed;

    document.getElementById('res-stealth').textContent = state.resources.stealth;
    document.getElementById('res-fighting').textContent = state.resources.fighting;
    document.getElementById('interactions-left').textContent = state.interactionsLeft;
    document.getElementById('turn-number').textContent = state.turn;

    const goal = document.getElementById('goal-card');
    goal.querySelector('img').src = registry[mission.goalCardId].art[0];
    goal.querySelector('figcaption').textContent = mission.name;

    document.getElementById('obstacle-deck-count').textContent = state.obstacleDeck.length;
    document.getElementById('obstacle-discard-count').textContent = state.obstacleDiscard.length;
    document.getElementById('player-deck-count').textContent = state.deck.length;
    document.getElementById('player-hand-count').textContent = state.hand.length;
    document.getElementById('player-discard-count').textContent = state.discard.length;
    const playerTotal = state.deck.length + state.hand.length + state.discard.length + state.playArea.length + state.equip.length;
    document.getElementById('player-deck-breakdown').textContent =
      'Your deck: ' + playerTotal + ' cards — ' + state.deck.length + ' to draw, ' + state.hand.length +
      ' in hand, ' + state.discard.length + ' discarded. Every obstacle you disarm joins your deck.';

    renderCoach();
    renderLine();
    renderHand();
    fillArea('play-area-cards', state.playArea, 'play');
    fillArea('equip-area-cards', state.equip, 'equip');

    renderBin();
    renderLog();
    renderRadio();
  }

  function renderBin() {
    const area = document.getElementById('bin');
    if (!area) return;
    const count = document.getElementById('bin-count');
    const cards = document.getElementById('bin-cards');
    const note = document.getElementById('bin-note');
    const removed = state.removed || [];
    if (count) count.textContent = removed.length;
    if (cards) {
      cards.innerHTML = '';
      removed.forEach(function (entry) {
        const defId = typeof entry === 'string' ? defIdFromUid(entry) : entry.defId;
        const def = registry[defId];
        if (!def) return;
        const fig = el('figure', 'card card-bin');
        const img = el('img');
        img.src = def.art[0];
        img.alt = def.name + ' (binned)';
        fig.appendChild(img);
        fig.appendChild(el('figcaption', null, def.name));
        cards.appendChild(fig);
      });
    }
    if (state.bin && state.bin.source === 'discard') {
      if (cards) {
        state.discard.forEach(function (card) {
          const def = registry[card.defId];
          if (!def) return;
          const fig = el('figure', 'card card-bin card-bin-pick');
          const img = el('img');
          img.src = def.art[0];
          img.alt = def.name + ' in the discard';
          fig.appendChild(img);
          fig.appendChild(el('figcaption', null, def.name));
          fig.appendChild(el('span', 'card-effect', effectSummary(def)));
          const pick = el('button', 'bin-btn');
          pick.type = 'button';
          pick.textContent = 'Bin';
          pick.addEventListener('click', function () {
            apply(Engine.binCard(state, registry, card.uid), def.name + ' binned', 'bin', true);
          });
          fig.appendChild(pick);
          cards.appendChild(fig);
        });
      }
    }
    if (note) {
      if (state.bin) {
        note.textContent = state.bin.remaining < 0
          ? 'Bin open — click Bin on any card in your hand to remove it from the game'
          : 'Bin open — ' + state.bin.remaining + ' more card' + (state.bin.remaining === 1 ? '' : 's') + ' you can purge from your ' + state.bin.source;
      } else {
        note.textContent = 'Cards in the Bin are out of the game for good. Waste Room and Flammable Barrel open it.';
      }
    }
    area.classList.toggle('open', !!state.bin);
  }

  const CHALLENGE = {
    2: 'Guards and radios. The belt rearranges itself.',
    3: 'Doors and rooms. Bigger hand, bigger alarm clock.',
    4: 'Heavy weapons. Interactions cost more, and the Watchtower makes its neighbours dearer.',
    5: 'Everything they have is on the belt. Knock it out and get out.'
  };

  function renderLog() {
    const log = document.getElementById('log');
    log.innerHTML = '';
    const entries = state.log.slice(-60).reverse().map(function (entry) {
      if (typeof entry === 'string') return { turn: state.turn, kind: 'system', text: entry };
      return entry;
    });

    /* Strictly newest first: `entries` is already reversed, so the groups come
       out newest turn first and must not be reversed again. */
    const groups = [];
    entries.forEach(function (entry) {
      const last = groups[groups.length - 1];
      if (last && last.turn === entry.turn) last.items.push(entry);
      else groups.push({ turn: entry.turn, items: [entry] });
    });
    groups.forEach(function (group) {
      log.appendChild(el('div', 'log-turn', 'Turn ' + group.turn));
      group.items.forEach(function (entry) {
        const li = el('li', 'log-entry log-' + (entry.kind || 'system'));
        li.appendChild(el('span', 'log-stamp', 'T' + entry.turn));
        li.appendChild(el('span', 'log-text', entry.text));
        log.appendChild(li);
      });
    });
  }

  /* ---------- homebase radio ---------- */
  const radio = { link: false, plain: false, fullPlan: false, transmission: null, advice: null, stamp: '', transmitting: false, idle: 'Homebase is on the frequency. Press call when you need it.', timer: null };

  function positionStamp() {
    return [state.turn, state.alarm, state.missionIndex, state.interactionsLeft,
      state.line.map(function (c) { return c ? c.uid : '-'; }).join(','),
      state.hand.map(function (c) { return c.uid; }).join(','),
      state.resources.stealth, state.resources.fighting].join('|');
  }

  function isFresh() {
    return !!radio.transmission && radio.stamp === positionStamp();
  }

  function renderRadio() {
    const set = document.getElementById('radio');
    if (!set) return;
    set.classList.toggle('is-live', radio.link);
    set.classList.toggle('is-stale', radio.link && !!radio.transmission && !isFresh());
    const call = document.getElementById('call-homebase');
    if (call) {
      call.disabled = !radio.link || !!state.gameOver;
      call.textContent = isFresh() ? 'Again' : 'Call Homebase';
    }
    const why = document.getElementById('radio-why');
    if (why) why.disabled = !(radio.link && radio.advice && isFresh());
    const bars = document.getElementById('radio-signal');
    if (bars && bars.children) {
      const lit = radio.transmission && isFresh() ? Math.max(1, Math.round((radio.transmission.signal || 0) * 5)) : 0;
      bars.children.forEach(function (bar, i) { bar.className = i < lit ? 'lit' : ''; });
    }
    const body = document.getElementById('radio-readout');
    if (body && !radio.transmission) {
      body.innerHTML = '';
      body.appendChild(el('span', 'radio-line', radio.idle));
    }
  }

  function showTransmission(lines) {
    const body = document.getElementById('radio-readout');
    const set = document.getElementById('radio');
    if (!body) return;
    body.innerHTML = '';
    lines.forEach(function (line, i) {
      const span = el('span', 'radio-line');
      span.textContent = line;
      if (span.style) span.style.animationDelay = (0.2 + i * 0.42).toFixed(2) + 's';
      body.appendChild(span);
    });
    if (set) set.classList.add('is-transmitting');
    radio.transmitting = true;
    if (typeof Sound !== 'undefined') Sound.play('radioCall');
    if (radio.timer) clearTimeout(radio.timer);
    radio.timer = setTimeout(function () {
      if (set) set.classList.remove('is-transmitting');
      radio.transmitting = false;
    }, 600 + lines.length * 420);
  }

  function callHomebase() {
    if (!radio.link || !state || state.gameOver) return;
    if (typeof Advisor === 'undefined' || typeof Radio === 'undefined') return;
    const advice = Advisor.advise(state, registry, missions);
    const transmission = Radio.describe(advice, state, registry, missions, { level: radio.fullPlan ? 'full' : 'nudge' });
    radio.advice = advice;
    radio.transmission = transmission;
    radio.stamp = positionStamp();
    state.log.push({ turn: state.turn, kind: 'homebase', text: 'Homebase consulted — ' + transmission.text.join(' ') });
    renderLine();
    renderHand();
    renderRadio();
    showTransmission(radio.plain ? transmission.plain : transmission.text);
  }

  function toggleRadioLink() {
    radio.link = !radio.link;
    const button = document.getElementById('radio-link');
    if (button) button.setAttribute('aria-checked', radio.link ? 'true' : 'false');
    if (!radio.link) {
      radio.transmission = null;
      radio.advice = null;
      radio.stamp = '';
      radio.idle = 'Link off. Nobody on the frequency.';
      if (typeof Sound !== 'undefined') Sound.play('radioOff');
    } else {
      radio.idle = 'Homebase is on the frequency. Press call when you need it.';
    }
    renderRadio();
  }

  function toggleRadioPlain() {
    radio.plain = !radio.plain;
    const button = document.getElementById('radio-plain');
    if (button) button.setAttribute('aria-checked', radio.plain ? 'true' : 'false');
    if (radio.transmission && isFresh()) {
      showTransmission(radio.plain ? radio.transmission.plain : radio.transmission.text);
    }
  }

  function toggleRadioPlan() {
    radio.fullPlan = !radio.fullPlan;
    const button = document.getElementById('radio-plan');
    if (button) button.setAttribute('aria-checked', radio.fullPlan ? 'true' : 'false');
    if (radio.link) callHomebase();
  }

  /* "Why?" puts the arithmetic on the table: what the belt is about to pay out,
     what the goal still needs, and what the second-best line would have cost. */
  function radioWhy() {
    if (!radio.advice || !isFresh()) return;
    const advice = radio.advice;
    const body = el('div', null);
    body.appendChild(el('p', null, 'Homebase ranked every legal line of play from this position and took the one with the highest score: mission progress minus alarm, looked four turns ahead. The hand plays itself — the decision is the belt.'));
    const belt = advice.best.actions.filter(function (action) { return action.kind === 'interact'; });
    const hand = advice.best.actions.filter(function (action) { return action.kind !== 'interact' && action.kind !== 'endTurn' && action.kind !== 'missionCheck'; });
    const list = el('ul', null);
    belt.forEach(function (action) { list.appendChild(el('li', null, actionText(action))); });
    if (hand.length) list.appendChild(el('li', null, 'Play ' + hand.map(function (a) { return a.name || 'card'; }).join(', ') + ' — the order does not matter, and unspent resources evaporate at the refresh.'));
    body.appendChild(list);
    if (advice.left && advice.left.length) {
      body.appendChild(el('p', null, 'Left face up on the belt: ' + advice.left.map(function (r) { return r.name + ' (' + (r.slot + 1) + ', alarm ' + r.alarm + ')'; }).join(', ') + '. Homebase spent the interaction budget elsewhere.'));
    }
    const exiting = state.line.filter(Boolean).pop();
    const exitAlarm = exiting && registry[exiting.defId] ? (registry[exiting.defId].alarm || 0) : 0;
    body.appendChild(el('p', null, 'Alarm at the end of this line: ' + advice.alarmAfter + ' of 50. The card on the exit right now, ' +
      (exiting && registry[exiting.defId] ? registry[exiting.defId].name : 'nothing') + ', would have paid ' + exitAlarm + ' if it slid out untouched.'));
    if (advice.alternative) {
      body.appendChild(el('p', null, 'The next best line ends at alarm ' + advice.alternative.state.alarm + '. Gap: ' +
        Math.abs(advice.alarmAfter - advice.alternative.state.alarm) + '. Where the two disagree, Homebase says take the lower number.'));
    }
    body.appendChild(el('p', null, 'Homebase never presses a button. It marks the cards it is talking about and leaves the call to you.'));
    openOverlay('Homebase, explained', body, [{ label: 'Close', action: function () { closeOverlay(); } }], null, true);
  }

  function actionText(action) {
    if (action.kind === 'play') return 'Play ' + (action.name || 'card');
    if (action.kind === 'useItem') return 'Use ' + (action.name || 'equipped item');
    if (action.kind === 'bin') return 'Bin ' + (action.name || 'card');
    if (action.kind === 'missionCheck') return 'Mission Check — claim the objective before the refresh';
    if (action.kind === 'endTurn') return 'End the turn';
    if (action.kind === 'interact') {
      const where = ['the exit slot', 'next to the exit', 'the middle of the belt', 'the far end of the belt', 'the left end of the belt'][action.slot] || 'slot ' + (action.slot + 1);
      if (action.choice === 'disarm') return 'Disarm ' + action.name + ' in ' + where + ' (alarm ' + action.alarm + ', cost ' + costText(action.cost) + ')';
      if (action.choice === 'knockOut') return 'Knock out ' + action.name + ' in ' + where + ' — it stays, costs no alarm, and its effect is off';
      if (action.choice === 'knockOutAdjacent') return 'Use ' + action.name + ' to knock out the card beside it';
    }
    return action.kind;
  }

  function costText(cost) {
    if (!cost) return 'one interaction';
    if (cost.stealth) return cost.stealth + ' stealth';
    if (cost.fighting) return cost.fighting + ' fighting';
    if (cost.either) return cost.either + ' of either';
    return 'one interaction';
  }

  /* ---------- overlays ---------- */
  function openOverlay(title, body, choices, imageSrc, zoom) {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.toggle('zoom', !!zoom);
    document.getElementById('modal-title').textContent = title;
    const bodyNode = document.getElementById('modal-body');
    bodyNode.innerHTML = '';
    if (imageSrc) {
      const img = el('img', 'modal-card');
      img.src = imageSrc;
      img.alt = title;
      bodyNode.appendChild(img);
    }
    if (body) {
      bodyNode.appendChild(typeof body === 'string' ? el('p', 'modal-text', body) : body);
    }
    const box = document.getElementById('modal-choices');
    box.innerHTML = '';
    (choices || []).forEach(function (choice) {
      const button = el('button', 'choice-btn' + (choice.className ? ' ' + choice.className : ''));
      button.type = 'button';
      button.textContent = choice.label;
      button.addEventListener('click', choice.action);
      box.appendChild(button);
    });
    document.getElementById('overlay').hidden = false;
    const close = document.getElementById('modal-close');
    if (close && close.focus) close.focus();
  }

  function closeOverlay() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    overlay.classList.remove('zoom');
    overlay.hidden = true;
    helpOpen = false;
  }

  /* Zoom: the Equip Area, the Play Area and the mission card are small on the
     table, so clicking one shows the printed card at reading size underneath
     its rules. */
  function openZoom(def, caption) {
    const body = el('div', 'zoom-detail');
    if (caption) body.appendChild(el('p', 'zoom-caption', caption));
    openOverlay(def.name, body, [], def.art[0], true);
  }

  function areaCaption(def, zone) {
    const reward = def.reward || {};
    const bits = [];
    if (def.isGoal) bits.push('Mission card — ' + (def.goalText || ''));
    if (reward.name) bits.push('Reward: ' + reward.name);
    if (reward.resource && (reward.resource.stealth || reward.resource.fighting)) {
      bits.push('gives ' + [reward.resource.stealth ? reward.resource.stealth + ' Stealth' : '',
        reward.resource.fighting ? reward.resource.fighting + ' Fighting' : ''].filter(Boolean).join(' + ') + ' each turn');
    }
    if (reward.effect) {
      if (reward.effect.type === 'interactionLimit') bits.push('allows ' + reward.effect.value + ' interactions per turn');
      if (reward.effect.type === 'handDrawSize') bits.push('draw ' + reward.effect.value + ' cards each turn');
      if (reward.effect.type === 'discardToInteract') bits.push('pays for one ' + reward.effect.targetType + ' interaction, then it is discarded');
      if (reward.effect.type === 'drawPerEquippedKeep') bits.push('draw 1 card per equipped item (max ' + (reward.effect.max || 3) + ')');
    }
    if (zone === 'equip') bits.push('KEEP items stay equipped until you spend them on purpose.');
    else bits.push('Played cards are folded back into your deck at the end of the turn.');
    return bits.join(' · ');
  }

  function scoreBody(reason) {
    const wrap = el('div', 'score');
    wrap.appendChild(el('p', 'modal-text', reason));
    missions.forEach(function (mission, i) {
      const row = el('div', 'score-row');
      row.appendChild(el('span', 'score-mission', mission.name + ' (' + mission.letter + ')'));
      row.appendChild(el('span', 'score-alarm', state.missionAlarms[i] === undefined ? '—' : String(state.missionAlarms[i])));
      wrap.appendChild(row);
    });
    const finished = state.missionAlarms.reduce(function (a, b) { return a + b; }, 0);
    wrap.appendChild(el('p', 'score-total', 'Alarm at mission ends: ' + finished + ' · turn ' + state.turn + ' · lower is better'));
    return wrap;
  }

  function boardRoot() {
    return document.querySelector ? document.querySelector('.board') : null;
  }

  /* Every card that has a printed identity gets a diegetic cue: the Guard Dog
     barks as it slides into place, the prison door clangs when it exits. */
  function defByUid(uid) {
    const zones = [state.line, state.hand, state.playArea, state.equip,
      state.obstacleDiscard, state.obstacleDeck, state.discard, state.saved, state.removed];
    for (let i = 0; i < zones.length; i++) {
      for (let j = 0; j < zones[i].length; j++) {
        if (zones[i][j] && zones[i][j].uid === uid) return registry[zones[i][j].defId];
      }
    }
    return null;
  }

  function eventSound(event) {
    const uid = event.card || event.exiting || event.by;
    if (!uid) return null;
    const def = defByUid(uid);
    if (!def || !def.sound) return null;
    return def.sound;
  }

  function animateTable(newState, before) {
    if (typeof Table === 'undefined') return;
    const after = Table.snapshot(boardRoot());
    Table.run(Table.plan(newState, before, after, eventSound), {
      sound: function (name) { if (typeof Sound !== 'undefined') Sound.play(name); }
    });
  }

  function apply(newState, message, sound, undoable) {
    const before = typeof Table !== 'undefined' ? Table.snapshot(boardRoot()) : {};
    if (undoable) pushUndo();
    const previousAlarm = state ? state.alarm : 0;
    state = newState;
    if (typeof window !== 'undefined') window.gameState = state;
    const problems = AgentDecker.checkInvariants(state, registry);
    if (problems.length) console.warn('invariant problems:', problems);
    updateUndoButton();

    if (typeof Save !== 'undefined') {
      if (state.gameOver) Save.recordScore(state);
      Save.saveGame(state);
    }
    if (typeof Sound !== 'undefined') {
      if (sound) Sound.play(sound);
      if (state.alarm > previousAlarm) Sound.play('alarm', state.alarm);
      if (Sound.setTension) Sound.setTension(state.alarm);
      if (state.gameOver && state.gameOver !== 'campaignComplete') Sound.play('gameOver');
    }

    setSaveNote(state.gameOver ? 'game over — nothing saved' : 'game saved locally');
    closeOverlay();
    render();
    animateTable(state, before);
    if (state.gameOver) {
      const reason = state.gameOver === 'campaignComplete'
        ? 'You made it out of the complex. Final alarm score:'
        : state.gameOver === 'alarm'
          ? 'The alarm hit 50 — the complex locked down.'
          : 'The line could not be refilled even after reshuffling the obstacles discard — you ran out of time.';
      openOverlay(
        state.gameOver === 'campaignComplete' ? 'Mission complete — campaign finished' : 'Game over',
        scoreBody(reason),
        [{ label: 'New game', action: function () { start(); } }]
      );
    }
    return message;
  }

  /* ---------- actions ---------- */
  function playCard(card) {
    const def = defOf(card);
    const choice = Actions.needsChoice(def);
    if (!choice) {
      apply(Actions.play(state, card.uid, registry), def.name + ' played', 'play', true);
      return;
    }

    const pool = choice.kind === 'hand'
      ? state.hand.filter(function (c) { return c.uid !== card.uid; })
      : choice.kind === 'discard' ? state.discard.slice()
      : choice.kind === 'deck' ? state.deck.slice()
      : choice.kind === 'line' ? state.line.filter(Boolean).slice()
      : state.deck.slice(-(choice.n || 5)).reverse();

    if (!pool.length) {
      apply(Actions.play(state, card.uid, registry), def.name + ' played (nothing to choose)', 'play', true);
      return;
    }

    if (choice.kind === 'choice') {
      const picks = [];
      const res = def.reward.resource;
      if (res && (res.stealth || res.fighting)) {
        picks.push({
          label: 'Take ' + [res.stealth ? res.stealth + ' Stealth' : '', res.fighting ? res.fighting + ' Fighting' : ''].filter(Boolean).join(' + '),
          action: function () { apply(Actions.play(state, card.uid, registry, { choice: 'resource' }), def.name + ' played', 'play', true); }
        });
      }
      if (def.reward.effect && def.reward.effect.type === 'draw') {
        picks.push({
          label: 'Draw ' + def.reward.effect.n + ' card' + (def.reward.effect.n === 1 ? '' : 's'),
          action: function () { apply(Actions.play(state, card.uid, registry, { choice: 'draw' }), def.name + ' played', 'play', true); }
        });
      }
      openOverlay(def.name, choice.label, picks, def.art[0]);
      return;
    }

    if (choice.kind === 'order' || choice.kind === 'keep') {
      const order = [];
      let keep = null;
      function redrawOrder() {
        const options = pool.map(function (c) {
          const at = order.indexOf(c.uid);
          const tag = choice.kind === 'keep'
            ? (keep === c.uid ? ' — kept' : '')
            : (at >= 0 ? ' — position ' + (at + 1) : '');
          return {
            label: (keep === c.uid ? '✓ ' : '') + defOf(c).name + tag,
            action: function () {
              if (choice.kind === 'keep') {
                if (keep === c.uid) keep = null;
                else keep = c.uid;
              } else if (at >= 0) order.splice(at, 1);
              else order.push(c.uid);
              redrawOrder();
            }
          };
        });
        options.push({
          label: choice.kind === 'keep'
            ? (keep ? 'Keep it and put the rest back' : 'Choose one to keep')
            : (order.length === pool.length ? 'Put them back in this order' : 'Cancel'),
          action: function () {
            if (choice.kind === 'keep') {
              if (!keep) { apply(Actions.play(state, card.uid, registry), def.name + ' played (nothing kept)', 'play', true); return; }
              const rest = pool.filter(function (c) { return c.uid !== keep; });
              const back = order.filter(function (u) { return u !== keep; });
              if (back.length !== rest.length) {
                rest.forEach(function (c) { if (back.indexOf(c.uid) < 0) back.push(c.uid); });
              }
              apply(Actions.play(state, card.uid, registry, { keep: keep, order: back }), def.name + ' played', 'play', true);
            } else {
              apply(Actions.play(state, card.uid, registry, order.length === pool.length ? { order: order } : {}), def.name + ' played', 'play', true);
            }
          }
        });
        openOverlay(def.name, choice.label, options);
      }
      redrawOrder();
      return;
    }

    if (choice.single) {
      const options = pool.map(function (c) {
        return { label: defOf(c).name, action: function () { apply(Actions.play(state, card.uid, registry, { uid: c.uid }), def.name + ' played', 'play', true); } };
      });
      options.push({ label: 'Cancel', action: function () { apply(Actions.play(state, card.uid, registry), def.name + ' played', 'play', true); } });
      openOverlay(def.name, choice.label, options);
      return;
    }

    const picked = [];

    function redraw() {
      const options = pool.map(function (c) {
        return {
          label: defOf(c).name + (picked.indexOf(c.uid) >= 0 ? ' ✓' : ''),
          action: function () { toggle(c.uid); }
        };
      });
      options.push({
        label: 'Done',
        action: function () { apply(Actions.play(state, card.uid, registry, { cards: picked }), def.name + ' played', 'play', true); }
      });
      openOverlay(def.name, choice.label, options);
    }

    function toggle(uid) {
      const at = picked.indexOf(uid);
      if (at >= 0) picked.splice(at, 1);
      else picked.push(uid);
      redraw();
    }

    redraw();
  }

  /* What a card is worth, in the words a player needs when deciding what to
     throw away or how to pay. */
  function effectSummary(def) {
    const bits = [];
    const reward = def.reward;
    if (reward) {
      if (reward.resource && (reward.resource.stealth || reward.resource.fighting)) {
        const r = [];
        if (reward.resource.stealth) r.push(reward.resource.stealth + ' Stealth');
        if (reward.resource.fighting) r.push(reward.resource.fighting + ' Fighting');
        bits.push(r.join(' + ') + (reward.oncePerTurn ? ' each turn' : ''));
      }
      const e = reward.effect;
      if (e) {
        if (e.type === 'draw') bits.push('draw ' + e.n + ' card' + (e.n === 1 ? '' : 's'));
        if (e.alternative) bits.push('or draw ' + e.n);
        if (e.type === 'removeFromGame') {
          bits.push(e.max === null ? 'Bin: purge any number of cards from your ' + e.source
            : 'Bin: purge up to ' + e.max + ' cards from your ' + e.source);
        }
        if (e.type === 'discardToInteract') bits.push('pays for one ' + e.targetType + ' interaction');
        if (e.type === 'drawPerEquippedKeep') bits.push('draw 1 per equipped item (max ' + (e.max || 3) + ')');
        if (e.type === 'fightingPerDiscardPair') bits.push('+' + e.amount + ' Fighting per ' + e.per + ' cards in your discard');
        if (e.type === 'stealthPerCardToPlayArea') bits.push('+' + e.amount + ' Stealth per card sent to the Play Area');
      }
      if (reward.keep || def.keep) bits.push('KEEP — stays equipped');
    }
    if (def.effect && def.effect.type === 'interactionLimit') bits.push('+' + def.effect.value + ' interactions per turn');
    if (!bits.length && def.topText) bits.push(def.topText);
    if (!bits.length) bits.push('no effect once played');
    return bits.join(' · ');
  }

  function payLabel(parts) {
    parts = parts || {};
    const bits = [];
    if (parts.stealth) bits.push(parts.stealth + ' Stealth');
    if (parts.fighting) bits.push(parts.fighting + ' Fighting');
    if (parts.flexible) bits.push(parts.flexible + ' in any mix');
    return bits.join(' + ') || 'nothing';
  }

  function sourceLabel(src) {
    const bits = [];
    if (src.stealth) bits.push(src.stealth + ' Stealth');
    if (src.fighting) bits.push(src.fighting + ' Fighting');
    return bits.join(' + ') + ' — ' + src.name;
  }

  /* Where the money comes from: printed cost, what the agent actually holds this
     turn and which card produced it, and any equipped item that can pay instead. */
  function paymentBody(def, card, check) {
    const body = el('div', 'payment');
    body.appendChild(el('p', 'payment-cost', 'Cost to interact: ' + payLabel(check.parts)));
    const sources = (state.sources || []).filter(function (src) { return src.stealth || src.fighting; });
    if (sources.length) {
      body.appendChild(el('p', 'payment-sources', 'Available this turn: ' + sources.map(sourceLabel).join(' · ')));
    } else {
      body.appendChild(el('p', 'payment-sources', 'Available this turn: nothing yet. Play cards to generate Stealth or Fighting.'));
    }
    if (check.canPayResources) {
      body.appendChild(el('p', 'payment-ok', 'You can pay it from your resources.'));
    }
    if (check.items && check.items.length) {
      body.appendChild(el('p', 'payment-items', check.items.map(function (item) {
        return itemName(defOf(item)) + ' (equipped) can pay for this ' + def.obstacleType + ' instead.';
      }).join(' ')));
    }
    if (!check.canPayResources && !(check.items && check.items.length)) {
      body.appendChild(el('p', 'payment-short', 'Not enough resources and no item that fits this ' + def.obstacleType + '.'));
    }
    return body;
  }

  function describe(def, card) {
    const parts = [];
    if (!def.isGoal && def.set !== 'starting' && def.set !== 'alarm') {
      parts.push(def.obstacleType + ' · cost ' + costLabel(card) + ' · alarm ' + def.alarm);
    }
    if (def.topText) parts.push(def.topText);
    if (def.bottomText) parts.push(def.bottomText);
    return parts.join('\n');
  }

  function openCard(card, zone) {
    const def = defOf(card);
    if (zone === 'hand') {
      openOverlay(def.name, describe(def, card), [{ label: 'Play this card', action: function () { playCard(card); } }], def.art[0]);
      return;
    }
    const check = Engine.canInteract(state, registry, card);
    const body = el('div', 'card-detail');
    body.appendChild(el('p', null, describe(def, card)));
    body.appendChild(paymentBody(def, card, check));
    const choices = [];
    if (check.ok && allowed('interact')) {
      if (check.canPayResources) {
        const pay = 'pay ' + payLabel(check.parts);
        choices.push({ label: 'Disarm — ' + pay + ' (to ' + (def.keep ? 'Equip Area' : 'Play Area') + ')', action: function () { apply(Actions.interact(state, card.uid, 'disarm', registry), def.name + ' disarmed', 'disarm', true); } });
        choices.push({ label: 'Knock Out — ' + pay + ' (face down, no alarm)', action: function () { apply(Actions.interact(state, card.uid, 'knockOut', registry), def.name + ' knocked out', 'knockOut', true); } });
      }
      (check.items || []).forEach(function (item) {
        const label = itemName(defOf(item));
        choices.push({ label: 'Use ' + label + ' → Disarm (the item is discarded)', action: function () { apply(Actions.interact(state, card.uid, 'disarm', registry, { itemUid: item.uid }), label + ' used on ' + def.name, 'disarm', true); } });
        choices.push({ label: 'Use ' + label + ' → Knock Out (the item is discarded)', action: function () { apply(Actions.interact(state, card.uid, 'knockOut', registry, { itemUid: item.uid }), label + ' used on ' + def.name, 'knockOut', true); } });
      });
      if (def.effect && def.effect.type === 'knockOutAdjacentInsteadOfInteract') {
        Actions.neighbours(state, registry, card.uid).forEach(function (n) {
          choices.push({ label: 'Pay ' + payLabel(check.parts) + ' to knock out adjacent ' + defOf(n).name + ' instead', action: function () { apply(Actions.interact(state, card.uid, 'knockOutAdjacent', registry, { uid: n.uid }), 'knocked out ' + defOf(n).name, 'knockOut', true); } });
        });
      }
    }
    openOverlay(def.name + (check.ok ? '' : ' — ' + check.reason), body, choices, def.art[0]);
  }

  function missionCheck() {
    if (!Actions.missionCheck(state, registry, missions)) {
      openOverlay('Mission Check', 'Not yet — the whole goal has to be paid in one turn.', []);
      return;
    }
    const completed = missions[state.missionIndex];
    const next = missions[state.missionIndex + 1] || null;
    undoStack = [];
    apply(Actions.completeMission(state, registry, missions), 'Mission complete', 'fanfare');
    if (!state.gameOver) missionFanfare(completed, next);
  }

  function missionFanfare(completed, next) {
    const body = el('div', 'fanfare');
    const reward = registry[completed.goalCardId] && registry[completed.goalCardId].reward;
    body.appendChild(el('p', 'fanfare-head', 'Mission closed.'));
    body.appendChild(el('p', null, completed.name + ' is done. Alarm: ' +
      state.missionAlarms[state.missionAlarms.length - 1] + '.'));
    if (reward) {
      const bonus = reward.resource
        ? ((reward.resource.stealth || 0) + (reward.resource.fighting || 0)) + ' resource' +
          ((reward.resource.stealth || 0) && (reward.resource.fighting || 0) ? 's' : '') + ' every turn'
        : null;
      body.appendChild(el('p', null, 'Reward: ' + reward.name + (bonus ? ' (' + bonus + ')' : '') + '. It stays in the Equip Area until you spend it.'));
    }
    if (next) {
      const newObstacles = (next.obstaclesIntroduced || []).map(function (id) {
        const d = registry[id];
        return d ? d.name + ' (alarm ' + d.alarm + ')' : id;
      });
      body.appendChild(el('p', 'fanfare-next', next.name + ' — ' + (registry[next.goalCardId] ? registry[next.goalCardId].goalText : '')));
      if (newObstacles.length) body.appendChild(el('p', null, 'They send in: ' + newObstacles.join(', ') + '.'));
      body.appendChild(el('p', null, CHALLENGE[next.index] || 'More obstacles on the belt.'));
    }
    openOverlay(completed.name + ' complete', body, [{ label: 'Continue', action: function () { closeOverlay(); } }], registry[completed.goalCardId].art[0]);

    if (radio.link && typeof Radio !== 'undefined') {
      const alarm = state.missionAlarms[state.missionAlarms.length - 1] || 0;
      const lines = [Radio.missionEnd(completed, alarm)];
      if (next) lines.push(Radio.missionBrief(next));
      lines.push('Over.');
      radio.transmission = null;
      radio.stamp = '';
      showTransmission(lines);
    }
  }

  function endTurn() {
    undoStack = [];  /* the turn is spent: yesterday's moves are no longer rewritable */
    apply(Actions.endTurn(state, registry), 'Turn over');
  }

  function startTraining() {
    undoStack = [];
    state = AgentDecker.createInitialState(Object.keys(registry).map(function (id) { return registry[id]; }), missions, TRAINING_SEED);
    state.tutorial = true;
    if (typeof window !== 'undefined') window.gameState = state;
    if (typeof Save !== 'undefined') Save.clearGame();
    render();
    setSaveNote('training run');
  }

  function exitTraining() {
    if (!state) return;
    state.tutorial = false;
    render();
    setSaveNote('training off — the real campaign');
  }

  function start(seed) {
    undoStack = [];
    radio.link = false;
    radio.plain = false;
    radio.fullPlan = false;
    radio.transmission = null;
    radio.advice = null;
    radio.stamp = '';
    radio.transmitting = false;
    if (radio.timer) clearTimeout(radio.timer);
    const fromUrl = typeof window !== 'undefined' && window.location
      ? Number(new URLSearchParams(window.location.search).get('seed'))
      : 0;
    const usedSeed = seed || fromUrl || (Date.now() % 1000000);
    state = AgentDecker.createInitialState(Object.keys(registry).map(function (id) { return registry[id]; }), missions, usedSeed);
    if (typeof window !== 'undefined') window.gameState = state;
    if (typeof Save !== 'undefined') Save.clearGame();
    render();
    animateTable(state, {});
    setSaveNote('new game');
  }

  function restoreTableSpeed() {
    try {
      if (typeof Table !== 'undefined' && typeof localStorage !== 'undefined' &&
          localStorage.getItem('agent-decker.fast-table') === '1') {
        Table.setFast(true);
        setSwitch('fast-table', true);
      }
    } catch (err) { /* storage unavailable */ }
  }

  function init(cardDefs, missionList, seed) {
    registry = AgentDecker.buildRegistry(cardDefs);
    restoreTableSpeed();
    missions = missionList;
    const saved = typeof Save !== 'undefined' ? Save.loadGame() : null;
    if (!seed && saved && saved.state) {
      state = saved.state;
      if (typeof window !== 'undefined') window.gameState = state;
      render();
      setSaveNote('resumed a saved game');
    } else {
      start(seed);
    }
  }

  function setSaveNote(text) {
    const note = document.getElementById('save-status');
    if (note) note.textContent = text;
  }

  function about() {
    const best = (typeof Save !== 'undefined' ? Save.scores() : []).slice(0, 5);
    const wrap = el('div', 'about');
    wrap.appendChild(el('p', 'modal-text', 'Agent Decker by Manuel Correia — gamesbymanuel.com — licensed CC BY-NC 4.0. This is an unofficial browser implementation; it is not for sale.'));
    wrap.appendChild(el('p', 'modal-text', 'Goal: finish all five missions before the alarm hits 50. Your score is the alarm level at the end of each mission, added up — lower is better.'));
    wrap.appendChild(el('p', 'modal-text', 'House rule (off by default): Quick Hands — equipping an item grants one extra interaction that turn. It is not in the printed rules; toggle it in the top bar if you like a faster early game.'));
    if (best.length) {
      wrap.appendChild(el('p', 'score-total', 'Best runs on this device'));
      best.forEach(function (entry) {
        const row = el('div', 'score-row');
        row.appendChild(el('span', 'score-mission', 'seed ' + entry.seed + ' · ' + entry.turns + ' turns · ' + entry.missions.join(' + ')));
        row.appendChild(el('span', 'score-alarm', String(entry.total)));
        wrap.appendChild(row);
      });
    }
    openOverlay('About Agent Decker', wrap, []);
  }

  function toggleSound() {
    if (typeof Sound === 'undefined') return;
    setSwitch('sound-toggle', Sound.toggle());
  }

  /* How to play is seven short screens rather than one wall of text: the player
     reads one idea at a time, and the turn flowchart gets its own screen so it
     can be sized to the window instead of dominating it. */
  const HELP = [
    {
      short: 'Goal',
      title: 'Five things to know',
      lede: 'Five missions. These are the five rules that matter.',
      points: [
        { label: 'The objective', text: 'Each mission prints a goal, such as 6 Stealth, or 6 Fighting plus a Guard Uniform equipped. You must pay the whole goal in one turn.' },
        { label: 'The alarm', text: 'Two tokens count 0 to 50. Every card that leaves the line adds its printed number. At 50 the complex locks down and the run is over.' },
        { label: 'The line', text: 'Six obstacle cards sit on a conveyor. The card at the right end exits at the end of your turn and raises the alarm.' },
        { label: 'Resources', text: 'Stealth and Fighting are good for this turn only. Anything unspent evaporates when the turn ends.' },
        { label: 'Your score', text: 'The alarm level at the end of each mission, added up. Lower is better.' }
      ]
    },
    {
      short: 'Turn',
      title: 'Your turn in four steps',
      lede: 'Every turn is the same four steps, in this order.',
      points: [
        { label: '1. Use cards', text: 'Play as many cards from your hand as you like to generate Stealth or Fighting. Then make one interaction: Disarm or Knock Out one obstacle.' },
        { label: '2. Mission Check', text: 'If you can pay the entire goal this turn, the mission is complete. Otherwise it carries on to the next turn.' },
        { label: '3. Line Scroll', text: 'The rightmost card in the line exits to the obstacles discard and raises the alarm by its number. Every other card slides one slot to the right.' },
        { label: '4. Card Refresh', text: 'Discard your hand and Play Area, then draw a fresh hand of four (five after Mission Three). New obstacles enter at the left end of the line.' }
      ]
    },
    {
      short: 'Obstacles',
      title: 'Disarm or Knock Out',
      lede: 'One interaction per turn. Choose which obstacle you deal with.',
      points: [
        { label: 'Disarm', text: 'Pay the printed cost with Stealth, Fighting, or any mix of both. The card leaves the line, joins your deck, and gives its top-half reward when you play it later.' },
        { label: 'Knock Out', text: 'Free. The card turns face down in the line: it raises no alarm when it exits, and its type and effect are ignored while it lies there.' },
        { label: 'Types', text: 'Obstacles are doors, people or equipment. Keycard pays for a door, Chloroform for a person, E.M.P. for equipment — an equipped item can pay instead of your resources.' },
        { label: 'Watch out', text: 'Watchtower adds 2 to the cost of the cards next to it, Hawk blocks interactions that need Stealth only, and Sniper can only be interacted with if it is the only person in the line.' },
        { label: 'More interactions', text: 'Mission rewards can raise your limit to two or three interactions per turn.' }
      ]
    },
    {
      short: 'The line',
      title: 'The line is a conveyor',
      lede: 'Six slots, not a queue. Getting this right is the whole skill of the game.',
      points: [
        { label: 'Holes stay open', text: 'Disarming a card leaves an empty slot. The cards to its left slide right into the hole at the next Line Scroll.' },
        { label: 'Adjacency is by slot', text: 'Effects that talk about "adjacent" cards use the slots, so a hole breaks the link.' },
        { label: 'Special movers', text: 'Patrolling Guard slides two slots per scroll. Guard Dog slides right until it is next to the first person on its right. Radio Tower pulls every person toward itself.' },
        { label: 'Dormitory jams it', text: 'While Dormitory is face up, face-down cards do not slide. If one is sitting at the exit, nothing leaves the line that turn and no alarm is raised.' }
      ]
    },
    {
      short: 'Gear',
      title: 'Gear, the Bin and Undo',
      lede: 'What the small objects on the table do.',
      points: [
        { label: 'KEEP items', text: 'A card with a KEEP icon goes to the Equip Area and stays there. Its once-per-turn bonus fires the moment it is equipped. Spending an item for its effect sends it to the discard; draw it again and you can equip it once more.' },
        { label: 'The Bin', text: 'Waste Room purges any number of cards from your hand, Flammable Barrel up to two from your discard. Binned cards are out of the game for good.' },
        { label: 'Undo', text: 'Undo in the top bar (or Ctrl+Z) rewinds any move you made this turn. It cannot rewind a finished turn.' },
        { label: 'Training run', text: 'The coach only gates the first mission. Exit training at any time to play the real campaign from the same board.' }
      ]
    },
    {
      short: 'Radio',
      title: 'Homebase radio',
      lede: 'An optional advisor in a field set under the draw deck.',
      points: [
        { label: 'Link', text: 'Flip the Link switch and the set is live. Press Call Homebase, or the C key, and the Colonel reads the position and sends back a line of play.' },
        { label: 'He never plays for you', text: 'Homebase chalk-outlines the cards it is talking about. Every button is still yours to press.' },
        { label: 'Plain and Full plan', text: 'Plain swaps the radio slang for the printed terms. Full plan spells out the whole turn instead of the one move that matters.' },
        { label: 'Why?', text: 'Opens the ranked options, the alarm each one ends at, and the second-best line. Advice goes stale the moment the board changes, so call again after any move.' },
        { label: 'It is a crutch, on purpose', text: 'The Colonel is a heuristic, not a solved game. He is good at keeping the alarm down and closing missions; he is not a guarantee.' }
      ]
    },
    {
      short: 'Flowchart',
      title: 'The turn flowchart',
      lede: 'The whole turn on one page, if you prefer a picture.',
      points: []
    }
  ];

  let helpIndex = 0;
  let helpOpen = false;

  function showHelp(index) {
    helpIndex = Math.max(0, Math.min(HELP.length - 1, index));
    const section = HELP[helpIndex];
    const body = el('div', 'help');

    const tabs = el('div', 'help-tabs');
    HELP.forEach(function (item, i) {
      const tab = el('button', 'help-tab' + (i === helpIndex ? ' is-active' : ''), (i + 1) + ' · ' + item.short);
      tab.type = 'button';
      tab.setAttribute('aria-selected', i === helpIndex ? 'true' : 'false');
      tab.addEventListener('click', function () { showHelp(i); });
      tabs.appendChild(tab);
    });
    body.appendChild(tabs);

    if (section.lede) body.appendChild(el('p', 'help-lede', section.lede));
    if (section.points.length) {
      const steps = el('ul', 'help-steps');
      section.points.forEach(function (point) {
        const li = el('li');
        if (point.label) li.appendChild(el('b', 'help-label', point.label));
        li.appendChild(el('span', 'help-text', ' ' + point.text));
        steps.appendChild(li);
      });
      body.appendChild(steps);
    }
    if (helpIndex === HELP.length - 1) {
      const figure = el('figure', 'help-flowchart');
      const img = el('img');
      img.src = 'docs/AgentDecker_turn_flowchart.svg';
      img.alt = 'Turn flowchart: 1 Use cards, 2 Mission check, 3 Line scroll, 4 Card refresh';
      figure.appendChild(img);
      figure.appendChild(el('figcaption', null, 'The turn, in order. Keep it open beside the board.'));
      body.appendChild(figure);
      const link = el('a', 'help-link', 'Open the flowchart full size');
      link.href = 'docs/AgentDecker_turn_flowchart.svg';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      body.appendChild(link);
    }
    body.appendChild(el('p', 'help-note', 'Screen ' + (helpIndex + 1) + ' of ' + HELP.length + ' · Agent Decker by Manuel Correia (gamesbymanuel.com), CC BY-NC 4.0. Unofficial and free.'));

    const nav = [];
    if (helpIndex > 0) nav.push({ label: '← Previous', className: 'help-prev', action: function () { showHelp(helpIndex - 1); } });
    if (helpIndex < HELP.length - 1) nav.push({ label: 'Next →', className: 'help-next', action: function () { showHelp(helpIndex + 1); } });

    helpOpen = true;
    openOverlay(section.title, body, nav);
  }

  function howToPlay() {
    showHelp(0);
  }

  /* The coach's "Why?" answers the question the player actually has right now:
     it opens the screen that explains the step the coach is asking for. */
  function coachHelp() {
    const p = plan();
    if (!p) { showHelp(0); return; }
    if (p.id === 'play' || p.id === 'missionCheck') showHelp(1);
    else if (p.id === 'disarm' || p.id === 'knockOut' || p.id === 'interact') showHelp(2);
    else if (p.id === 'endTurn') showHelp(3);
    else showHelp(0);
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeOverlay();
    if (helpOpen && !document.getElementById('overlay').hidden &&
        (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      showHelp(helpIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
    if (event.key.toLowerCase() === 'c' && !helpOpen && radio.link && !radio.transmitting &&
        !(event.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName))) {
      callHomebase();
    }
  });

  /* Hardware, not menus: each toggle is a drawn switch whose lever is the
     state. There is nothing to open, so nothing can be left hanging over the
     table. */
  function setSwitch(id, on) {
    const button = document.getElementById(id);
    if (button) button.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  /* The mission card in the side panel is clickable: click it to read the goal
     in full at card size. */
  const goalFace = document.getElementById('goal-card-face');
  if (goalFace) goalFace.addEventListener('click', function () {
    if (!state || !missions.length) return;
    const mission = missions[state.missionIndex];
    const def = registry[mission.goalCardId];
    openZoom(def, mission.name + ' — ' + def.goalText + '. The whole goal has to be paid in one turn.');
  });

  document.getElementById('mission-check').addEventListener('click', missionCheck);
  document.getElementById('end-turn').addEventListener('click', endTurn);
  document.getElementById('modal-close').addEventListener('click', closeOverlay);
  document.getElementById('new-game').addEventListener('click', function () { start(); });
  if (document.getElementById('undo')) document.getElementById('undo').addEventListener('click', undo);
  if (document.getElementById('coach-exit')) document.getElementById('coach-exit').addEventListener('click', exitTraining);
  if (document.getElementById('coach-how')) document.getElementById('coach-how').addEventListener('click', coachHelp);

  if (document.getElementById('training-run')) document.getElementById('training-run').addEventListener('click', startTraining);
  if (document.getElementById('how-to-play')) document.getElementById('how-to-play').addEventListener('click', howToPlay);
  if (document.getElementById('about')) document.getElementById('about').addEventListener('click', about);
  if (document.getElementById('sound-toggle')) document.getElementById('sound-toggle').addEventListener('click', toggleSound);
  if (document.getElementById('music-toggle')) document.getElementById('music-toggle').addEventListener('click', toggleMusic);
  if (document.getElementById('fast-table')) document.getElementById('fast-table').addEventListener('click', toggleFastTable);
  if (document.getElementById('quick-hands')) document.getElementById('quick-hands').addEventListener('click', toggleQuickHands);
  if (document.getElementById('radio-link')) document.getElementById('radio-link').addEventListener('click', toggleRadioLink);
  if (document.getElementById('radio-plain')) document.getElementById('radio-plain').addEventListener('click', toggleRadioPlain);
  if (document.getElementById('radio-plan')) document.getElementById('radio-plan').addEventListener('click', toggleRadioPlan);
  if (document.getElementById('radio-why')) document.getElementById('radio-why').addEventListener('click', radioWhy);
  if (document.getElementById('call-homebase')) document.getElementById('call-homebase').addEventListener('click', callHomebase);
  if (document.getElementById('music-track')) {
    const select = document.getElementById('music-track');
    let saved = null;
    try { saved = localStorage.getItem('agent-decker.music-track'); } catch (err) { /* no storage */ }
    if (saved && Sound.tracks().some(function (t) { return t.id === saved; })) select.value = saved;
    select.addEventListener('change', function () {
      Sound.setTrack(select.value);
      try { localStorage.setItem('agent-decker.music-track', select.value); } catch (err) { /* no storage */ }
    });
  }
  if (document.getElementById('replay-seed')) document.getElementById('replay-seed').addEventListener('click', function () { start(state.seed); });

  function toggleQuickHands() {
    if (!state) return;
    state.rules.quickHands = !state.rules.quickHands;
    setSwitch('quick-hands', state.rules.quickHands);
    render();
  }

  function toggleFastTable() {
    const on = !Table.isFast();
    Table.setFast(on);
    setSwitch('fast-table', on);
    try { localStorage.setItem('agent-decker.fast-table', on ? '1' : '0'); } catch (err) { /* no storage */ }
  }

  function toggleMusic() {
    if (typeof Sound === 'undefined') return;
    const on = Sound.toggleMusic();
    setSwitch('music-toggle', on);
    if (state && Sound.setTension) Sound.setTension(state.alarm);
    setSwitch('sound-toggle', !Sound.isMuted());
  }



  return {
    init: init,
    getState: function () { return state; },
    setState: function (s) { return apply(s, 'state restored'); },
    undo: undo,
    canUndo: function () { return undoStack.length > 0; },
    start: start,
    startTraining: startTraining,
    howToPlay: howToPlay,
    showHelp: showHelp,
    toggleQuickHands: toggleQuickHands,
    exitTraining: exitTraining,
    endTurn: endTurn,
    missionCheck: missionCheck
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UI;
