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
    face.addEventListener('click', function () { openCard(card, zone || 'area'); });
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
      box.appendChild(el('p', 'empty', 'empty'));
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
      const fig = el('figure', 'card');
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
    document.querySelector('#mission-banner .mission-name').textContent = mission.name + ' (' + mission.letter + ')';
    document.querySelector('#mission-banner .mission-goal').textContent = 'Goal: ' + registry[mission.goalCardId].goalText;

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
    alarmValue.classList.toggle('hot', state.alarm >= 40);
    const fill = document.getElementById('alarm-fill');
    if (fill) fill.style.width = Math.min(100, (state.alarm / 50) * 100) + '%';
    const dot = document.getElementById('signal-dot');
    if (dot) dot.className = 'signal-dot dot-' + level;
    const danger = document.getElementById('alarm-danger');
    if (danger) danger.hidden = state.alarm < 40;
    const check = document.getElementById('mission-check');
    if (check) {
      check.disabled = !allowed('missionCheck');
      check.classList.toggle('glow', !check.disabled && Actions.missionCheck(state, registry, missions));
    }
    const end = document.getElementById('end-turn');
    if (end) {
      const outOfMoves = state.hand.length === 0 && state.interactionsLeft === 0 && !state.gameOver;
      end.disabled = !allowed('endTurn');
      end.classList.toggle('glow', !end.disabled && outOfMoves);
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
    2: 'Guards and radios everywhere — expect harder obstacles and a line that rearranges itself.',
    3: 'Doors and rooms: the complex is closing off sections. Your hand grows, but so does the alarm clock.',
    4: 'Heavy weaponry. Interacting costs more and the watchtower makes its neighbours dearer.',
    5: 'Everything they have is on the line now. Knock it all out and get out.'
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

  /* ---------- overlays ---------- */
  function openOverlay(title, body, choices, imageSrc) {
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
      const button = el('button', 'choice-btn');
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
    document.getElementById('overlay').hidden = true;
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
    body.appendChild(el('p', 'fanfare-head', 'Mission complete. The complex never saw it coming.'));
    body.appendChild(el('p', null, 'Nice work, Agent — ' + completed.name + ' is done with the alarm at ' +
      state.missionAlarms[state.missionAlarms.length - 1] + '.'));
    if (reward) {
      const bonus = reward.resource
        ? ((reward.resource.stealth || 0) + (reward.resource.fighting || 0)) + ' resource' +
          ((reward.resource.stealth || 0) && (reward.resource.fighting || 0) ? 's' : '') + ' every turn'
        : null;
      body.appendChild(el('p', null, 'Reward: ' + reward.name + (bonus ? ' (' + bonus + ')' : '') + ' — it goes to your Equip Area, where it stays until you use it.'));
    }
    if (next) {
      const newObstacles = (next.obstaclesIntroduced || []).map(function (id) {
        const d = registry[id];
        return d ? d.name + ' (alarm ' + d.alarm + ')' : id;
      });
      body.appendChild(el('p', 'fanfare-next', next.name + ' — ' + (registry[next.goalCardId] ? registry[next.goalCardId].goalText : '')));
      if (newObstacles.length) body.appendChild(el('p', null, 'They send in: ' + newObstacles.join(', ') + '.'));
      body.appendChild(el('p', null, CHALLENGE[next.index] || 'The complex is on alert.'));
    }
    openOverlay(completed.name + ' complete', body, [{ label: 'Continue', action: function () { closeOverlay(); } }], registry[completed.goalCardId].art[0]);
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
    setSaveNote('training run · seed ' + TRAINING_SEED);
  }

  function exitTraining() {
    if (!state) return;
    state.tutorial = false;
    render();
    setSaveNote('training off — playing the real campaign');
  }

  function start(seed) {
    undoStack = [];
    const fromUrl = typeof window !== 'undefined' && window.location
      ? Number(new URLSearchParams(window.location.search).get('seed'))
      : 0;
    const usedSeed = seed || fromUrl || (Date.now() % 1000000);
    state = AgentDecker.createInitialState(Object.keys(registry).map(function (id) { return registry[id]; }), missions, usedSeed);
    if (typeof window !== 'undefined') window.gameState = state;
    if (typeof Save !== 'undefined') Save.clearGame();
    render();
    animateTable(state, {});
    setSaveNote('new game · seed ' + usedSeed);
  }

  function restoreTableSpeed() {
    try {
      if (typeof Table !== 'undefined' && typeof localStorage !== 'undefined' &&
          localStorage.getItem('agent-decker.fast-table') === '1') {
        Table.setFast(true);
        const button = document.getElementById('fast-table');
        if (button) {
          button.textContent = 'Fast table: on';
          button.setAttribute('aria-pressed', 'true');
        }
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
      setSaveNote('resumed a saved game · seed ' + state.seed);
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
    const on = Sound.toggle();
    const button = document.getElementById('sound-toggle');
    if (button) button.textContent = on ? 'Sound: on' : 'Sound: off';
  }

  function howToPlay() {
    const body = el('div', 'rules');
    const figure = el('figure', 'flowchart');
    const img = el('img');
    img.src = 'docs/AgentDecker_turn_flowchart.svg';
    img.alt = 'Turn flowchart: 1 Use cards, 2 Mission check, 3 Line scroll, 4 Card refresh';
    figure.appendChild(img);
    figure.appendChild(el('figcaption', null, 'The turn, in order. Keep this open while you play.'));
    body.appendChild(figure);
    body.appendChild(el('p', 'modal-text',
      '1) Use cards — play cards from your hand to generate Stealth or Fighting, then pay an obstacle\u2019s cost to Disarm it (it comes to you) or Knock it Out (face down, no alarm). One interaction per turn. ' +
      '2) Mission Check — if you can pay the whole goal this turn, the mission is complete. ' +
      '3) Line Scroll — the rightmost card exits the line and raises the alarm by its value; everything slides right and the line refills. ' +
      '4) Card Refresh — discard your hand and Play Area, draw a fresh hand. Unspent resources evaporate.'));
    body.appendChild(el('p', 'modal-text',
      'Some cards let you <b>Bin</b> cards — Waste Room purges as many cards from your hand as you like, Flammable Barrel up to two from your discard. Binned cards are out of the game for good, and the Bin panel shows them. <b>Undo</b> (or Ctrl+Z) rewinds any move you made this turn.'));
    body.appendChild(el('p', 'modal-text',
      'Items with a KEEP icon stay on the table in the Equip Area and give their bonus every turn. Alarm reaches 50 and the complex locks down; your score is the alarm at the end of each mission, added up — lower is better.'));
    body.appendChild(el('p', 'modal-text', 'Agent Decker by Manuel Correia (gamesbymanuel.com), CC BY-NC 4.0. This implementation is unofficial and free.'));
    openOverlay('How to play a turn', body, []);
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (openMenus.some(function (menu) { return !menu.panel.hidden; })) closeMenus();
      else closeOverlay();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
  });

  /* The top bar holds two dropdowns so the row stays short: Learn (training,
   rules, about) and Table & audio (sound, music, fast table, house rule). */
  function closeMenus() {
    openMenus.forEach(function (menu) {
      menu.panel.hidden = true;
      menu.toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function wireMenu(toggleId, panelId) {
    const toggle = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    if (!toggle || !panel) return;
    panel.hidden = true;
    const menu = {
      toggle: toggle,
      panel: panel,
      close: function () {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    };
    openMenus.push(menu);
    toggle.addEventListener('click', function () {
      const opening = panel.hidden;
      closeMenus();
      if (opening) {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        if (panel.children[0] && typeof panel.children[0].focus === 'function') panel.children[0].focus();
      }
    });
    panel.addEventListener('click', menu.close);
    return menu;
  }

  document.getElementById('mission-check').addEventListener('click', missionCheck);
  document.getElementById('end-turn').addEventListener('click', endTurn);
  document.getElementById('modal-close').addEventListener('click', closeOverlay);
  document.getElementById('new-game').addEventListener('click', function () { start(); });
  if (document.getElementById('undo')) document.getElementById('undo').addEventListener('click', undo);
  if (document.getElementById('coach-exit')) document.getElementById('coach-exit').addEventListener('click', exitTraining);
  if (document.getElementById('coach-how')) document.getElementById('coach-how').addEventListener('click', howToPlay);

  const learnMenu = wireMenu('menu-learn-toggle', 'menu-learn-panel');
  const tableMenu = wireMenu('menu-table-toggle', 'menu-table-panel');

  /* Choosing an item closes its menu, so the bar never ends up with two open
     panels hanging over the board. */
  function menuItem(menu, handler) {
    return function () {
      if (menu) menu.close();
      handler();
    };
  }

  if (document.getElementById('training-run')) document.getElementById('training-run').addEventListener('click', menuItem(learnMenu, startTraining));
  if (document.getElementById('how-to-play')) document.getElementById('how-to-play').addEventListener('click', menuItem(learnMenu, howToPlay));
  if (document.getElementById('about')) document.getElementById('about').addEventListener('click', menuItem(learnMenu, about));
  if (document.getElementById('sound-toggle')) document.getElementById('sound-toggle').addEventListener('click', menuItem(tableMenu, toggleSound));
  if (document.getElementById('music-toggle')) document.getElementById('music-toggle').addEventListener('click', menuItem(tableMenu, toggleMusic));
  if (document.getElementById('fast-table')) document.getElementById('fast-table').addEventListener('click', menuItem(tableMenu, toggleFastTable));
  if (document.getElementById('quick-hands')) document.getElementById('quick-hands').addEventListener('click', menuItem(tableMenu, toggleQuickHands));
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
    const button = document.getElementById('quick-hands');
    if (button) {
      button.textContent = state.rules.quickHands ? 'Quick hands: on' : 'Quick hands: off';
      button.setAttribute('aria-pressed', state.rules.quickHands ? 'true' : 'false');
    }
    render();
  }

  function toggleFastTable() {
    const on = !Table.isFast();
    Table.setFast(on);
    const button = document.getElementById('fast-table');
    if (button) {
      button.textContent = on ? 'Fast table: on' : 'Fast table: off';
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    try { localStorage.setItem('agent-decker.fast-table', on ? '1' : '0'); } catch (err) { /* no storage */ }
  }

  function toggleMusic() {
    if (typeof Sound === 'undefined') return;
    const on = Sound.toggleMusic();
    const button = document.getElementById('music-toggle');
    if (button) {
      button.textContent = on ? 'Music: on' : 'Music: off';
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (state && Sound.setTension) Sound.setTension(state.alarm);
    const soundButton = document.getElementById('sound-toggle');
    if (soundButton) soundButton.textContent = Sound.isMuted() ? 'Sound: off' : 'Sound: on';
  }


  return {
    init: init,
    getState: function () { return state; },
    setState: function (s) { return apply(s, 'state restored'); },
    undo: undo,
    canUndo: function () { return undoStack.length > 0; },
    start: start,
    startTraining: startTraining,
    toggleQuickHands: toggleQuickHands,
    exitTraining: exitTraining,
    endTurn: endTurn,
    missionCheck: missionCheck
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UI;
