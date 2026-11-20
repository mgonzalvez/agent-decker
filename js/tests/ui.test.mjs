import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { map, textOf, fire, UI, cardDefs, missions, registry, lineCards, playedSounds } from './harness.mjs';

test('the alarm counter reports its level and the ruler pointer tracks the value', () => {
  UI.init(cardDefs, missions, 42);
  const state = UI.getState();
  state.alarm = 25;
  UI.setState(state);
  assert.ok(Math.abs(Number(map['alarm-mark'].x1) - 50) < 0.1, 'the pointer sits at the middle of the ruler');
  assert.ok(map['alarm']._classes.has('level-mid'));
  state.alarm = 44;
  UI.setState(state);
  assert.ok(map['alarm']._classes.has('level-high'));
  assert.ok(!map['alarm-danger'].hidden);
  state.alarm = 48;
  UI.setState(state);
  assert.ok(map['alarm']._classes.has('level-critical'));
  assert.ok(Math.abs(Number(map['alarm-mark'].x1) - 96) < 0.1);
  state.alarm = 0;
  UI.setState(state);
  assert.ok(Number(map['alarm-mark'].x1) === 0);
  assert.ok(map['alarm']._classes.has('level-low'));
  assert.ok(map['alarm-danger'].hidden);
});

test('the board renders from the starting state', () => {
  UI.init(cardDefs, missions, 42);
  assert.strictEqual(map.line.children.length, 6);
  assert.strictEqual(map.hand.children.length, 4);
  assert.strictEqual(String(map['obstacle-deck-count'].textContent), '16');
  assert.strictEqual(String(map['player-deck-count'].textContent), '4');
  assert.strictEqual(String(map['alarm-value'].textContent), '0');
  assert.strictEqual(map['mission-banner'].querySelector('.mission-name').textContent, 'Mission One');
  assert.strictEqual(map['mission-banner'].querySelector('.mission-goal').textContent, 'Goal: Get 6 Stealth');
  assert.ok(map['goal-card'].querySelector('img').src.endsWith('032.jpg'));
  assert.strictEqual(String(map['interactions-left'].textContent), '1');
});

test('the draw deck panel shows how many cards are left and what is in it', () => {
  assert.strictEqual(String(map['player-deck-count'].textContent), '4');
  assert.strictEqual(String(map['player-hand-count'].textContent), '4');
  assert.ok(map['player-deck-breakdown'].textContent.includes('8 cards'), 'the player starts with 8 cards');
  assert.ok(map['player-deck-breakdown'].textContent.includes('disarm'));
});

test('playing a hand card adds resources and moves it to the Play Area', () => {
  const first = map.hand.children[0];
  const button = first.children.find((c) => c.className === 'play-btn');
  assert.ok(button, 'every hand card has a Play button');
  button.click();
  assert.ok(Number(map['res-stealth'].textContent) + Number(map['res-fighting'].textContent) > 0);
  assert.ok(map['play-area-cards'].children.length > 0);
});

test('clicking a line card zooms it and shows its printed text', () => {
  map.line.children[0].click();
  assert.strictEqual(map.overlay.hidden, false);
  assert.ok(map['modal-title'].textContent.length > 0);
  assert.ok(map['modal-body'].children.some((c) => c.tag === 'img'), 'the zoom modal shows the card art');
  map['modal-close'].click();
  assert.strictEqual(map.overlay.hidden, true);
});

test('the card modal only offers interactions the agent can actually pay for', () => {
  UI.init(cardDefs, missions, 76);
  let state = UI.getState();
  const target = state.line.filter(Boolean).find(function (c) {
    return !state.faceDown[c.uid] && registry[c.defId].obstacleType === 'person';
  });
  assert.ok(target, 'the seed puts a person in the line');
  ['obstacleDeck', 'missionDeck', 'line', 'hand', 'playArea', 'discard', 'obstacleDiscard', 'equip'].forEach(function (zone) {
    state[zone] = state[zone].filter(function (c) { return !c || c.uid !== 'obs_infimary_0'; });
  });
  state.equip.push({ uid: 'obs_infimary_0', defId: 'obs_infimary' });
  state.resources = { stealth: 1, fighting: 0 };
  state.sources = [{ uid: 'start_hide_0', name: 'Hide', stealth: 1, fighting: 0 }];
  state.interactionsLeft = 1;
  UI.setState(state);

  const slot = map.line.children.find(function (c) { return c['data-uid'] === target.uid; });
  assert.ok(slot, 'the card is rendered in the line');
  slot.click();

  const labels = map['modal-choices'].children.map(function (c) { return c.textContent; });
  assert.ok(labels.length === 2, 'only the two Chloroform options are offered, got: ' + labels.join(' | '));
  assert.ok(labels.every(function (l) { return l.indexOf('Chloroform') >= 0; }), 'the plain pay-with-resources options must not appear: ' + labels.join(' | '));
  const body = textOf(map['modal-body']);
  assert.ok(body.indexOf('Cost to interact') >= 0, 'the modal states the printed cost');
  assert.ok(body.indexOf('Available this turn') >= 0, 'the modal says what the agent holds');
  assert.ok(body.indexOf('Hide') >= 0, 'the modal names the card that produced the resource');
  assert.ok(body.indexOf('Chloroform') >= 0, 'the modal names the item that can pay');
  map['modal-close'].click();
});

test('when the resources can pay, the option says what it costs', () => {
  UI.init(cardDefs, missions, 76);
  const state = UI.getState();
  const target = state.line.filter(Boolean).find(function (c) { return !state.faceDown[c.uid]; });
  state.resources = { stealth: 20, fighting: 20 };
  state.sources = [{ uid: null, name: 'Gear Up!', stealth: 20, fighting: 20 }];
  state.interactionsLeft = 1;
  UI.setState(state);
  const slot = map.line.children.find(function (c) { return c['data-uid'] === target.uid; });
  slot.click();
  const labels = map['modal-choices'].children.map(function (c) { return c.textContent; });
  assert.ok(labels.some(function (l) { return l.indexOf('pay ') >= 0; }), 'the Disarm option states the payment: ' + labels.join(' | '));
});

