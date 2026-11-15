# Agent Decker (Web) — Agent Guidelines

## Project Overview

A **static web player for Agent Decker**, a solo deckbuilding game by Manuel Correia. The goal is a website hosted on **GitHub Pages** where a player can play the full 5-mission campaign in the browser.

**This folder is the project root and the eventual GitHub Pages site root.** Original game materials live in `upstream/` (never modify); derived documents (flowchart) live in `docs/`; the web app is built at the root per `PLAN.md`.

**Read `PLAN.md` first** — it contains the full mechanics understanding, architecture, data schema, milestones (M1–M7), and verification strategy. Do not redesign architecture without updating it.

## Source Documents (read-only truth)

| File | Purpose |
|------|---------|
| `upstream/AgentDecker_rules.md` | Canonical rules (text). Edited 2015-09-27 — includes the newer "always reshuffle, game over only if still can't fill the line" clarification. |
| `upstream/AgentDecker_player_aid.md` | Condensed turn sequence (basis for the flowchart). |
| `upstream/AgentDecker_rules_full_art.pdf` | 2-page art rules spread (older, Oct 2015 — the `.md` wins on conflicts). |
| `upstream/AgentDecker_cards_full_art.pdf` | **Full 54-card set with art** — the only source of card data. Text extraction is unreliable (icons lost); render pages as images and read them. |
| `js/data/effects-notes.md` | **Engine-facing rules reference** — designer clarifications (C1–C9) + flagged interpretations. Check here before coding any rule. |
| `docs/video-validation.md` | Validation of rules/aid/flowchart against the designer's playthrough video; transcript in `docs/transcript-how-to-play.txt`. |
| `docs/AgentDecker_turn_flowchart.svg` / `.png` | Visual turn-sequence player aid (derived from the player aid; reflects clarifications C1/C2). |

## Key Rules (quick reference)

- **Turn:** 1 Use Cards (play hand → Stealth/Fighting → pay obstacle cost → Disarm or Knock Out) → 2 Mission Check (pay the **whole** goal this turn? complete mission : continue) → 3 Line Scroll (rightmost card exits, alarm + its value; slide) → 4 Card Refresh (line to 6; discard hand + Play Area; draw 4; **unspent resources evaporate**).
- **Alarm:** two tokens, 0–50; **50 = game over**. Resets between missions.
- **Line:** 6 cards, conveyor (exits right, refills left).
- **Disarm** → Play Area (or Equip Area if KEEP icon). **Knock Out** → face down in line, raises no alarm, type/effect ignored. Each counts as one interaction (1/turn initially; reward items can raise it). **KEEP cards are persistent** — exempt from the turn-end refresh discard; the only way one leaves play is a deliberate use for its effect (→ discard pile, re-equippable when redrawn) (C9).
- **Resources** are per-turn only: unspent Stealth/Fighting evaporate at Card Refresh; nothing accumulates between turns.
- **KEEP items never sit in hand** — a drawn item goes straight to the Equip Area and the hand still fills to 4 (5 later). Equipped items fire their per-turn bonus at Card Refresh (Map/Guard Uniform/Prisoner give resources, Siren draws 1 per item, max 3). Keycard/Chloroform/E.M.P. can be spent to interact without paying the cost.
- **Mission goals** can require items (e.g. M2: 6 Fighting + Guard Uniform **equipped**); the entire goal must be satisfied in a single Mission Check.
- **Top half** of a card = what it generates when played from hand (in the line, only the bottom half is active).
- **Mission progression:** Reward (→ Equip) → inject next mission's obstacles → reshuffle obstacles+line+deck, draw 6 → alarm to 0 → reshuffle player deck (Equip stays) → draw 4.
- **Game over:** alarm 50, or line can't reach 6 even after reshuffling discard.
- **Score:** sum of alarm values at each mission's end — **lower is better**.

## Planned File Layout

```
/
├── index.html               # the game (single page)
├── css/styles.css
├── js/
│   ├── data/cards.json      # all 54 cards
│   ├── data/missions.json   # 5 missions: goals (resources + item reqs), letters A–E, rewards
│   ├── data/effects-notes.md # clarifications C1–C8 + interpretations (rules reference)
│   ├── state.js             # serializable game state + setup
│   ├── engine.js            # PURE rules (no DOM, injectable RNG)
│   ├── actions.js           # player input → engine
│   ├── ui.js                # board rendering, modals, animations
│   ├── tutorial.js          # state-driven coach for the Training Run
│   ├── save.js              # localStorage save/continue, score log
│   └── main.js
├── assets/cards/            # art crops from the full-art PDF
├── upstream/                # original print-and-play source (NEVER modify)
├── docs/                    # derived documents (turn flowchart, etc.)
└── AGENTS.md  PLAN.md
```

## Conventions

