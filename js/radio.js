'use strict';

/* The voice of the Colonel. Pure: an advisor record in, a transmission out.
   No DOM, no rules engine, no randomness. The brain decides what to do; this layer
   decides how homebase says it.

   Two registers are generated from the same record:
     radio - thematic, clipped, spy-radio. Never uses printed rules vocabulary.
     plain - the same advice in mechanics the rules use, for players who want it.
   Every suggestion is tied to the card uid so the UI can light up the belt. */
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

  /* Slot -> where the agent would look. Slot 5 is the exit chute. */
  const POSITION = [
    'just came in, far left',
    'second from the left',
    'left of centre',
    'right of centre',
    'closing on the exit',
    'at the exit chute'
  ];

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

  function playLine(action, def) {
    const r = def.reward && def.reward.resource;
    if (r && (r.stealth || r.fighting)) {
      const bits = [];
      if (r.stealth) bits.push(r.stealth + ' Stealth');
      if (r.fighting) bits.push(r.fighting + ' Fighting');
      return { radio: 'Use ' + def.name + '. That is ' + bits.join(' and ') + '.', plain: 'Play ' + def.name + ' for ' + bits.join(' and ') + '.' };
    }
    return { radio: 'Use ' + def.name + '.', plain: 'Play ' + def.name + '.' };
  }
  function interactLine(action, def, state) {
    const where = position(action.slot);
    const name = fieldName(def.id, def);
    const pay = resourceText(action);
    if (action.choice === 'knockOut') {
      return {
        radio: 'Take ' + name + ' ' + where + ' down. It raises nothing on the way out.',
        plain: 'Interact with ' + def.name + ' (slot ' + (action.slot + 1) + ') and Knock Out. Cost: ' + pay + '.'
      };
    }
    if (action.choice === 'knockOutAdjacent') {
      return {
        radio: 'Use ' + name + ' ' + where + ' to put the card beside it down.',
        plain: 'Interact with ' + def.name + ' (slot ' + (action.slot + 1) + ') to Knock Out the adjacent card. Cost: ' + pay + '.'
      };
    }
    const bonus = rewardText(def);
    return {
      radio: 'Disarm ' + name + ' ' + where + '. ' + (bonus ? bonus.charAt(0).toUpperCase() + bonus.slice(1) + '.' : 'Nothing behind it, but it is off the belt.'),
      plain: 'Interact with ' + def.name + ' (slot ' + (action.slot + 1) + ') and Disarm. Cost: ' + pay + '.'
    };
  }

  function describe(advice, state, registry, missions, opts) {
    const level = (opts && opts.level) === 'full' ? 'full' : 'nudge';
    const lines = [];
    const plain = [];
    const targets = [];

    const warning = dangerNote(state, registry);
    lines.push(warning || OPENER[state.turn % OPENER.length]);
    if (warning) plain.push(warning);

    /* Group the card plays into one sentence: the agent does not need a line per card. */
    const plays = advice.best.actions.filter(function (a) { return a.kind === 'play' || a.kind === 'useItem' || a.kind === 'bin'; });
    if (level === 'full') plays.forEach(function (a) { targets.push(a.uid); });
    if (plays.length && level === 'full') {
      const names = plays.map(function (a) { return a.name.toLowerCase(); });
      const total = plays.reduce(function (sum, a) { return sum + (a.stealth || 0) + (a.fighting || 0); }, 0);
      lines.push('Use ' + names.join(', ') + (total ? '. That gives you something to work with.' : '.'));
      plain.push('Play ' + names.join(', ') + '.');
    } else if (plays.length) {
      lines.push('Cash the hand first, then work the belt.');
      plain.push('Play the cards in hand, then interact.');
    }

    advice.best.actions.forEach(function (action) {
      if (action.kind === 'play' || action.kind === 'useItem' || action.kind === 'bin' || action.kind === 'endTurn') return;
      if (action.kind === 'missionCheck') {
        lines.push('That is the objective. Claim it before the refresh takes it away.');
        plain.push('Mission Check: the goal is satisfied with what you have this turn.');
        return;
      }
      const def = findDef(registry, action.uid);
      const line = interactLine(action, def, state);
      lines.push(line.radio);
      plain.push(line.plain);
      targets.push(action.uid);
    });

    if (!advice.best.actions.some(function (a) { return a.kind !== 'endTurn'; })) {
      lines.push('Nothing worth doing. Hold the line and let the belt run.');
      plain.push('No beneficial action this turn; end the turn.');
    }

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