test('the Bin lists what each hand card is worth, not just its name', () => {
  UI.init(cardDefs, missions, 42);
  const state = UI.getState();
  state.bin = { source: 'hand', remaining: -1 };
  UI.setState(state);
  const fig = map.hand.children[0];
  const effect = fig.children.find(function (c) { return c.className === 'card-effect'; });
  assert.ok(effect, 'the hand card carries an effect line when the Bin is open');
  assert.ok(effect.textContent.length > 0, 'the effect line is not empty');
});

test('every card definition carries its printed text', () => {
  assert.ok(cardDefs.every((c) => typeof c.topText === 'string'));
  assert.ok(cardDefs.every((c) => typeof c.bottomText === 'string'));
});

test('hand cards and area thumbnails are buttons, so they work with the keyboard', () => {
  const fig = map.hand.children[0];
  const face = fig.children.find((c) => c.className === 'card-face');
  assert.ok(face && face.tag === 'button', 'the card face is a real button');
  assert.ok(face['aria-label'], 'the zoom button is labelled for screen readers');
  assert.ok(map.line.children[0]['aria-label'], 'line slots describe their cost and alarm');
});

test('the game is saved to local storage after every action', () => {
  const saved = Save.loadGame();
  assert.ok(saved && saved.state, 'a save exists');
  assert.strictEqual(saved.state.turn, 1);
  assert.ok(saved.savedAt);
});

test('the top bar is hardware: switches and tabs, no dropdowns', () => {
  UI.init(cardDefs, missions, 42);

  const fast = map['fast-table'];
  fast.click();
  assert.strictEqual(fast['aria-checked'], 'true', 'the lever moves to the on stop');
  fast.click();
  assert.strictEqual(fast['aria-checked'], 'false', 'and back to the off stop');

  const sound = map['sound-toggle'];
  sound.click();
  assert.strictEqual(sound['aria-checked'], 'true', 'the Sound switch announces its state');

  map['training-run'].click();
  assert.ok(UI.getState().tutorial, 'the Training run tab starts the coach');

  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('menu-panel'), 'nothing hides behind a dropdown anymore');
  assert.ok(/class="switch" role="switch" aria-checked="false"/.test(html), 'switches are drawn as switches');
});

test('the family links live in the footer strip', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const strip = html.match(/class="footer-sites"[\s\S]*?<\/nav>/);
  assert.ok(strip, 'the footer carries the related-sites strip');
  const links = strip[0].match(/<a href="([^"]+)"/g) || [];
  assert.ok(links.length >= 10, 'the strip links to at least ten family sites');
  assert.ok(/rel="noopener noreferrer"/.test(strip[0]), 'external links are safe');
  assert.ok(/gonzhome\.us/.test(strip[0]), 'Gonzhome, the hub, is linked');
});

test('Undo lives in the top bar and only lights up when a move can be rewound', () => {
  UI.init(cardDefs, missions, 42);
  assert.ok(map['undo'].disabled, 'nothing to undo at the start of a fresh game');
  const first = map['hand'].children[0];
  first.children.find((c) => c.className === 'play-btn').click();
  assert.ok(!map['undo'].disabled, 'a move was made, so Undo is live');
  map['undo'].click();
  assert.ok(map['undo'].disabled, 'undoing the only move empties the stack');
});

test('a card with a choice-driven effect asks before it is played', () => {
  const s = UI.getState();
  s.hand.push({ uid: 'watchtower_ui_0', defId: 'obs_watchtower' });
  UI.setState(s);
  const fig = map.hand.children[map.hand.children.length - 1];
  const button = fig.children.find((c) => c.className === 'play-btn');
  button.click();
  assert.strictEqual(map.overlay.hidden, false);
  const body = map['modal-body'].children.filter((c) => c.tag === 'p').map((c) => c.textContent).join(' ');
  assert.ok(body.includes('top'), 'the prompt explains what the card does');
  const choices = map['modal-choices'].children;
  assert.strictEqual(choices.length, Math.min(5, s.deck.length) + 1, 'the top of the deck plus a confirm button');
  choices.slice(0, choices.length - 1).forEach((c) => c.click());
  const finalChoices = map['modal-choices'].children;
  assert.ok(finalChoices[finalChoices.length - 1].textContent.includes('Put them back'), 'the order is confirmed once all of them are picked');
  map['modal-close'].click();
});

test('the About screen carries the credit and the score log', () => {
  map['about'].click();
  const body = textOf(map['modal-body']);
  assert.ok(body.includes('Manuel Correia'), 'the credit is present');
  assert.ok(body.includes('CC BY-NC'), 'the license is present');
  map['modal-close'].click();
});

test('the sound switch reports its state on the lever', () => {
  map['sound-toggle'].click();
  assert.strictEqual(map['sound-toggle']['aria-checked'], 'true');
});

test('Escape closes the card zoom', () => {
  map.line.children[0].click();
  assert.strictEqual(map.overlay.hidden, false);
  fire('keydown', { key: 'Escape' });
  assert.strictEqual(map.overlay.hidden, true);
});

test('replaying the seed restarts the same game from turn 1', () => {
  const seed = UI.getState().seed;
  map['replay-seed'].click();
  assert.strictEqual(UI.getState().seed, seed);
  assert.strictEqual(UI.getState().turn, 1);
});

test('clicking End Turn advances the turn without breaking the board', () => {
  map['end-turn'].click();
  assert.strictEqual(String(map['turn-number'].textContent), '2');
  assert.strictEqual(map.line.children.length, 6);
  assert.ok(Number(map['obstacle-discard-count'].textContent) >= 1);
  assert.ok(map.log.children.length > 0);
});

