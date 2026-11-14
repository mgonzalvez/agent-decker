'use strict';

/* Training Run: a state-driven coach for Mission One. It never changes the rules,
   it only decides which actions the player is allowed to take right now. */
const Tutorial = (function () {
  function affordable(state, registry, card) {
    const cost = Engine.effectiveCost(state, registry, card);
    return cost.total <= state.resources.stealth + state.resources.fighting;
  }

  function live(state) {
    return state.line.filter(function (card) { return !state.faceDown[card.uid]; });
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
    const options = live(state).filter(function (card) {
      return interactable(state, registry, card) && affordable(state, registry, card);
    });
    const want = goalResource(missions[state.missionIndex]);
    return options.sort(function (a, b) {
      const ha = helpsGoal(registry[a.defId], want) ? 1 : 0;
      const hb = helpsGoal(registry[b.defId], want) ? 1 : 0;
      return (hb - ha) || (registry[b.defId].alarm - registry[a.defId].alarm) ||
        (Engine.effectiveCost(state, registry, b).total - Engine.effectiveCost(state, registry, a).total);
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

    const exiting = state.line[state.line.length - 1];

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
      const disarm = bestDisarm(state, registry, missions);
      const knockOut = bestKnockOut(state, registry);

      const want = goalResource(missions[state.missionIndex]);
      if (exiting && affordable(state, registry, exiting) && interactable(state, registry, exiting)) {
        const cost = Engine.effectiveCost(state, registry, exiting);
        return {
          id: 'disarm',
          title: 'Deal with the card about to leave',
          text: registry[exiting.defId].name + ' is at the right end of the line: it exits at the end of this turn and adds ' + registry[exiting.defId].alarm + ' to the alarm. You can afford it (' + cost.total + ') — disarm it, and it comes to your Play Area, where it will reappear in your deck later and generate resources again. The other option is Knock Out: the card stays in the line face down and raises no alarm when it leaves.',
          allowed: { interact: true },
          highlight: { disarm: exiting.uid, knockOut: knockOut ? knockOut.uid : null, exiting: exiting.uid }
        };
      }

      if (exiting && interactable(state, registry, exiting)) {
        return {
          id: 'knockOut',
          title: 'Knock it out before it leaves',
          text: 'You cannot afford ' + registry[exiting.defId].name + ' (it costs ' + Engine.effectiveCost(state, registry, exiting).total + '), and it would add ' + registry[exiting.defId].alarm + ' to the alarm when it exits. Knocking it out puts it face down: its type and effect are ignored and it raises no alarm when it slides out.',
          allowed: { interact: true },
          highlight: { knockOut: exiting.uid, exiting: exiting.uid }
        };
      }

      if (disarm) {
        const cost = Engine.effectiveCost(state, registry, disarm);
        return {
          id: 'disarm',
          title: 'Disarm something worth keeping',
          text: registry[disarm.defId].name + ' costs ' + cost.total + ' and raises ' + registry[disarm.defId].alarm + ' alarm. Disarm it to take it into your Play Area — you have ' + state.resources.stealth + ' Stealth and ' + state.resources.fighting + ' Fighting. If you do not want the card, Knock Out instead: it stays face down in the line and raises no alarm when it slides out.',
          allowed: { interact: true },
          highlight: { disarm: disarm.uid, knockOut: knockOut ? knockOut.uid : null, exiting: exiting ? exiting.uid : null }
        };
      }

      return {
        id: 'interact',
        title: 'Interact with the line',
        text: 'One interaction per turn. Disarm takes a card into your Play Area (KEEP items go to the Equip Area). Knock Out leaves it face down and silent. Nothing in the line is affordable right now — play your cards first, then come back.',
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
