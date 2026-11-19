# Agent Decker (Web) — Agent Guidelines

A **static browser player for Agent Decker**, the solo deckbuilding game by Manuel Correia, deployed
to **GitHub Pages** at https://mgonzalvez.github.io/agent-decker/ . This folder is the site root.

`PLAN.md` is the design record (mechanics, architecture, milestones). This file is the operative
guide: what is true *now* and how to change it.

**Never modify `upstream/`.** Derived documents go in `docs/`, game data in `js/data/`, art in
`assets/`. No stray files at the root.

## Source documents (read-only truth)

| File | Purpose |
|------|---------|
| `js/data/effects-notes.md` | **Engine-facing rules reference** — designer clarifications C1–C10 plus flagged interpretations. Check here before coding a rule. |
| `upstream/AgentDecker_rules.md` | Canonical rules text (2015-09-27; includes the "always reshuffle, game over only if the line still can't be filled" clarification). |
| `upstream/AgentDecker_player_aid.md` | Condensed turn sequence — the basis of the flowchart. |
| `upstream/AgentDecker_rules_full_art.pdf` | Older (Oct 2015) art rules spread; the `.md` wins on conflict. |
| `upstream/AgentDecker_cards_full_art.pdf` + `upstream/cards/fronts/` | The 54 printed card fronts — the only source of card data. PDF text extraction is unreliable; read the rendered images. |
| `docs/card-effect-audit.md` | Card-by-card audit vs. the print, including BoardGameGeek rulings. |
| `docs/video-validation.md` (+ transcript) | Rules checked against the designer's playthrough. |
| `docs/AgentDecker_turn_flowchart.svg` / `.png` | Player aid for turn order; kept in sync with adopted clarifications. |

## Key rules (quick reference)

- **Turn:** 1 Use Cards → 2 Mission Check (pay the **whole** goal this turn?) → 3 Line Scroll (the
  rightmost card exits, alarm + its value) → 4 Card Refresh (line back to 6; discard hand + Play
  Area; draw a hand; **unspent resources evaporate**).
- **Alarm:** 0–50, resets each mission. **50 = game over.**
- **The Line:** six slots, conveyor. A disarmed card leaves a hole; cards slide right to fill holes;
  new obstacles enter at the left at Card Refresh. Adjacency is measured in slots, so a hole breaks
  it. The line is dealt from the right.
- **Interact:** pay the printed cost → **Disarm** (to the Play Area, or the Equip Area if it has a
  KEEP icon) or **Knock Out** (face down in place: no alarm, type and effect ignored). 1 interaction
  per turn initially; mission rewards raise the limit.
- **Type gating is strict:** an equipped item pays an interaction only when its printed icon matches
  the obstacle (**Keycard → door, Chloroform → person, E.M.P. → equipment**); `AgentDecker.validateTypes()`
  fails the suite if an effect names an unknown icon or omits one.
- **KEEP items** never sit in hand: a drawn item goes straight to the Equip Area and the hand still
  fills to its size. They are exempt from the refresh discard; the only way one leaves play is being
  deliberately used for its effect (→ discard, re-equippable when redrawn) (C9). Once-per-turn
  resources (Map, Guard Uniform, Prisoner) fire on equipping and again at every Card Refresh.
- **Mission goals** can require equipped items (Mission 2: 6 Fighting **and** Guard Uniform) and must
  be satisfied in a single Mission Check. Completing a mission **ends the turn**.
- **Score:** alarm at each mission's end, summed. Lower is better.

## File layout (as built)

```
index.html             the game
css/styles.css
js/  state.js engine.js actions.js ui.js table.js audio.js tutorial.js save.js main.js
     advisor.js radio.js   (homebase radio: the brain and the voice)
     data/ cards.json missions.json effects-notes.md
     tests/ *.test.mjs
assets/ cards/ (54 crops + back.jpg) fonts/ ui/ favicon.png
docs/ flowchart, card-effect-audit.md, table-physics-spec.md, video-validation.md,
      transcript, digital-conversion-best-practices.md (retrospective)
upstream/ print-and-play source (never edit)
PLAN.md  AGENTS.md  README.md
```

## Conventions

- **No frameworks, no build step, no `package.json`.** Vanilla HTML/CSS/JS, committed files only.
  `node --test js/tests/*.test.mjs` is the whole toolchain (184 tests).
- **`engine.js` is pure:** state in → new state out. No DOM, no `Math.random` (injectable seeded RNG).
  The UI reads state; it never mutates rules.
- **Data-driven cards.** A new effect = a descriptor in `cards.json` + one handler in the engine.
  Never special-case a card id in engine code. Schema: `id, set, name, obstacleType,
  cost {stealth, fighting, either}, alarm, keep, reward, effect, sound, missionLetter`.