test('the campaign score screen lists the alarm at the end of each mission', () => {
  const s = UI.getState();
  s.missionAlarms = [4, 9, 12, 7, 0];
  s.gameOver = 'campaignComplete';
  UI.setState(s);
  assert.strictEqual(map.overlay.hidden, false);
  const score = map['modal-body'].children.find((c) => c.className === 'score');
  assert.ok(score, 'the score block is rendered');
  const rows = score.children.filter((c) => c.className === 'score-row');
  assert.strictEqual(rows.length, 5);
  assert.ok(rows[0].children.some((c) => c.className === 'score-alarm' && c.textContent === '4'));
  assert.ok(score.children.some((c) => c.className === 'score-total'));
  map['modal-close'].click();
});

test('the training run shows a coach and gates what you can do', () => {
  UI.startTraining();
  assert.ok(UI.getState().tutorial);
  assert.strictEqual(map['coach'].hidden, false);
  assert.ok(map['end-turn'].disabled);
  assert.ok(map['mission-check'].disabled);
  UI.exitTraining();
  assert.ok(!UI.getState().tutorial);
  assert.strictEqual(map['coach'].hidden, true);
  assert.ok(!map['end-turn'].disabled);
});

test('the End Turn button is inked when it is the only move left', () => {
  UI.init(cardDefs, missions, 42);
  let state = UI.getState();
  state.hand = [];
  state.interactionsLeft = 0;
  state.resources = { stealth: 0, fighting: 0 };
  UI.setState(state);
  assert.ok(map['end-turn']._classes.has('is-ready'));

  state = UI.getState();
  state.hand = state.hand.length ? state.hand : [];
  state.interactionsLeft = 1;
  UI.setState(state);
  assert.ok(!map['end-turn']._classes.has('is-ready'));
});

test('cards you can afford light up in the line', () => {
  UI.init(cardDefs, missions, 42);
  let state = UI.getState();
  state.resources = { stealth: 5, fighting: 5 };
  UI.setState(state);
  const line = map['line'].children;
  const lit = line.filter((slot) => slot.className.includes('can-interact'));
  assert.ok(lit.length > 0, 'at least one obstacle should be payable');

  state = UI.getState();
  state.resources = { stealth: 0, fighting: 0 };
  UI.setState(state);
  assert.ok(map['line'].children.every((slot) => !slot.className.includes('can-interact')));
});

test('the Quick Hands switch flips the house rule and its lever', () => {
  UI.init(cardDefs, missions, 42);
  assert.ok(!UI.getState().rules.quickHands);
  map['quick-hands'].click();
  assert.ok(UI.getState().rules.quickHands);
  assert.strictEqual(map['quick-hands']['aria-checked'], 'true');
  map['quick-hands'].click();
  assert.ok(!UI.getState().rules.quickHands);
});

test('the mission log groups entries by turn and stamps each one', () => {
  const state = UI.getState ? UI.getState() : null;
  assert.ok(state, 'the UI exposes its state in tests');
  const log = map['log'];
  assert.ok(log.children.some(function (c) { return c.className === 'log-turn'; }), 'there is a turn heading');
  assert.ok(textOf(log).indexOf('T') >= 0, 'entries carry a turn stamp');
  assert.ok(log.children.some(function (c) { return c.className.indexOf('log-entry') >= 0; }), 'entries are rendered as list items');
});

test('a successful mission check plays a fanfare and briefs the next mission', () => {
  const state = UI.getState();
  state.resources = { stealth: 6, fighting: 0 };
  UI.missionCheck();
  assert.ok(playedSounds.indexOf('fanfare') >= 0, 'the fanfare fires on a mission completion');
  assert.ok(map['modal-title'].textContent.indexOf('Mission One complete') >= 0);
  const body = textOf(map['modal-body']);
  assert.ok(body.indexOf('Mission closed') >= 0, 'the report is clipped, not chatty: ' + body);
  assert.ok(body.indexOf('Mission Two') >= 0, 'the next mission is named');
  assert.ok(body.indexOf('They send in') >= 0, 'the new obstacles are described');
  assert.ok(body.indexOf('Equip Area') >= 0, 'the reward is explained');
  const thumbs = map['equip-area-cards'].children;
  assert.ok(thumbs.some(function (c) { return c.className.indexOf('goal-card') >= 0; }), 'the completed mission card is laid sideways in the Equip Area');
});

test('clicking an Equip Area card zooms it to reading size with its rules', () => {
  const thumbs = map['equip-area-cards'].children;
  assert.ok(thumbs.length, 'the mission reward is equipped');
  const face = thumbs[thumbs.length - 1].children.find(function (c) { return c.className === 'thumb-face'; });
  assert.ok(face && face.tag === 'button', 'the equip thumbnail is a real button');
  assert.ok(String(face['aria-label']).indexOf('Zoom') >= 0, 'the button says what it does');
  face.click();
  assert.strictEqual(map.overlay.hidden, false, 'the zoom opens');
  assert.ok(map.overlay._classes.has('zoom'), 'the modal opens in zoom mode');
  assert.ok(map['modal-body'].children.some(function (c) { return c.tag === 'img'; }), 'the zoom shows the card art');
  const body = textOf(map['modal-body']);
  assert.ok(body.indexOf('Reward') >= 0, 'the zoom explains what the equipped item does: ' + body);
  assert.ok(body.indexOf('KEEP') >= 0, 'the zoom reminds the agent that items stay equipped');
  map['modal-close'].click();
  assert.ok(!map.overlay._classes.has('zoom'), 'closing clears the zoom class');
  assert.strictEqual(map.overlay.hidden, true);
});

test('the mission card in the side panel zooms and spells out the goal', () => {
  const mission = missions[UI.getState().missionIndex];
  map['goal-card-face'].click();
  assert.strictEqual(map.overlay.hidden, false, 'the mission card opens a zoom');
  assert.ok(map.overlay._classes.has('zoom'), 'it opens wide');
  const body = textOf(map['modal-body']);
  assert.ok(body.indexOf(mission.name) >= 0, 'the zoom names the mission in play');
  assert.ok(body.indexOf('whole goal') >= 0, 'the zoom restates how the goal is paid');
  assert.ok(map['modal-body'].children.some(function (c) { return c.tag === 'img'; }), 'the goal art comes up large');
  map['modal-close'].click();
});

