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

  function cardAlt(def) {
    if (def.set === 'starting') return def.name;
    if (def.isGoal) return def.name + ' — goal: ' + def.goalText;
    return def.name + ' — ' + def.obstacleType + ', cost ' + (def.cost ? (def.cost.either ? def.cost.either + ' any mix' : (def.cost.stealth || 0) + ' stealth / ' + (def.cost.fighting || 0) + ' fighting') : '') + ', alarm ' + def.alarm;
  }

  function thumb(card, zone) {
    const div = el('div', 'thumb');
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
        div.appendChild(el('span', 'equip-note', 'works on ' + effect.targetType));
      }
      if (effect && effect.type === 'usedCardToObstacleDiscard') {
        const button = el('button', 'use-btn');
        button.type = 'button';
        button.textContent = 'Use';
        button.addEventListener('click', function () {
          apply(Engine.useItem(state, card.uid, registry), d.name + ' used', 'disarm');
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
    state.line.forEach(function (card, index) {
      const def = defOf(card);
      const isLast = index === state.line.length - 1;
      let extra = isLast ? ' exiting' : '';
      if (mark.disarm === card.uid) extra += ' tut-disarm';
      if (mark.knockOut === card.uid) extra += ' tut-knock';
      if (mark.exiting === card.uid) extra += ' tut-exit';
      const payable = canAct && !state.faceDown[card.uid] && Engine.canInteract(state, registry, card).ok &&
        Engine.canAfford(state, registry, card);
      if (payable) extra += ' can-interact';
      const slot = el('button', 'slot' + (state.faceDown[card.uid] ? ' face-down' : '') + extra);
      slot.type = 'button';
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
      const button = el('button', 'play-btn');
      button.type = 'button';
      button.textContent = 'Play';
      button.disabled = !allowed('play');
      button.addEventListener('click', function () { playCard(card); });
      fig.appendChild(button);
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

    const log = document.getElementById('log');
    log.innerHTML = '';
    state.log.slice(-8).reverse().forEach(function (entry) {
      log.appendChild(el('li', null, entry));
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

  function apply(newState, message, sound) {
    const previousAlarm = state ? state.alarm : 0;
    state = newState;
    if (typeof window !== 'undefined') window.gameState = state;
    const problems = AgentDecker.checkInvariants(state, registry);
    if (problems.length) console.warn('invariant problems:', problems);

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
      apply(Actions.play(state, card.uid, registry), def.name + ' played', 'play');
      return;
    }

    const pool = choice.kind === 'hand'
      ? state.hand.filter(function (c) { return c.uid !== card.uid; })
      : choice.kind === 'discard' ? state.discard.slice()
      : choice.kind === 'deck' ? state.deck.slice()
      : choice.kind === 'line' ? state.line.slice()
      : state.deck.slice(-(choice.n || 5)).reverse();

    if (!pool.length) {
      apply(Actions.play(state, card.uid, registry), def.name + ' played (nothing to choose)', 'play');
      return;
    }

    if (choice.kind === 'order') {
      const order = [];
      function redrawOrder() {
        const options = pool.map(function (c) {
          const at = order.indexOf(c.uid);
          return {
            label: defOf(c).name + (at >= 0 ? ' — position ' + (at + 1) : ''),
            action: function () {
              if (at >= 0) order.splice(at, 1);
              else order.push(c.uid);
              redrawOrder();
            }
          };
        });
        options.push({
          label: order.length === pool.length ? 'Put them back in this order' : 'Cancel',
          action: function () {
            apply(Actions.play(state, card.uid, registry, order.length === pool.length ? { order: order } : {}), def.name + ' played', 'play');
          }
        });
        openOverlay(def.name, choice.label, options);
      }
      redrawOrder();
      return;
    }

    if (choice.single) {
      const options = pool.map(function (c) {
        return { label: defOf(c).name, action: function () { apply(Actions.play(state, card.uid, registry, { uid: c.uid }), def.name + ' played', 'play'); } };
      });
      options.push({ label: 'Cancel', action: function () { apply(Actions.play(state, card.uid, registry), def.name + ' played', 'play'); } });
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
        action: function () { apply(Actions.play(state, card.uid, registry, { cards: picked }), def.name + ' played', 'play'); }
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
    const choices = [];
    if (check.ok && allowed('interact')) {
      choices.push({ label: 'Disarm (to ' + (def.keep ? 'Equip Area' : 'Play Area') + ')', action: function () { apply(Actions.interact(state, card.uid, 'disarm', registry), def.name + ' disarmed', 'disarm'); } });
      choices.push({ label: 'Knock Out (face down, no alarm)', action: function () { apply(Actions.interact(state, card.uid, 'knockOut', registry), def.name + ' knocked out', 'knockOut'); } });
      if (check.items && check.items.length) {
        check.items.forEach(function (item) {
          const itemName = defOf(item).name;
          choices.push({ label: 'Use ' + itemName + ' (discard it) → Disarm', action: function () { apply(Actions.interact(state, card.uid, 'disarm', registry, { itemUid: item.uid }), itemName + ' used on ' + def.name, 'disarm'); } });
          choices.push({ label: 'Use ' + itemName + ' (discard it) → Knock Out', action: function () { apply(Actions.interact(state, card.uid, 'knockOut', registry, { itemUid: item.uid }), itemName + ' used on ' + def.name, 'knockOut'); } });
        });
      }
      if (def.effect && def.effect.type === 'knockOutAdjacentInsteadOfInteract') {
        Actions.neighbours(state, registry, card.uid).forEach(function (n) {
          choices.push({ label: 'Knock out adjacent ' + defOf(n).name + ' instead', action: function () { apply(Actions.interact(state, card.uid, 'knockOutAdjacent', registry, { uid: n.uid }), 'knocked out ' + defOf(n).name, 'knockOut'); } });
        });
      }
    }
    openOverlay(def.name + (check.ok ? '' : ' — ' + check.reason), describe(def, card), choices, def.art[0]);
  }

  function missionCheck() {
    if (Actions.missionCheck(state, registry, missions)) {
      apply(Actions.completeMission(state, registry, missions), 'Mission complete', 'mission');
    } else {
      openOverlay('Mission Check', 'Not yet — the whole goal has to be paid in one turn.', []);
    }
  }

  function endTurn() {
    apply(Actions.endTurn(state, registry), 'Turn over');
  }

  function startTraining() {
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
    const fromUrl = typeof window !== 'undefined' && window.location
      ? Number(new URLSearchParams(window.location.search).get('seed'))
      : 0;
    const usedSeed = seed || fromUrl || (Date.now() % 1000000);
    state = AgentDecker.createInitialState(Object.keys(registry).map(function (id) { return registry[id]; }), missions, usedSeed);
    if (typeof window !== 'undefined') window.gameState = state;
    if (typeof Save !== 'undefined') Save.clearGame();
    render();
    setSaveNote('new game · seed ' + usedSeed);
  }

  function init(cardDefs, missionList, seed) {
    registry = AgentDecker.buildRegistry(cardDefs);
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
      'Items with a KEEP icon stay on the table in the Equip Area and give their bonus every turn. Alarm reaches 50 and the complex locks down; your score is the alarm at the end of each mission, added up — lower is better.'));
    body.appendChild(el('p', 'modal-text', 'Agent Decker by Manuel Correia (gamesbymanuel.com), CC BY-NC 4.0. This implementation is unofficial and free.'));
    openOverlay('How to play a turn', body, []);
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeOverlay();
  });

  document.getElementById('mission-check').addEventListener('click', missionCheck);
  document.getElementById('end-turn').addEventListener('click', endTurn);
  document.getElementById('how-to-play').addEventListener('click', howToPlay);
  if (document.getElementById('quick-hands')) document.getElementById('quick-hands').addEventListener('click', toggleQuickHands);
  if (document.getElementById('training-run')) document.getElementById('training-run').addEventListener('click', startTraining);
  if (document.getElementById('coach-exit')) document.getElementById('coach-exit').addEventListener('click', exitTraining);
  if (document.getElementById('coach-how')) document.getElementById('coach-how').addEventListener('click', howToPlay);
  document.getElementById('modal-close').addEventListener('click', closeOverlay);
  document.getElementById('new-game').addEventListener('click', function () { start(); });
  if (document.getElementById('about')) document.getElementById('about').addEventListener('click', about);
  if (document.getElementById('sound-toggle')) document.getElementById('sound-toggle').addEventListener('click', toggleSound);
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

  if (document.getElementById('music-toggle')) document.getElementById('music-toggle').addEventListener('click', function () {
    const on = Sound.toggleMusic();
    document.getElementById('music-toggle').textContent = on ? 'Music: on' : 'Music: off';
    if (state) Sound.setTension(state.alarm);
    const soundButton = document.getElementById('sound-toggle');
    if (soundButton) soundButton.textContent = Sound.isMuted() ? 'Sound: off' : 'Sound: on';
  });
  if (document.getElementById('replay-seed')) document.getElementById('replay-seed').addEventListener('click', function () { start(state.seed); });

  return {
    init: init,
    getState: function () { return state; },
    setState: function (s) { return apply(s, 'state restored'); },
    start: start,
    startTraining: startTraining,
    toggleQuickHands: toggleQuickHands,
    exitTraining: exitTraining,
    endTurn: endTurn,
    missionCheck: missionCheck
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UI;
