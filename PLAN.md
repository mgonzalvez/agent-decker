# Agent Decker — Web Version: Project Plan

**Goal:** A website, statically hosted on GitHub Pages, where a player can play the full Agent Decker campaign (5 missions) in the browser. No backend, no login, no build pipeline required.

**Upstream:** Agent Decker by Manuel Correia (gamesbymanuel.com), CC BY-NC 4.0. Free to remix; we must keep creator credit and must not monetize.

---

## 1. Do we understand the game? — Assessment

**Yes, with one open work item.** Everything in `upstream/AgentDecker_rules.md` and `upstream/AgentDecker_player_aid.md` is clear. The card PDF (`upstream/AgentDecker_cards_full_art.pdf`, 7 pages: 9 cards (8 starting + 1 alarm), 45 obstacle/mission cards (5 pages × 9), 12 card backs) renders cleanly and every field is legible, so the full 54-card database can be transcribed by hand.

### Mechanics fully understood

| System | Understanding |
|---|---|
| **Alarm** | Two tokens (tens + ones) on a 0–50 counter. Rises when line cards exit. **50 = game over.** Resets between missions. |
| **The Line** | Conveyor of 6 obstacle cards. Exits right (raises alarm by card's alarm value; knocked-out face-down cards raise 0), refills left from Obstacles Deck. |
| **Starting deck** | 3 × HIDE (1 Stealth) + 5 × PUNCH (1 Fighting) — verified against the card PDF page 1 (PLAN previously assumed 4/4). |
| **Hand / Play Area / Discard** | Hand of 4. Used and voluntarily discarded cards go to the **Play Area** (not discard) — **except a KEEP card deliberately used for its effect, which goes to the discard** (C9). KEEP cards are persistent: the refresh discard excludes them. Between missions, Play Area + Discard + Deck shuffle into one new deck. |
| **Equip Area** | Item cards (KEEP icon) and mission rewards persist here **across missions**, exempt from refresh (C9). |
| **Resources** | Playing a hand card generates Stealth and/or Fighting. Obstacle costs are paid with either resource or any mix ("either" costs shown as combined icons). **Unspent resources evaporate at turn end** (C1). |
| **Interact** | Pay an obstacle's cost, then choose **Disarm** (card → Play Area, or → Equip Area if it has KEEP) or **Knock Out** (face down in place; no alarm, type & effect ignored). 1 interaction/turn = one Disarm or one Knock Out (C7); reward items can raise the limit (C8). |
| **Obstacle effects** | Activate on appearance and/or during Line Scroll. Clarified (C4/C5): **Guard Dog** slides *itself right* to the first person on its right when it appears; **Patrolling Guard** moves 2 spaces per scroll and, if pushed off the line, exits and raises alarm 5. Full detail in `js/data/effects-notes.md`. |
| **Mission deck** | 23 cards: Goals + Mission Obstacles, ordered A–E. Completing a mission = satisfying the **whole** goal (resource cost **and** any required items, which must be equipped) in a **single** Mission Check (C2). Reward = top half of the mission card (rotated) placed in Equip Area. |
| **Mission progression** | 1 Reward → 2 inject next mission's obstacles → 3 reshuffle discard+line+deck, draw new 6-line (activate effects) → 4 alarm to 0 → 5 reshuffle player deck (Equip stays) → 6 draw 4. |
| **Game over** | Alarm hits 50, **or** line can't be refilled to 6 even after reshuffling the Obstacles Discard (out of time). |
| **Scoring** | Sum of alarm values at the end of each mission; **lower is better**. Score log across plays. |

### Open items (resolve during Milestone 1)

1. ~~**Transcribe all 54 cards**~~ — **DONE (M1, 2026-11-13)**: `js/data/cards.json` (38 unique definitions with `copies`, 54 physical cards: 8 starting / 22 obstacle / 23 mission / 1 alarm) + `js/data/missions.json` (goals A–I, letters → obstacles injected per mission). Counts and alarm values cross-checked page-by-page; transcription notes in `js/data/effects-notes.md` §8.
2. ~~**Effect semantics**~~ — **RESOLVED** via designer clarifications C1–C8 (`js/data/effects-notes.md`) + video validation (`docs/video-validation.md`). Remaining per-card verification happens during M4 transcription (each card's printed effect text is the final word).
3. ~~**Reward "new rules"**~~ — **RESOLVED** (C8): rule changes are printed on deck cards, e.g. Siren/"Gear up" (draw up to N extra, N = KEEP cards in play area — the play-area-vs-equip-area counting nit is flagged in `js/data/effects-notes.md`). Transcribe as data during M1.
4. ~~**Interaction-limit rewards**~~ — **RESOLVED** (C7/C8): 1/turn initially, reward items can raise it; transcribe the specific granting cards during M1 (data-driven).
5. **Art** — decide: (a) re-cut the full-art PDF into per-card images, or (b) rebuild cards in HTML/CSS with our own styling. **Recommend (a)** for v1 (it's "full art" for a reason), with CSS cards as fallback for any unreadable crops.

---

## 2. Architecture

Pure static site. **Vanilla JS + CSS + HTML, no framework, no build step** — everything is committed and served by GitHub Pages.

```
/
├── index.html               # the game (single page)
├── css/
│   └── styles.css
├── js/
│   ├── data/
│   │   ├── cards.json       # all 54 cards (see schema below)
│   │   └── missions.json    # 5 mission goals, order, rewards
│   ├── state.js             # game state object + setup/teardown
│   ├── engine.js            # pure rules: turn phases, effects, game over
│   ├── actions.js           # player input → engine dispatch
│   ├── ui.js                # board rendering, card display, modals
│   ├── save.js              # localStorage save/continue, score log
│   └── main.js              # bootstrap
├── assets/
│   ├── cards/               # per-card art crops from the PDF
│   └── board/               # alarm counter, area backings
├── upstream/                # original print-and-play source (never modify)
├── docs/                    # derived documents (turn flowchart, etc.)
└── AGENTS.md  PLAN.md
```

### Design rules

- **Engine is pure.** `engine.js` takes a state object + an action, returns a new state (or state mutation behind a strict interface). No DOM, no randomness outside an injectable RNG. This makes it testable and makes save/undo trivial.
- **State shape** (single serializable object): `{ alarm: [tens, ones], line: [cardRef×6, faceDown?], hand: [...], deck: [...], discard: [...], playArea: [...], equip: [...], obstacleDeck: [...], obstacleDiscard: [...], missionIndex, interactionsLeft, phase, log }`.
- **Deterministic-ish RNG** with a visible seed → reproducible runs (nice for "replay last mission").
- **Data-driven effects.** Card effects are small declarative descriptors + a lookup of effect *handlers* (e.g. `draw:n`, `removeFromGame`, `slideForwardOnScroll`, `adjacentTo:type` on appearance). New effect types = new handler, never engine changes.

### Card data schema (draft)

```json
{
  "id": "obs_guard",
  "set": "obstacle",            // obstacle | starting | mission | alarm
  "name": "Guard",
  "obstacleType": "person",     // person | static | animal | ...
  "cost":  { "stealth": null, "fighting": null, "either": 2 },
  "alarm": 4,
  "keep": false,
  // mission goal fields (missions.json):
  //   "goal": { "resources": {"stealth": 6, "fighting": 0}, "itemsRequired": ["obs_guard_uniform"] },
  //   entire goal must be satisfied in ONE Mission Check; required items must be EQUIPPED (C2)
  "reward": {                   // top half — what you get
    "name": "Gun",
    "resource": { "stealth": 0, "fighting": 2 },
    "effect": null              // e.g. { "type": "draw", "n": 2 }
  },
  "effect": null,               // bottom-half active effect(s)
  "missionLetter": null         // for mission cards: "A".."E"
}
```

---

## 3. UI / UX

- **Board layout** mirrors the physical setup: Line (center, 6 slots) with deck left / discard right, alarm counter top, hand bottom (4), Play Area + Equip Area sides.
- **Interactions are click-driven:** click a hand card → play it (resources gained, shown) → click an obstacle you can afford → modal: **Disarm / Knock Out**.
- **Line Scroll is animated** (cards slide right, exiting card ticks up the alarm visibly — the "juice" that makes the tension legible).
- **Alarm counter** shows both tokens; turning 5/6/7/8/9 ones or any tens digit pulses red near 50.
- **Mission banner** at top of screen states the current goal and its cost so the Mission Check is one glance.
- **Save/Continue** in localStorage after every turn; **Score log** (best total alarms) persisted.
- **Responsive** down to tablet portrait; desktop-first.
- No sound for v1 (option for later).

---

## 4. Milestones

| # | Milestone | Done when |
|---|-----------|-----------|
| **M1** | **Content database.** Transcribe all 54 cards + 5 mission goals/rewards into `cards.json` / `missions.json` from the PDF (render pages → read → code). Verify counts: 8/22/23/1. | JSON validates against schema; card counts and alarm values match the PDF page-by-page. |
| **M2** | **Static board.** Setup + render all areas from the data; full art; responsive layout. | Board looks like the physical game, no logic yet. |
| **M3** | **One full turn.** Play cards, pay costs, disarm/knockout, line scroll, card refresh, alarm tokens. | One mission is playable to completion or game over, per rules. |
| **M4** | **Effect handlers.** All obstacle effects (line rearrangements, draw, remove-from-game, …) with the on-appearance / on-scroll triggers. | A mission with every obstacle type plays correctly. |
| **M5** | **Campaign.** Mission progression (6 steps), reward equip, goal checks, game-over conditions, score total + log. | All 5 missions, win & lose states, total-score screen. |
| **M6** | **Polish.** Save/continue, seeded RNG + replay, animations, accessibility (focus order, aria-live for alarm), credit/about screen. **Audio pass (implemented):** synthesized Web Audio SFX in `js/audio.js` — card play, disarm, knock-out, an alarm tick that escalates with the counter, mission-complete jingle, game-over sting. No asset files, no CDN; muted by default with a top-bar toggle. | Playable end-to-end in a real browser session, mobile included; audio toggle present. |
| **M7** | **Ship.** GitHub Pages deploy (repo → Pages on main branch), README with link, final pass. | Public URL works from a cold cache. |

Ordering note: M3 before M4 deliberately — the conveyor/turn loop is the heart of the game; effects bolt on.

**Status (2026-11-14):** M1 ✓, M2 ✓, M3 ✓, M4 ✓, M5 ✓, M6 ✓ (save/continue, seeded replay, accessibility, sound effects, about/credit). `js/data/cards.json` + `js/data/missions.json` are the content source of truth; `js/state.js` builds a seeded, serializable setup, `js/engine.js` is the pure turn loop (play → interact → mission check → line scroll → card refresh → progression), `js/actions.js` dispatches player intent, `js/ui.js` renders and handles clicks. Run locally with `python3 -m http.server 8000` (`?seed=12345` for a reproducible board) and the tests with `node --test js/tests/*.test.mjs` (47 tests: data integrity, invariants, turn loop, Guard Dog / Patrolling Guard / Radio Tower effects, KEEP-item interaction payments, Inspector's flip, Clumsy Guard adjacency, mission completion, alarm-50 loss; `js/tests/campaign.test.mjs` adds mission-by-mission goal tests, the Dormitory/Mission-5 win path, both loss states, and a 120-turn bot that keeps every invariant. Next: M6.. Next: finish M4 — UI prompts for the choice-driven effects (Scout, Distraction, deck reorder).

---

## 5. Verification strategy

- **Rules invariants** checked after every engine step: line ≤ 6 (it can be shorter mid-turn after a disarm; refill happens at Card Refresh), hand within the limit, alarm ≤ 50, no card exists in two zones, card counts conserved per set.
- **Playthrough tests:** scripted golden runs (fixed seed) asserting expected states — at minimum: one win per mission type, alarm-50 loss, out-of-time loss, and a mission-completion transition.
- **Manual pass** against the 5-min intro video and the written rules after M3/M4.
- Since the game is solo and short (~20 min/mission), a full human playtest of all 5 missions is cheap and is part of M6.

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Effect wording ambiguous (esp. "appears" vs "scroll" triggers) | Intro video + conservative reading documented in `data/effects-notes.md`; ambiguous cases default to the least-surprise interpretation |
| Full-art crops come out ragged (cut lines in PDF) | Crop with generous borders + CSS `object-fit`; fall back to CSS-drawn cards |
| 54-card transcription errors | Page-by-page double-check pass (M1 exit criteria); card counts as tripwire |
| Scope creep (multiplayer, backend, accounts) | Explicitly out of scope — static, solo, no server |
| License | CC BY-NC 4.0: credit Manuel Correia / gamesbymanuel.com in the UI and README; no monetization |

## 7. Explicit non-goals (v1)

- Multiplayer / hot-seat, accounts, cloud saves, server of any kind
- Physical print tooling (already exists upstream)
- Localization

---

*Next concrete action: M1 — render the 7 PDF pages and transcribe the card database (rules fully clarified; no open questions remain that block M1–M5).*