test('a played card in the Play Area zooms instead of offering interactions', () => {
  const state = UI.getState();
  state.playArea = [{ uid: 'start_hide_0', defId: 'start_hide' }];
  UI.setState(state);
  const face = map['play-area-cards'].children[0].children.find(function (c) { return c.className === 'thumb-face'; });
  assert.ok(face, 'the play area thumbnail has a clickable face');
  face.click();
  assert.strictEqual(map.overlay.hidden, false, 'the zoom opens without an error');
  assert.ok(map.overlay._classes.has('zoom'));
  assert.ok(textOf(map['modal-body']).indexOf('folded back') >= 0, 'the zoom explains what happens to played cards');
  assert.strictEqual(map['modal-choices'].children.length, 0, 'nothing is offered for a card that is not in the line');
  map['modal-close'].click();
});

test('a card you cannot interact with still explains its cost instead of throwing', () => {
  const state = UI.getState();
  state.interactionsLeft = 0;
  UI.setState(state);
  map['line'].children[0].click();
  assert.strictEqual(map.overlay.hidden, false);
  const body = textOf(map['modal-body']);
  assert.ok(body.indexOf('Cost to interact') >= 0, 'the modal states the printed cost: ' + body);
  map['modal-close'].click();
});

test('the zoom modal is laid out wide enough to read the printed card', () => {
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  assert.ok(/\.overlay\.zoom \.modal \{ max-width: 620px/.test(css), 'zoom widens the modal');
  assert.ok(/\.overlay\.zoom \.modal-card \{ width: 460px/.test(css), 'the art is shown large');
  assert.ok(/\.goal-face \{[^}]*cursor: pointer/.test(css), 'the mission card is clickable');
});

test('the mission log reads newest event first', () => {
  const log = map['log'];
  const stamps = log.children
    .filter(function (c) { return c.className.indexOf('log-entry') >= 0; })
    .map(function (c) { return Number(textOf(c).match(/T(\d+)/)[1]); });
  assert.ok(stamps.length > 1, 'there are log entries to order');
  assert.ok(stamps.every(function (value, i) { return i === 0 || stamps[i - 1] >= value; }), 'turn stamps descend');
});

test('the Fast table switch turns the animation layer off', () => {
  map['fast-table'].click();
  assert.strictEqual(Table.isFast(), true, 'fast table on');
  assert.strictEqual(map['fast-table']['aria-checked'], 'true', 'the lever shows it');
  map['fast-table'].click();
  assert.strictEqual(Table.isFast(), false, 'fast table off again');
});

test('the Colonel is a drawn portrait, not clip art', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const svg = (html.match(/<svg class="colonel"[\s\S]*?<\/svg>/) || [''])[0];
  assert.ok(svg, 'the radio has a portrait');
  ['shoulders', 'shoulder-lit', 'shoulder-shadow', 'lapel', 'face-lit', 'face-shadow', 'cap', 'headset', 'mic', 'chevron', 'rim',
   'mouth-closed', 'mouth-mid', 'mouth-open'].forEach(function (part) {
    assert.ok(svg.indexOf('class="' + part + '"') >= 0, 'the portrait is missing ' + part);
  });
  assert.ok(!/<circle/.test(svg), 'no cartoon circles: the face is built from tonal planes');
  assert.ok(svg.indexOf('<g class="bust">') >= 0, 'the uniform is a set of planes, not a contour line');
  assert.ok(/viewBox="0 0 150 104"/.test(svg), 'the portrait is framed');
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  ['shoulders', 'lapel', 'face-lit', 'cap', 'head', 'tie'].forEach(function (part) {
    assert.ok(css.indexOf('.colonel .' + part + ' { fill: #') >= 0, part + ' is a flat fill in the key of the table');
  });
  assert.ok(css.indexOf('@keyframes speak') >= 0, 'the mouth has a speech cycle tied to the transmission');
  assert.ok(css.indexOf('prefers-reduced-motion') >= 0, 'the portrait stills when the player asks for stillness');
});

test('line cards carry their uid so the table layer can track them', () => {
  const line = map['line'];
  assert.ok(line.children.some(function (c) { return c['data-uid']; }), 'line slots are addressable by uid');
});

test('the music select switches the bed', () => {
  const select = map['music-track'];
  select.value = 'blackout';
  select.listeners.change();
  assert.strictEqual(Sound.currentTrack(), 'blackout');
  assert.strictEqual(__storage.items['agent-decker.music-track'], 'blackout');
});

test('switch levers are drawn, not hidden panels', () => {
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  assert.ok(/\.switch-lever::after\s*\{[^}]*position:\s*absolute/.test(css), 'the lever has a drawn stud');
  assert.ok(/\.switch\[aria-checked="true"\]/.test(css), 'the on state moves the stud and inks it');
});

test('the stylesheet is not a dashboard: no pills, no meters, no glows, no gradients', () => {
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  assert.ok(!/border-radius: ?(999|99|12|8|7|6)px/.test(css), 'rounded dashboard cards crept back in');
  assert.ok(!css.includes('gradient'), 'gradients crept back in');
  assert.ok(!css.includes('text-transform: uppercase'), 'blanket uppercase labels crept back in');
  assert.ok(!/\.chip/.test(css), 'chip/pill components are back');
  assert.ok(!/signal-dot|alarm-bar|alarm-fill/.test(css), 'the meter furniture is back');
  assert.ok((css.match(/@keyframes/g) || []).length <= 3, 'too much ambient animation');
  assert.ok(!/animation:[^;]*infinite/.test(css), 'nothing runs forever: every animation is tied to an event and finite');
});

test('the markup is zones on a table, not a stack of generic panels', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('▾'), 'caret menus are back');
  assert.ok(!html.includes('panel-head'), 'title-plus-subtitle panel headers are back');
  assert.ok(!html.includes('class="chip"'), 'resource pills are back');
  assert.ok(!html.includes('class="hint"'), 'the board explains itself in grey paragraphs');
  assert.ok(html.includes('class="zone '), 'the board is built from zones on a table');
});

