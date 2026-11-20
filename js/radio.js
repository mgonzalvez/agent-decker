'use strict';

/* The voice of the Colonel. Pure: an advisor record in, a transmission out.
   No DOM, no rules engine, no randomness. The brain decides what to do; this layer
   decides how homebase says it.

   The Colonel talks about the belt. The hand plays itself — every card in it is played
   each turn and unspent resources evaporate, so reading the hand out loud is noise. The
   only real decision is which obstacle to spend the interaction on, and what that leaves
   face up on the conveyor. Every suggestion is tied to a card uid so the UI can light up
   the belt.

   Two registers are generated from the same record:
     radio - thematic, clipped, spy-radio. Never uses printed rules vocabulary.
     plain - the same advice in mechanics the rules use, for players who want it. */
const Radio = (function () {
  /* Printed name -> field language. The Colonel does not say "C.C.T.V. Room Door". */
  const FIELD_NAME = {
    obs_guard: 'the patrol',
    obs_patrolling_guard: 'the patrol on the move',
    obs_sleeping_guard: 'the sleeping guard',
    obs_guard_dog: 'the dog',
    obs_sentry_gun: 'the sentry gun',
    obs_security_camera: 'the camera',
    obs_motion_sensor_hall: 'the motion sensor',
    obs_waste_room: 'the waste room',
    obs_gym_door: 'the gym door',
    obs_yard_door: 'the yard door',
    obs_infimary: 'the infimary',
    obs_radio_tower: 'the radio tower',
    obs_siren: 'the siren',
    obs_locker_room: 'the locker room',
    obs_inspector: 'the inspector',
    obs_archive_door: 'the archive door',
    obs_dormitory: 'the dormitory',
    obs_engineering_bay: 'the engineering bay',
    obs_cctv_room_door: 'the camera room door',
    obs_sniper: 'the sniper',
    obs_watchtower: 'the watchtower',
    obs_prison_door: 'the prison door',
    obs_flammable_barrel: 'the barrel',
    obs_guard_with_bazooka: 'the man with the bazooka',
    obs_tech_container: 'the tech container',
    obs_chain_link_fence: 'the fence',
    obs_laser_hall: 'the laser hall',
    obs_clumsy_guard: 'the clumsy guard',
    obs_armored_guard: 'the armored guard',
    obs_hawk: 'the hawk'
  };

  /* Slot -> where the agent would look. Slot 5 is the exit chute, slot 0 the entry end. */
  const POSITION = [
    'far left',
    'second from the left',
    'left of centre',
    'right of centre',
    'closing on the exit',
    'at the exit chute'
  ];

  const NUMBER = ['none', 'one', 'two', 'three', 'four', 'five', 'six'];

  const OPENER = ['Agent.', 'Homebase.', 'Listen.', 'Report.', 'Agent, focus.'];

  function fieldName(defId, def) {
    return FIELD_NAME[defId] || (def && def.name ? def.name.toLowerCase() : 'the obstacle');
  }

  function position(slot) {
    return POSITION[Math.max(0, Math.min(5, slot))];
  }

  function alarmWord(alarm) {
    if (alarm >= 8) return 'big';
    if (alarm >= 5) return 'serious';
    if (alarm >= 3) return 'meaningful';
    return 'minor';
  }

  function resourceText(action) {
    if (action.itemUid) return 'the gear you already carry';
    const parts = action.cost || {};
    const bits = [];
    if (parts.stealth) bits.push(parts.stealth + ' Stealth');
    if (parts.fighting) bits.push(parts.fighting + ' Fighting');
    if (parts.flexible) bits.push(parts.flexible + ' of either');
    return bits.length ? bits.join(' and ') : 'nothing';
  }

  function rewardText(def) {
    const r = def && def.reward;
    if (!r) return null;
    if (r.resource) {
      const bits = [];
      if (r.resource.stealth) bits.push(r.resource.stealth + ' Stealth');
      if (r.resource.fighting) bits.push(r.resource.fighting + ' Fighting');
      if (bits.length) return 'you bank ' + bits.join(' and ') + ' for later';
    }
    if (r.effect && r.effect.type === 'draw') return 'you draw ' + r.effect.n + ' more cards';
    if (r.effect && r.effect.type === 'discardToInteract') return 'it is gear you can use again';
    return null;
  }

  function interactLine(action, def, state) {
    const where = position(action.slot);
    const name = fieldName(def.id, def);
    const pay = resourceText(action);
    const at = where ? ', ' + where : '';
    if (action.choice === 'knockOut') {
      const why = action.slot === 5 ? 'Face up at the chute, it pays out on the way.' : 'It stays, and raises nothing on the way out.';
      return {
        radio: 'Take down ' + name + at + '. ' + why + ' Cost ' + pay + '.',
        plain: 'Interact with ' + def.name + ' (slot ' + (action.slot + 1) + ') and Knock Out. Cost: ' + pay + '.'
      };
    }
    if (action.choice === 'knockOutAdjacent') {
      return {
        radio: 'Use ' + name + at + ' to put the card beside it down. Cost ' + pay + '.',
        plain: 'Interact with ' + def.name + ' (slot ' + (action.slot + 1) + ') to Knock Out the adjacent card. Cost: ' + pay + '.'
      };
    }
    const bonus = rewardText(def);
    return {
      radio: 'Disarm ' + name + at + '. ' + (bonus ? bonus.charAt(0).toUpperCase() + bonus.slice(1) + '.' : 'Nothing behind it, but it is off the belt.') + ' Cost ' + pay + '.',
      plain: 'Interact with ' + def.name + ' (slot ' + (action.slot + 1) + ') and Disarm. Cost: ' + pay + '.'
    };
  }

  function describe(advice, state, registry, missions, opts) {
    const level = (opts && opts.level) === 'full' ? 'full' : 'nudge';
    const lines = [];
    const plain = [];
    const targets = [];
    const altTargets = [];

    const plan = advice.best.actions;
    const beltMoves = plan.filter(function (a) { return a.kind === 'interact'; });
    const housekeeping = plan.filter(function (a) { return a.kind === 'useItem' || a.kind === 'bin'; });
    const reached = advice.reached || [];
    const left = advice.left || [];
    const moves = state.interactionsLeft || 1;
    const warning = dangerNote(state, registry);
    if (warning) { lines.push(warning); plain.push(warning); }
    else lines.push(OPENER[state.turn % OPENER.length]);

    if (plan.some(function (a) { return a.kind === 'play'; })) {
      lines.push('Cash the hand first. It is free, and what is left burns at the refresh.');
      plain.push('Play every card in hand before spending an interaction.');
    }

    /* Name the choice before the answer, when there is one. */
    if (reached.length > 1 && beltMoves.length <= 2) {
      lines.push('The belt offers ' + reached.length + ' of them; you have ' + (NUMBER[moves] || moves) + (moves === 1 ? ' move' : ' moves') + '.');
      plain.push('Reachable: ' + reached.map(function (r) { return r.name + ' (slot ' + (r.slot + 1) + ')'; }).join(', ') + '. Interactions left: ' + moves + '.');
    }

    const shown = level === 'full' ? beltMoves.slice(0, 2) : beltMoves.slice(0, 1);
    shown.forEach(function (action) {
      const def = findDef(registry, action.uid);
      const line = interactLine(action, def, state);
      lines.push(line.radio);
      plain.push(line.plain);
      targets.push(action.uid);
    });
    if (beltMoves.length > shown.length) {
      lines.push('Then the rest of the belt, in the order homebase named it.');
      plain.push('Then the remaining interactions in the order given.');
    }

    if (housekeeping.length) {
      const names = housekeeping.map(function (a) { return (a.name || 'that card').toLowerCase(); });
      lines.push('Clear ' + names.join(' and ') + ' out of the game.');
      plain.push(housekeeping.map(function (a) { return a.kind === 'bin' ? 'Bin ' + a.name : 'Use equipped ' + a.name; }).join('; ') + '.');
    }

    if (plan.some(function (a) { return a.kind === 'missionCheck'; })) {
      lines.push('That is the objective. Claim it before the refresh takes it.');
      plain.push('Mission Check: the goal is satisfied with what you have this turn.');
    }

    if (!beltMoves.length && !plan.some(function (a) { return a.kind === 'missionCheck'; })) {
      lines.push('Nothing on the belt is worth a move. Hold the line and let it run.');
      plain.push('No beneficial interaction this turn; end the turn.');
    }

    if (left.length) {
      const worth = left.slice().sort(function (a, b) { return b.alarm - a.alarm; })[0];
      lines.push('Homebase leaves ' + (left.length > 1
        ? left.length + ' cards running — ' + fieldName(worth.defId) + ' among them, worth ' + worth.alarm + ' on the way out.'
        : fieldName(worth.defId) + (worth.alarm ? ' — it costs ' + worth.alarm + ' on the way out.' : ' — nothing behind it.')));
      plain.push('Left face up on the belt: ' + left.map(function (r) { return r.name; }).join(', ') + '.');
    }
    /* Chalk on everything the transmission is *not* recommending: the ones left running,
       and the ones taken down by an adjacent knock-out. */
    (left.map(function (r) { return r.uid; }).concat(advice.adjacency || [])).forEach(function (uid) { altTargets.push(uid); });

    /* The trade-off. If the only way to finish the mission is to let something expensive
       walk out of the belt, say so plainly and give the numbers. */
    if (advice.alternative) {
      const delta = Math.abs(advice.alarmAfter - advice.alternative.state.alarm);
      if (delta >= 3) {
        lines.push('Other way round: ' + (advice.missionDone ? 'wait, and keep the belt clean' : 'force the objective now') +
          '. That costs about ' + delta + ' alarm. Your call.');
        plain.push('Alternative: ' + (advice.missionDone ? 'do not check the mission this turn' : 'check the mission this turn') +
          '. Alarm difference: ' + delta + '.');
      }
    }

    lines.push('Over.');
    if (!advice.missionDone) plain.push('End Turn.');
    return {
      text: lines,
      plain: plain,
      targets: targets,
      altTargets: altTargets,
      reached: reached.map(function (r) { return r.uid; }),
      tone: state.alarm >= 40 ? 'critical' : state.alarm >= 25 ? 'elevated' : 'steady',
      signal: advice.confidence
    };
  }

  function findDef(registry, uid) {
    const defId = uid.split('_').slice(0, -1).join('_');
    return registry[defId] || {};
  }

  function missionBrief(mission) {
    const g = mission.goal;
    if (g.knockOutWholeLine) return 'New objective: every card on the belt, face down. Over.';
    if (g.handSize) return 'New objective: hold ' + g.handSize + ' cards in hand at once. Over.';
    const bits = [];
    if (g.resources) {
      if (g.resources.stealth) bits.push(g.resources.stealth + ' Stealth');
      if (g.resources.fighting) bits.push(g.resources.fighting + ' Fighting');
    }
    if (g.either) bits.push(g.either + ' of either');
    if (g.itemsRequired && g.itemsRequired.length) bits.push('the gear on the card');
    return 'New objective: ' + bits.join(' and ') + '. Do it in one turn. Over.';
  }

  function missionEnd(mission, alarm) {
    if (alarm === 0) return 'Clean run. Nobody heard a thing. Good work, agent.';
    if (alarm <= 15) return 'Objective secured for ' + alarm + ' alarm. That is a good day in the field.';
    if (alarm <= 30) return 'Objective secured. ' + alarm + ' alarm. You will do better next time.';
    return 'Objective secured, but ' + alarm + ' alarm. The whole complex knows your name now.';
  }

  function dangerNote(state, registry) {
    if (state.alarm >= 50) return 'Alarm is at fifty. That is the end of the line, agent.';
    if (state.alarm >= 40) return 'Alarm is ' + state.alarm + '. One more mistake and homebase loses you.';
    if (globalThis.Advisor.beltJammed(state, registry)) return 'The belt is jammed. Nothing is moving. Sort that out first.';
    return null;
  }

  return { describe, missionBrief, missionEnd, dangerNote, FIELD_NAME, POSITION };
})();

if (typeof globalThis !== 'undefined') globalThis.Radio = Radio;
if (typeof module !== 'undefined' && module.exports) module.exports = Radio;