- **No frameworks, no build step, no `package.json` required.** Vanilla HTML/CSS/JS, committed files only, GitHub Pages as the host. (A local static server like `python3 -m http.server` is fine for dev.)
- **`engine.js` is pure:** state in → new state out. No DOM, no `Math.random` (injectable seeded RNG). UI reads state; it never mutates rules.
- **House rules are opt-in.** `state.rules.quickHands` (Quick Hands: equipping an item grants an extra interaction that turn) is a documented deviation in `js/data/effects-notes.md`, off by default. Never make a deviation the default without recording it.
- **Data-driven cards.** New card effect = new effect descriptor in JSON + one handler in engine. Never special-case a card id in engine code.
- **Card data schema** lives in `PLAN.md` §2 — `id, set, name, obstacleType, cost {stealth, fighting, either}, alarm, keep, reward, effect, missionLetter`.
- **JSON over CSV** for game data (nested costs/effects don't fit tabular).
- **Credit is mandatory** (CC BY-NC 4.0): "Agent Decker by Manuel Correia — gamesbymanuel.com" must appear in the UI (about screen/footer) and README. **No monetization, ever.**

## Milestones (see PLAN.md §4 for exit criteria)

M1 transcribe card DB → M2 static board → M3 one full turn → M4 effect handlers → M5 campaign → M6 polish (save, replay, a11y) → M7 GitHub Pages ship.

**Current status: M1–M6 complete** — card DB (`js/data/cards.json`, 38 definitions / 54 cards) and `js/data/missions.json`; static board (`index.html`, `css/styles.css`, `js/state.js`, `js/ui.js`, `js/main.js`) plus the turn loop (`js/engine.js`, `js/actions.js`): play cards, pay costs, Disarm/Knock Out, Line Scroll, Card Refresh, Mission Check/progression, alarm & game-over. Every card effect is transcribed into `cards.json` and has an engine handler; choice-driven effects (Recall, Plan Ahead, Just The Thing, Foresight, Distraction) prompt in the UI. Campaign progression, both loss states and the end-of-campaign score screen are in (`js/tests/campaign.test.mjs`). Tests: `node --test js/tests/*.test.mjs` (104 passing). M6 is in: `js/save.js` (resume + score log in localStorage), `js/audio.js` (synthesized SFX, muted by default; two-phrase, four-channel PSG-style beds (pulse lead, pulse arps, triangle bass, quantised noise drums, feedback echo) — five selectable spy beds — Nightline Shunt, Cold War Waltz, Dead Drop, Safehouse Shuffle, Blackout March — chosen from the top-bar select and remembered in localStorage), keyboard-accessible cards, Escape-to-close, aria-live alarm/log, About screen with credit + best scores, Replay-this-seed. **M7 shipped**: repo + README + CI + GitHub Pages live at https://mgonzalvez.github.io/agent-decker/. Polish pass in progress: P1 self-hosted OFL fonts + dossier theme/FX (`assets/fonts/`), P2 the Training Run (`js/tutorial.js`, fixed seed 19, coach panel gates each action), ambient Web Audio drone tied to the alarm, mobile mini-card line, and the turn flowchart embedded in How to Play. Also in: dossier-panel layout (`The Line` / `The Agent` / `Mission Log` panels with amber hairlines), alarm gauge with green→amber→red stages and a flashing critical badge, a top-bar signal dot mirroring the alarm, End Turn/Mission Check glow when they are the only move, green rings on every line card you can afford, and a higher-contrast modal Close button. Type gating is strict: an item pays an interaction only when its printed icon matches the obstacle type (**Keycard → door**, **Chloroform → person**, **E.M.P. → equipment**), a face-down card is ignored for type and effect (Watchtower, Hawk, Sniper, Guard Dog, Radio Tower, Dormitory), and `AgentDecker.validateTypes()` fails the test suite if any effect names an unknown icon or omits one. The engine emits a replayable `state.events` stream and `js/table.js` turns it into card movement (`js/table.js`): the opening line is dealt card by card from the right, a short line is right-aligned so the conveyor reads correctly, scrolled cards slide, the exiting card tips off the edge as a ghost, drawn cards flick into the hand, played cards travel to the Play/Equip Areas — each with a matching synthesized cue (`deal`, `slide`, `scroll`, `exit`, `draw`). A top-bar **Fast table** toggle (persisted in localStorage) turns the animation and SFX off, and `prefers-reduced-motion` is respected. Spec: `docs/table-physics-spec.md`, and the **Mission Log** is a newest-first, turn-stamped narrative (`{ turn, kind, text }`) covering the agent's moves *and* the line's own behaviour (deals, slides, extra scrolls, exits, alarm). Completing a mission fires a fanfare, congratulates the agent, and briefs the next goal and the obstacles being sent in; the completed mission card lies sideways in the Equip Area with its reward at the top. Remaining: more FX polish and a full mobile QA pass on a real device.

## Constraints

- Everything must run from a cold static host: no server APIs, no Node, no CDNs for core logic (fonts may be system fallback).
- Never edit anything in `upstream/`.
- Keep the flowchart (`docs/AgentDecker_turn_flowchart.svg`) in sync with any rules clarification we adopt.
- New derived documents (diagrams, notes) go in `docs/`; game content data goes in `js/data/`; art in `assets/`. Don't add stray files at the root.
- When rules text and the PDFs conflict, the `.md` (2015-09-27) wins; when wording is ambiguous, document the interpretation in `js/data/effects-notes.md` and default to the most conservative reading.

**Diegetic card SFX (PR in progress):** every obstacle card carries a `sound` field in `js/data/cards.json` (Guard Dog → bark, Radio Tower → hiss, Prison Door → clang, Hawk → screech, Sleeping Guard → snore, Patrolling Guard → footsteps…), synthesized from Web Audio primitives in `js/audio.js`. `Engine` records the card movement in `state.events`, `Table.plan()` layers the card's own cue on top of the generic table cue, and `js/ui.js` resolves it through `eventSound()`. Guard Dog / Patrolling Guard rearrangements now emit real `moveCard` events, so they animate and sound as they move.

**Undo + Bin (PR in progress):** `Engine.binCard()` and a visible **Bin** panel. Waste Room opens the Bin over the hand (unlimited), Flammable Barrel over the discard (max 2); hand cards get a `Bin` button while it is open, binned cards drop off the table and are listed in the Bin panel, and the engine records them in `state.removed`. `ui.js` keeps a snapshot stack (`UNDO_LIMIT 20`) — **Undo** / Ctrl+Z rewinds any move made this turn (play, interact, use item, bin); the stack clears at End Turn and at mission progression.