test('the card modal is a lifted card with a typed slip, not a dialog box', () => {
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(/\.modal\s*\{[^}]*transform:\s*rotate/.test(css), 'the modal is tilted like a card picked up off the table');
  assert.ok(/\.modal-card\s*\{[^}]*box-shadow/.test(css), 'the card casts a contact shadow');
  assert.ok(/\.payment\s*\{[^}]*var\(--paper\)/.test(css), 'the payment details are printed on paper, not on the felt');
  assert.ok(html.includes('>Put it back<'), 'the modal is closed by putting the card back');
});

test('the brand is a printed deck back and the mission is a punch card', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  assert.ok(html.includes('class="brand-mark"'), 'the wordmark is drawn, not typed in a generic font');
  assert.ok(html.includes('class="mission-letter"'), 'the mission carries its corner letter');
  assert.ok(/\.mission-letter\s*\{[^}]*border: 1px solid var\(--warn\)/.test(css), 'the corner letter is stamped in ink');
});

test('the alarm gauge outweighs the header buttons — it is gameplay, not chrome', () => {
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const alarmType = Number((css.match(/\.alarm-value \{[^}]*font-size: ?(\d+)px/) || [0, 0])[1]);
  const buttonType = Number((css.match(/\.controls button \{[^}]*font-size: ?(\d+)px/) || [0, 99])[1]);
  assert.ok(alarmType >= buttonType * 2, 'the alarm number is only ' + alarmType + 'px against ' + buttonType + 'px buttons');
  assert.ok(/\.alarm \{[^}]*min-height: ?(5[0-9]|6\d)px/.test(css), 'the gauge is not taller than the buttons');
  assert.ok(/\.alarm \{[^}]*border-left: ?[5-9]px/.test(css), 'the gauge carries a printed edge rule');
  assert.ok(html.includes('alarm-lamp'), 'the gauge has a drawn lamp');
  assert.ok(html.includes('ruler-limit'), 'the ruler prints the 50 limit');
});

test('the mission log sits under the table, not beside it', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  assert.ok(html.indexOf('class="zone zone-agent"') < html.indexOf('class="zone zone-log"'),
    'the log is the last zone, under the line and the agent');
  assert.ok(!/\.zone-log \{[^}]*grid-column: 2/.test(css), 'the log is not parked in a right rail');
  assert.ok(/\.board \{[^}]*grid-template-columns: 1fr;/.test(css), 'the board is one column of zones');
});

test('hand cards are played, not lifted', () => {
  const js = readFileSync(new URL('../ui.js', import.meta.url), 'utf8');
  assert.ok(js.includes("button.textContent = 'Play';"), 'the hand button still says Play');
});

test('the line is a belt with a chute, and knocked-out cards are stamped', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  assert.ok(html.includes('class="belt"'), 'the line sits on a belt, not a bare grid');
  assert.ok(html.includes('belt-chute'), 'the belt has an exit chute at the right end');
  assert.ok(css.includes('.slot.face-down::after'), 'a knocked-out card carries a KO stamp');
  assert.ok(css.includes('.belt-chute'), 'the chute is drawn');
  assert.ok(css.includes('.area-equip::before'), 'the Equip Area has a folder tab');
  assert.ok(css.includes('.coach::before'), 'the coach note is taped to the table');
});

test('the copy is clipped briefing text, not chatbot voice', () => {
  const js = readFileSync(new URL('../ui.js', import.meta.url), 'utf8') +
    readFileSync(new URL('../tutorial.js', import.meta.url), 'utf8') +
    readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  ['Nice work', 'never saw it coming', 'Keep this open', 'everything else follows', 'housekeeping'].forEach(function (banned) {
    assert.ok(!js.includes(banned), 'banned phrase: ' + banned);
  });
});

test('every asset is cache-busted with the same token', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const tokens = html.match(/[?&]v=(\d+)/g).map(function (t) { return t.split('=')[1]; });
  assert.ok(tokens.length >= 10, 'assets must carry a cache token');
  assert.strictEqual(new Set(tokens).size, 1, 'mixed cache tokens: ' + Array.from(new Set(tokens)).join(', '));
});

test('a mission completion ends the turn, so the next mission starts a fresh one', () => {
  const state = UI.getState();
  assert.ok(state.log.some(function (entry) { return /begins \(turn \d+\)/.test(entry.text); }), 'the log stamps the new mission with a turn');
  assert.strictEqual(state.turn, state.log[state.log.length - 1].turn, 'the current turn is the newest turn');
});

test('the Bin opens when Waste Room is played and purges cards from the hand', () => {
  UI.init(cardDefs, missions, 7);
  const state = UI.getState();
  state.hand = [
    { uid: 'obs_waste_room_0', defId: 'obs_waste_room' },
    { uid: 'start_hide_0', defId: 'start_hide' },
    { uid: 'start_punch_0', defId: 'start_punch' }
  ];
  UI.setState(state);

  const hand = map['hand'];
  assert.ok(!hand.children.some(function (f) { return f.children.some(function (b) { return b.className === 'bin-btn'; }); }), 'no Bin before the card is played');

  const playButton = hand.children[0].children.find(function (b) { return b.className === 'play-btn'; });
  playButton.click();
  const after = UI.getState();
  assert.ok(after.bin, 'playing Waste Room opens the Bin');
  assert.strictEqual(after.bin.remaining, -1, 'the Waste Room Bin is unlimited');

  const binned = map['hand'].children[1].children.find(function (b) { return b.className === 'bin-btn'; });
  assert.ok(binned, 'hand cards get a Bin button');
  binned.click();

  const purged = UI.getState();
  assert.strictEqual(purged.hand.length, 1, 'the binned card left the hand (Waste Room itself went to the Play Area)');
  assert.strictEqual(purged.removed.length, 1, 'it is recorded in the Bin');
  assert.strictEqual(Number(map['bin-count'].textContent), 1, 'the Bin shows its count');
  assert.ok(map['bin-cards'].children.length === 1, 'the binned card is visible in the Bin');
  assert.ok(purged.removed[0].defId === 'start_punch', 'the right card was binned');
});

