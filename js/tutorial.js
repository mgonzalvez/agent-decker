'use strict';

/* Training Run: a state-driven coach for Mission One. It never changes the rules,
   it only decides which actions the player is allowed to take right now. */
const Tutorial = (function () {
  function affordable(state, registry, card) {
    return Engine.canAfford(state, registry, card);
  }

  function live(state) {
    return state.line.filter(function (card) { return card && !state.faceDown[card.uid]; });
  }

  function exitingCard(state) {
    for (let i = state.line.length - 1; i >= 0; i--) if (state.line[i]) return state.line[i];
    return null;
  }

  function goalResource(mission) {
    if (!mission.goal || !mission.goal.resources) return null;
    return mission.goal.resources.stealth ? 'stealth' : 'fighting';
}

  function helpsGoal(def, resource) {
    const r = def.reward && def.reward.resource;
    return !!resource && !!r && r[resource] > 0;
  }

  function interactable(state, registry, card) {
    return !state.faceDown[card.uid] && Engine.canInteract(state, registry, card).ok;
  }

  function bestDisarm(state, registry, missions) {
    const want = goalResource(missions[state.missionIndex]);
    const options = live(state).filter(function (card) {
      return interactable(state, registry, card) && affordable(state, registry, card);
    });
    const helpers = options.filter(function (card) { return helpsGoal(registry[card.defId], want); });
    const pool = helpers.length ? helpers : options;
    /* Take the highest-alarm thing you can afford; the card at the right end of
       the line is worth disarming too, because removing it means no alarm. */
    return pool.sort(function (a, b) {
      return registry[b.defId].alarm - registry[a.defId].alarm ||
        Engine.effectiveCost(state, registry, b).total - Engine.effectiveCost(state, registry, a).total;
    })[0] || null;
  }

  function bestKnockOut(state, registry) {
    const options = live(state).filter(function (card) {
      return interactable(state, registry, card);
    });
    return options.sort(function (a, b) { return registry[b.defId].alarm - registry[a.defId].alarm; })[0] || null;
  }

  function plan(state, registry, missions) {
    if (!state || !state.tutorial || state.gameOver) return null;

    if (state.missionIndex > 0) {
      return {
        id: 'finished',
        title: 'Training complete',
        text: 'You finished Mission One on your own. The real campaign has five missions, better gear and a lot more obstacles. Keep the alarm low — your score is the alarm level at the end of each mission, added up.',
        allowed: { campaign: true, play: true, interact: true, endTurn: true, missionCheck: true }
      };
    }

    const mission = missions[state.missionIndex];
    const goal = registry[mission.goalCardId].goalText;

    if (Engine.goalSatisfied(state, registry, missions)) {
      return {
        id: 'missionCheck',
        title: 'Mission Check',
        text: 'You have ' + state.resources.stealth + ' Stealth and ' + state.resources.fighting + ' Fighting this turn — that covers the whole goal (' + goal + '). Press Mission Check before the turn ends, or the resources evaporate.',
        allowed: { missionCheck: true }
      };
    }

    const exiting = exitingCard(state);

    if (state.hand.length > 0) {
      return {
        id: 'play',
        title: 'Play your hand',
        text: 'Click Play on every card in your hand. Each one generates Stealth or Fighting and goes to the Play Area — resources are only good for this turn, so spend everything before you interact. Goal this mission: ' + goal + '.', 
        allowed: { play: true },
        highlight: { exiting: exiting ? exiting.uid : null }
      };
    }

    if (state.interactionsLeft > 0) {
      const want = goalResource(missions[state.missionIndex]);
      const disarm = bestDisarm(state, registry, missions);
      const knockOut = bestKnockOut(state, registry);

      if (exiting && interactable(state, registry, exiting)) {
        const cost = Engine.effectiveCost(state, registry, exiting);
        if (affordable(state, registry, exiting) && (!disarm || !helpsGoal(registry[disarm.defId], want))) {
          return {
            id: 'disarm',
            title: 'Take the card off the end of the line',
            text: registry[exiting.defId].name + ' is about to leave the line and raise ' + registry[exiting.defId].alarm + ' alarm. You can afford to disarm it (' + cost.total + ') — take it out of the line and it never raises the alarm, and it joins your deck for later turns.',
            allowed: { interact: true },
            highlight: { disarm: exiting.uid, exiting: exiting.uid }
          };
        }
      }

      if (disarm && helpsGoal(registry[disarm.defId], want)) {
        const cost = Engine.effectiveCost(state, registry, disarm);
        return {
          id: 'disarm',
          title: 'Build your deck',
          text: registry[disarm.defId].name + ' costs ' + cost.total + ' and gives ' + want + ' when it comes back round in your deck — disarm it. Disarmed obstacles join your deck, which is how you get better cards. You have ' + state.resources.stealth + ' Stealth and ' + state.resources.fighting + ' Fighting.',
          allowed: { interact: true },
          highlight: { disarm: disarm.uid, exiting: exiting ? exiting.uid : null }
        };
      }

      if (exiting && interactable(state, registry, exiting)) {
        return {
          id: 'knockOut',
          title: 'Silence the card about to leave',
          text: registry[exiting.defId].name + ' is at the right end of the line and exits at the end of this turn, adding ' + registry[exiting.defId].alarm + ' to the alarm. You cannot afford to disarm it (it costs ' + Engine.effectiveCost(state, registry, exiting).total + '), so knock it out: it goes face down, its effect is ignored and it raises no alarm when it slides out.',
          allowed: { interact: true },
          highlight: { knockOut: exiting.uid, exiting: exiting.uid }
        };
      }

      if (disarm) {
        const cost = Engine.effectiveCost(state, registry, disarm);
        return {
          id: 'disarm',
          title: 'Disarm something worth keeping',
          text: registry[disarm.defId].name + ' costs ' + cost.total + ' and raises ' + registry[disarm.defId].alarm + ' alarm. Disarm it to take it into your Play Area — you have ' + state.resources.stealth + ' Stealth and ' + state.resources.fighting + ' Fighting.',
          allowed: { interact: true },
          highlight: { disarm: disarm.uid, exiting: exiting ? exiting.uid : null }
        };
      }

      return {
        id: 'interact',
        title: 'Nothing you can afford',
        text: 'One interaction per turn. Nothing in the line is payable with ' + state.resources.stealth + ' Stealth and ' + state.resources.fighting + ' Fighting — play your cards first, then come back.',
        allowed: { interact: true, endTurn: true },
        highlight: { exiting: exiting ? exiting.uid : null }
      };
    }

    return {
      id: 'endTurn',
      title: 'End the turn',
      text: 'End Turn scrolls the line: ' + (exiting ? registry[exiting.defId].name + ' (' + registry[exiting.defId].alarm + ' alarm)' : 'the last card') +
        ' exits to the obstacles discard, the line refills from the left, your hand and Play Area are discarded, and you draw a fresh hand. Unspent resources evaporate.',
      allowed: { endTurn: true },
      highlight: { exiting: exiting ? exiting.uid : null }
    };
  }

  return { plan: plan };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Tutorial;