- **House rules are opt-in** and documented in `js/data/effects-notes.md`. Never make a deviation the
  default.
- **Cache token:** every asset in `index.html` carries the same `?v=NN`. Bump it when CSS/JS changes;
  a test fails if the tokens disagree.
- **Credit is mandatory** (CC BY-NC 4.0): "Agent Decker by Manuel Correia — gamesbymanuel.com" in the
  UI and README. **No monetization, ever.**
- Commit messages end with the PR number, e.g. `… (#32)`.

## What is implemented

- **Campaign:** all five missions, rewards, both loss states (alarm 50, line unfillable), score
  screen, seeded replay.
- **Effects:** every card definition has an engine handler; choice-driven effects (Recall, Plan Ahead,
  Just The Thing, Foresight, Distraction) prompt in the UI.
- **Undo + Bin:** per-turn snapshot stack (`UNDO_LIMIT 20`); Waste Room / Flammable Barrel open a
  visible Bin of cards removed from the game for good (`state.removed`).
- **Table animation** (`js/table.js`): the engine emits `state.events` and the view replays deals,
  slides, exits, draws and plays with matching synthesized cues. **Fast table** and
  `prefers-reduced-motion` turn it off. Spec: `docs/table-physics-spec.md`.
- **Audio** (`js/audio.js`): diegetic per-card SFX (`sound` field in `cards.json`) and five music beds;
  muted by default, toggles in the top bar. `js/audio/render.mjs` + `js/data/score.json` render the
  score offline in Node for measuring before wiring it in.
- **Training run** (`js/tutorial.js`): fixed-seed guided mission with a coach that gates each action;
  **How to play** is seven short screens plus the turn flowchart.
- **Homebase radio** (`js/advisor.js` + `js/radio.js`, wired in `ui.js`): a field set under the
  draw deck. `Link` keys the set up, `Call Homebase` (or `C`) runs the beam search over every
  legal line of play for the position and transmits the best one; `Plain` swaps the slang for
  the printed mechanics, `Full plan` spells out the whole turn instead of the decisive move.
  The Colonel never presses a button — he chalk-marks the cards he is talking about. Advice goes
  stale the instant the position changes. `Why?` opens the plan and its arithmetic in the zoom
  modal. Tuning bench: `node js/tests/advisor-sweep.mjs`; head-to-head vs casual play:
  `node js/tests/advisor-baseline.mjs`. Design record: `docs/radio-advisor-spec.md`.
- **Persistence:** `js/save.js` saves to localStorage after every move and keeps best scores.
- **Zoom:** Equip Area, Play Area and the current mission card open at reading size
  (`UI.openZoom`, `overlay.zoom`).

## Open work

- **Art-direction rework** — plan, hallmarks list and rubric: `docs/ui-art-direction.md`. PRs 1-6
  landed: palette and felt texture sampled from the card art, no chips/panel headers/meters/glows,
  2 px corners, mixed-case stencil headings, zones stacked on the felt with the line as a belted
  conveyor (rails, tiled rollers, exit chute), KO stamps on face-down cards, a folder tab on the
  Equip Area, a taped coach note, a wire-copy Mission Log under the board. The top bar has no
  dropdowns: Learn is a row of tabs, Sound/Music/Fast table/Quick hands are drawn two-stop switches,
  and the family links live in the footer. The brand is an SVG deck back and the mission is a punch
  card with a stamped corner letter. Play buttons stay labelled "Play" — the "Lift" experiment read
  as a disabled control. The alarm is a gauge in the header (drawn lamp, stencil number, printed
  ruler with the 50 limit marked in red) and deliberately outweighs the header buttons.
- Full mobile QA pass on a real device (headless checks at 390 px pass; real-device feel untested).
- Replaying each engine event as a separate visible step (today one action animates as a composite).
- More FX polish.

## Constraints

- Must run from a cold static host: no server APIs, no Node at runtime, no CDNs for core logic.
- Keep `docs/AgentDecker_turn_flowchart.svg` in sync with any clarification we adopt.
- Rules text vs. PDFs: the 2015-09-27 `.md` wins. When wording is ambiguous, document the
  interpretation in `js/data/effects-notes.md` and default to the most conservative reading.

## Registry & analytics (portfolio-wide)

- Personal project, separate from Apple work. `.npmrc` pins `registry=https://registry.npmjs.org` so
  a future `npm install` can never write an Apple-mirror lockfile that CI cannot reach.
- The site is served from `mgonzalvez.github.io/agent-decker/`, which is not Cloudflare-proxied, so a
  Cloudflare Web Analytics beacon is deliberately absent. If the game moves to a proxied domain, add
  a beacon with a real token before `</body>`.