test('Undo rewinds the last move of the turn, move by move', () => {
  assert.ok(UI.canUndo(), 'there is something to undo');

  UI.undo();
  const back = UI.getState();
  assert.strictEqual(back.hand.length, 2, 'the binned card came back to hand');
  assert.strictEqual(back.removed.length, 0, 'the Bin is empty again');
  assert.ok(back.bin, 'the Bin is still open — the Waste Room play itself was not undone');

  UI.undo();
  const start = UI.getState();
  assert.strictEqual(start.hand.length, 3, 'the Waste Room play was rewound too');
  assert.strictEqual(start.bin, null, 'the Bin closed with it');
  assert.ok(!UI.canUndo(), 'the stack is empty');
});

test('Flammable Barrel opens the Bin over the discard pile', () => {
  UI.init(cardDefs, missions, 5);
  const state = UI.getState();
  state.hand = [{ uid: 'obs_flammable_barrel_0', defId: 'obs_flammable_barrel' }];
  state.discard = [{ uid: 'start_hide_0', defId: 'start_hide' }];
  UI.setState(state);
  map['hand'].children[0].children.find(function (b) { return b.className === 'play-btn'; }).click();
  const picks = map['bin-cards'].children.filter(function (f) {
    return f.children.some(function (b) { return b.className === 'bin-btn'; });
  });
  assert.strictEqual(picks.length, 1, 'the discard pile is shown in the Bin as purge candidates');
  picks[0].children.find(function (b) { return b.className === 'bin-btn'; }).click();
  assert.strictEqual(UI.getState().discard.length, 0, 'the binned discard card is gone for good');
});

test('Throw a Rock asks the player to choose instead of defaulting', () => {
  UI.init(cardDefs, missions, 4);
  const state = UI.getState();
  state.hand = [{ uid: 'obs_yard_door_0', defId: 'obs_yard_door' }];
  UI.setState(state);
  map['hand'].children[0].children.find(function (b) { return b.className === 'play-btn'; }).click();
  const labels = map['modal-choices'].children.map(function (b) { return b.textContent; });
  assert.ok(labels.some(function (l) { return l.indexOf('Take 1 Fighting') >= 0; }), 'the Fighting option is offered');
  assert.ok(labels.some(function (l) { return l.indexOf('Draw 1 card') >= 0; }), 'the draw option is offered');
  map['modal-choices'].children.find(function (b) { return b.textContent.indexOf('Draw 1 card') >= 0; }).click();
  const after = UI.getState();
  assert.strictEqual(after.resources.fighting, 0, 'taking the draw means no Fighting');
  assert.strictEqual(after.hand.length, 1, 'a card was drawn instead');
});

test('exit training actually hides the coach panel', () => {
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  assert.ok(/\.coach\[hidden\]\s*\{\s*display:\s*none/.test(css),
    'the coach is display:flex, so the hidden attribute alone leaves it on the board');
  UI.startTraining();
  assert.strictEqual(map['coach'].hidden, false, 'the coach is visible during training');
  UI.exitTraining();
  assert.ok(!UI.getState().tutorial, 'the run is no longer a training run');
  assert.strictEqual(map['coach'].hidden, true, 'the coach reports itself hidden');
  assert.ok(!map['end-turn'].disabled, 'and it stops gating the turn');
});

test('How to play is seven screens, not one wall of text', () => {
  UI.init(cardDefs, missions, 42);
  map['how-to-play'].click();
  assert.strictEqual(map['overlay'].hidden, false);
  assert.strictEqual(map['modal-title'].textContent, 'Five things to know');

  const help = map['modal-body'].children[0];
  const tabs = help.children.find(function (c) { return c.className === 'help-tabs'; });
  assert.ok(tabs, 'the help opens with a strip of screens');
  assert.strictEqual(tabs.children.length, 7, 'there are seven screens');
  assert.strictEqual(tabs.children.filter(function (c) { return c.className.indexOf('is-active') >= 0; }).length, 1,
    'exactly one screen is marked active');
  assert.ok(textOf(help).indexOf('locks down') >= 0, 'the first screen explains how the run ends');

  const nav = map['modal-choices'].children;
  assert.strictEqual(nav.length, 1, 'the first screen offers only Next');
  nav[0].click();
  const lede = map['modal-body'].children[0].children.find(function (c) { return c.className === 'help-lede'; });
  assert.ok(lede.textContent.indexOf('four steps') >= 0, 'the second screen walks the turn');

  const steps = map['modal-body'].children[0].children.find(function (c) { return c.className === 'help-steps'; });
  assert.ok(steps.children.length >= 4, 'each step of the turn is its own line');

  for (let i = 0; i < 6; i++) fire('keydown', { key: 'ArrowRight', preventDefault: function () {} });
  const last = map['modal-body'].children[0].children.find(function (c) { return c.className === 'help-flowchart'; });
  assert.ok(last, 'the last screen is the flowchart, on its own');
  assert.ok(last.children.some(function (c) { return c.tag === 'img' && c.src.indexOf('AgentDecker_turn_flowchart.svg') >= 0; }));
  assert.strictEqual(map['modal-choices'].children.length, 1, 'the last screen offers only Previous');
  fire('keydown', { key: 'ArrowLeft', preventDefault: function () {} });
  assert.ok(!map['modal-body'].children[0].children.some(function (c) { return c.className === 'help-flowchart'; }),
    'paging back leaves the flowchart screen');
  map['modal-close'].click();
  assert.strictEqual(map['overlay'].hidden, true, 'Close shuts the help');
});

test('a modal taller than the window still has a reachable Close button', () => {
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const modalRule = css.match(/\.modal\s*\{[^}]*\}/);
  assert.ok(modalRule && /max-height/.test(modalRule[0]), 'the modal caps its height to the viewport');
  assert.ok(modalRule && /overflow:\s*auto/.test(modalRule[0]), 'and scrolls inside itself');
  assert.ok(/\.overlay\s*\{[^}]*overflow:\s*auto/.test(css), 'the overlay can scroll too');
  assert.ok(/\.modal-head\s*\{[^}]*position:\s*sticky/.test(css), 'the header that carries Close is sticky');
  assert.ok(/<div class="modal-head">[\s\S]{0,200}?<button id="modal-close"/.test(html),
    'Close sits in the header, above the scrolling body, so it is never below the fold');
  assert.ok(/\.help-flowchart img\s*\{[^}]*max-height/.test(css), 'the flowchart is scaled to the screen, not printed full size');
});

