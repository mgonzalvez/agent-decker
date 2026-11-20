# Agent Decker — browser player

A static, offline-friendly implementation of **Agent Decker**, the solo deckbuilding game by
**Manuel Correia** ([gamesbymanuel.com](https://gamesbymanuel.com)), licensed **CC BY-NC 4.0**.

Play all five missions in any modern browser. No accounts, no server, no build step — plain
HTML/CSS/JS served by GitHub Pages.

![tests](https://github.com/mgonzalvez/agent-decker/actions/workflows/test.yml/badge.svg)

**Live game:** https://mgonzalvez.github.io/agent-decker/

> Unofficial implementation for personal play. It is not for sale; all rules, design and artwork
> remain © Manuel Correia.

## Play it locally

```bash
python3 -m http.server 8000      # open http://127.0.0.1:8000
node --test js/tests/*.test.mjs  # 197 tests: rules, invariants, campaign, UI, audio, table animation, the advisor
```

- `?seed=12345` gives a reproducible shuffle; **Replay this seed** re-runs the same game.
- The game auto-saves to `localStorage` after every move, so refreshing resumes it.
- **Learn → Training run** is a guided first mission (fixed seed) with a coach that gates each step.
- **Undo** (or Ctrl+Z) rewinds any move made in the current turn.
- **Homebase radio** (under the draw deck): flip **Link**, press **Call Homebase** or the **C** key, and the Colonel
  reads the position and suggests a line of play. He marks the cards he means; he never presses a button for you.

## The turn, in five steps

1. **Use Cards** — play any number of hand cards to generate Stealth / Fighting.
2. **Interact** — pay an obstacle's cost, then **Disarm** (take it; KEEP items go to the Equip Area)
   or **Knock Out** (face down in the line: no alarm, type and effect ignored). One interaction per
   turn to start; mission rewards raise the limit.
3. **Mission Check** — the whole goal must be paid in a single turn.
4. **Line Scroll** — the rightmost card in the line exits and raises the alarm by its value.
5. **Card Refresh** — refill the line to 6, discard your hand and Play Area (KEEP items stay), draw
   a fresh hand. Unspent resources evaporate.

Alarm reaches **50** → game over. The line failing to refill to 6 (even after reshuffling the
obstacle discard) also ends the run. Score = alarm at the end of each mission, summed; **lower is
better**.

## Layout

```
index.html              the game (one page)
css/styles.css          layout, card styling, animation
js/state.js             seeded, serializable state + invariant checks
js/engine.js            pure rules engine (no DOM, injectable RNG)
js/actions.js           player intent → engine
js/ui.js                board rendering, modals, zoom, accessibility
js/table.js             card movement animation replayed from engine events
js/audio.js             synthesized Web Audio SFX + five music beds (muted by default)
js/tutorial.js          the Training Run coach
js/save.js              localStorage save/continue + best-score log
js/data/cards.json      38 definitions = 54 physical cards, with printed text
js/data/missions.json   five missions: goals, letters A–I, rewards
js/data/effects-notes.md designer clarifications (C1–C10) + flagged interpretations
js/tests/               node:test suites
assets/cards/           54 card crops + deck back, from the printed PDFs
assets/fonts/           self-hosted OFL fonts
assets/ui/              felt texture and other drawn UI pieces
upstream/               original print-and-play source (read-only)
docs/                   flowchart, card audit, table spec, video validation, art direction
PLAN.md                 mechanics, architecture, milestones
AGENTS.md               contributor guidelines
```

## Where the rules come from

1. `js/data/effects-notes.md` — the engine-facing rules reference: designer clarifications plus
   every case where the printed wording was ambiguous and a call had to be made.
2. `upstream/AgentDecker_rules.md` (2015-09-27) and `upstream/AgentDecker_player_aid.md`.
3. `upstream/AgentDecker_cards_full_art.pdf` / `upstream/cards/fronts/` — the printed fronts,
   transcribed card by card into `js/data/cards.json`.
4. `docs/card-effect-audit.md` — the card-by-card audit and the BoardGameGeek rulings.
5. `docs/video-validation.md` + `docs/transcript-how-to-play.txt` — rules cross-checked against the
   designer's playthrough.

If a card behaves unexpectedly, check `js/data/effects-notes.md` before filing a bug.

## House rules

Off by default, toggleable in **Table & audio**:

- **Quick Hands** — equipping an item grants one extra interaction that turn. Not in the printed
  rules; a faithful play of the game should leave it off.

## Known limitations

- Responsive down to phone widths, but no device-specific mobile QA pass yet.
- Undo is limited to moves made in the current turn (20 snapshots).
- All sound is synthesized in Web Audio; no audio files ship with the site.

## Deploy & CI

GitHub Pages serves the repository root from `main`; `.github/workflows/test.yml` runs the test suite
on every push. There is no dependency install and no CDN — every asset is committed.

Every asset is cache-busted with one shared `?v=NN` token. Bump it in `index.html` whenever CSS or JS
changes (a test fails if the tokens ever disagree).

## License

Game design, rules and artwork: © Manuel Correia, CC BY-NC 4.0. This implementation is shared under
the same licence, so nothing here can be commercialised.