test('the coach’s Why? opens the screen that explains the step it is asking for', () => {
  UI.startTraining();
  map['coach-how'].click();
  assert.strictEqual(map['modal-title'].textContent, 'Your turn in four steps',
    'the coach wants the player to play their hand, so the turn screen opens');
  map['modal-close'].click();
  assert.strictEqual(map['overlay'].hidden, true);

  UI.showHelp(3);
  assert.ok(map['modal-title'].textContent.indexOf('conveyor') >= 0, 'screens can be opened by number too');
});

/* ---------- homebase radio ---------- */

test('the radio set is bolted under the draw deck, not floating in a panel', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
  assert.ok(html.indexOf('class="deck-panel"') < html.indexOf('class="radio-set"'), 'the set sits below the deck');
  assert.ok(/class="left-rail"[\s\S]{0,400}class="deck-panel"/.test(html), 'the deck and the radio share one rail');
  assert.ok(/\.radio-set\s*\{[^}]*border-radius:\s*2px/.test(css), 'the case has square corners like the rest of the table');
  assert.ok(/id="colonel"/.test(html) && /mouth-open/.test(html), 'the portrait has mouths to animate');
  assert.ok(/class="radio-screen"/.test(html), 'the portrait lives behind a screen');
});

test('Homebase is silent until the link switch is on', () => {
  UI.init(cardDefs, missions, 11);
  assert.ok(map['call-homebase'].disabled, 'no link, no call');
  map['radio-link'].click();
  assert.strictEqual(map['radio-link']['aria-checked'], 'true', 'the lever announces itself');
  assert.ok(!map['call-homebase'].disabled, 'the call button wakes up');
  assert.ok(map['radio']['_classes'].has('is-live'), 'the set is lit');
});

test('a call transmits in lines and chalks the cards it means', () => {
  UI.init(cardDefs, missions, 11);
  map['radio-link'].click();
  map['call-homebase'].click();
  const lines = map['radio-readout'].children;
  assert.ok(lines.length >= 2, 'the transmission is more than a grunt');
  assert.strictEqual(lines[lines.length - 1].textContent, 'Over.', 'every transmission signs off');
  assert.ok(lines.every((line) => line.textContent.length <= 110), 'no line is a paragraph');
  assert.ok(playedSounds.includes('radioCall'), 'the set chirps when it keys up');
  assert.ok(map['radio']['_classes'].has('is-transmitting'), 'the mouth moves while it is on the air');
  const chalked = map.line.children.filter((node) => (node.className || '').includes('radio-mark'));
  assert.ok(chalked.length >= 1, 'the belt carries the marks');
  assert.ok(!map.hand.children.some((node) => (node.className || '').includes('radio-mark')),
    'the hand is never chalked: player cards are not a decision');
  const beltWords = ['belt', 'chute', 'Disarm', 'down'];
  const copy = lines.map((line) => line.textContent).join(' ');
  assert.ok(beltWords.some((w) => copy.includes(w)), 'the transmission is about the belt: ' + copy);
  assert.ok(!map['radio-why'].disabled, 'the reasoning is one click away');
});

test('the Plain switch trades the slang for the mechanics', () => {
  UI.init(cardDefs, missions, 11);
  map['radio-link'].click();
  map['radio-plain'].click();
  map['call-homebase'].click();
  assert.strictEqual(map['radio-plain']['aria-checked'], 'true');
  const lines = map['radio-readout'].children.map((line) => line.textContent);
  assert.ok(lines.some((line) => /Disarm|Knock out|Mission Check|Play |End Turn/.test(line)),
    'plain register names the actual buttons');
});

test('a second call on the same position says Again and does not repeat the brief', () => {
  UI.init(cardDefs, missions, 11);
  map['radio-link'].click();
  map['call-homebase'].click();
  assert.strictEqual(map['call-homebase'].textContent, 'Again', 'nothing changed, so nothing new to say');
  const first = map['radio-readout'].children.map((line) => line.textContent).join('|');
  map['call-homebase'].click();
  const second = map['radio-readout'].children.map((line) => line.textContent).join('|');
  assert.strictEqual(first, second, 'the same position gets the same advice');
});

test('the Colonel only speaks when asked: no advice lands on the board without a call', () => {
  UI.init(cardDefs, missions, 11);
  const anyMark = map.hand.children.concat(map.line.children)
    .filter((node) => (node.className || '').includes('radio-mark'));
  assert.strictEqual(anyMark.length, 0, 'with the link off, nothing is chalked');
  assert.ok(map['radio-readout'].children.length === 1, 'the readout shows the idle line');
});

test('the Colonel is explained in How to Play and answers the C key', () => {
  const js = readFileSync(new URL('../ui.js', import.meta.url), 'utf8');
  assert.ok(/short: 'Radio'/.test(js), 'How to Play has a screen about the radio');
  UI.init(cardDefs, missions, 21);
  map['modal-close'].click();
  map['radio-link'].click();
  fire('keydown', { key: 'c' });
  assert.ok(map['radio-readout'].children.length > 1, 'the keyboard keys the set up');
  UI.init(cardDefs, missions, 21);
  fire('keydown', { key: 'c' });
  assert.strictEqual(map['radio-readout'].children.length, 1, 'with the link off, C says nothing');
});

/* --- designer bug reports (2026-11-20) ------------------------------------- */

test('a Yard Door with an empty draw deck still plays: the choice comes first', () => {
  UI.init(cardDefs, missions, 4);
  const state = UI.getState();
  state.hand = [{ uid: 'obs_yard_door_0', defId: 'obs_yard_door' }];
  state.deck = [];
  state.discard = [];
  UI.setState(state);
  const button = map['hand'].children[0].children.find((b) => b.className === 'play-btn');
  button.click();
  const labels = map['modal-choices'].children.map((b) => b.textContent);
  assert.ok(labels.some((l) => l.indexOf('Take 1 Fighting') >= 0), 'Throw a Rock offers its Fighting');
  assert.ok(!labels.some((l) => l.indexOf('Draw 1 card') >= 0), 'with nothing left to draw the draw is not offered');
  map['modal-choices'].children.find((b) => b.textContent.indexOf('Take 1 Fighting') >= 0).click();
  const after = UI.getState();
  assert.strictEqual(after.resources.fighting, 1, 'the resource is paid');
  assert.strictEqual(after.hand.length, 0, 'the card left the hand');
});

test('the hand and the Equip Area read the top half of the card, the belt the bottom half', () => {
  UI.init(cardDefs, missions, 4);
  const state = UI.getState();
  state.hand = [{ uid: 'obs_yard_door_0', defId: 'obs_yard_door' }, { uid: 'obs_infimary_0', defId: 'obs_infimary' }];
  UI.setState(state);
  const captions = map['hand'].children.map((fig) => fig.children.find((c) => c.tag === 'figcaption').textContent);
  assert.deepStrictEqual(captions, ['Throw a Rock', 'Chloroform'], 'the agent calls the card by the thing it got');
  const label = map['hand'].children[0].children.find((b) => b.className === 'play-btn')['aria-label'];
  assert.strictEqual(label, 'Play Throw a Rock from your hand');
  map['hand'].children[0].children.find((b) => b.className === 'play-btn').click();
  map['modal-choices'].children.find((b) => b.textContent.indexOf('Take 1 Fighting') >= 0).click();
  const played = UI.getState().log.slice(-1)[0].text;
  assert.ok(played.indexOf('Throw a Rock') >= 0, 'the mission log uses the item name: ' + played);
  const belt = UI.getState().line.filter(Boolean)[0];
  assert.ok(textOf(map['line']).indexOf(registry[belt.defId].name) >= 0, 'the belt still names the obstacle');
});

test('the training run never overwrites the campaign, and Exit training gives it back', () => {
  UI.init(cardDefs, missions, 42);
  map['hand'].children[0].children.find((b) => b.className === 'play-btn').click();
  const left = JSON.parse(JSON.stringify(UI.getState()));
  assert.ok(globalThis.Save.loadGame(), 'the campaign was saved before the coach started');
  map['training-run'].click();
  assert.strictEqual(UI.getState().seed, 19, 'the coach runs on its own fixed board');
  assert.ok(UI.getState().tutorial, 'the coach is on');
  assert.ok(map['coach-exit'].textContent === 'Back to my campaign', 'the exit says where it goes');
  assert.strictEqual(globalThis.Save.loadGame().state.seed, 42, 'the training run does not clobber the save');
  map['coach-exit'].click();
  const back = UI.getState();
  assert.strictEqual(back.seed, 42, 'Exit training returns to the board you left');
  assert.ok(!back.tutorial, 'and the coach is off');
  assert.strictEqual(map['coach'].hidden, true, 'the coach panel is gone');
  assert.strictEqual(back.playArea.length, left.playArea.length, 'the position is exactly as it was');
});

test('the mission slip and the coach follow the mission the agent is on', () => {
  UI.init(cardDefs, missions, 42);
  map['training-run'].click();
  const state = UI.getState();
  state.resources = { stealth: 6, fighting: 0 };
  state.sources = [];
  UI.setState(state);
  map['mission-check'].click();
  assert.strictEqual(UI.getState().missionIndex, 1, 'Mission One is closed');
  assert.strictEqual(map['mission-banner'].querySelector('.mission-name').textContent, 'Mission Two');
  assert.strictEqual(map['mission-banner'].querySelector('.mission-goal').textContent, 'Goal: Get 6 Fighting & the Guard Uniform');
  assert.strictEqual(map['mission-banner'].querySelector('.mission-letter').textContent, 'C');
  const coach = map['coach-title'].textContent + ' ' + map['coach-text'].textContent;
  assert.ok(coach.indexOf('Mission One is a warm-up') < 0, 'the coach stops quoting a mission that is done');
  assert.ok(coach.indexOf('Training complete') >= 0, 'it tells the agent the training is over');
  assert.ok(!map['coach'].hidden, 'the coach is still on the board during the training run');
});

test('a game over clears the resume slot so a dead run cannot come back', () => {
  UI.init(cardDefs, missions, 31);
  const state = UI.getState();
  state.alarm = 49;
  state.line = [null, null, null, null, null, { uid: 'obs_guard_0', defId: 'obs_guard' }];
  UI.setState(state);
  map['end-turn'].click();
  assert.strictEqual(UI.getState().gameOver, 'alarm', 'the alarm hit fifty');
  assert.strictEqual(globalThis.Save.loadGame(), null, 'nothing is left to resume');
});

test('a resume restores the whole position, not just part of it', () => {
  UI.init(cardDefs, missions, 71);
  const state = UI.getState();
  state.alarm = 23;
  state.resources = { stealth: 7, fighting: 12 };
  state.sources = [{ uid: 'obs_guard_0', name: 'Guard', stealth: 0, fighting: 2 }];
  state.hand = [{ uid: 'obs_hide_0', defId: 'start_hide' }];
  UI.setState(state);
  UI.init(cardDefs, missions);
  const back = UI.getState();
  assert.strictEqual(back.alarm, 23, 'the alarm comes back where it was');
  assert.strictEqual(back.resources.stealth, 7, 'so do the resources');
  assert.strictEqual(back.resources.fighting, 12);
  assert.strictEqual(back.hand.length, 1, 'and the hand is the hand you had');
  assert.strictEqual(String(map['alarm-value'].textContent), '23');
  assert.strictEqual(String(map['res-stealth'].textContent), '7');
});
