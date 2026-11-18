# Agent Decker — Web Version: Project Plan

**Goal:** a statically hosted GitHub Pages site where a player can play the full five-mission
Agent Decker campaign in the browser. No backend, no login, no build pipeline.

**Upstream:** Agent Decker by Manuel Correia (gamesbymanuel.com), CC BY-NC 4.0 — free to remix,
credit required, no monetization ever.

**Status (2026-11-18): shipped.** M1–M7 are complete and the game is live at
https://mgonzalvez.github.io/agent-decker/ . This document is the design record: the mechanics
understanding and the architecture the code actually follows. `AGENTS.md` is the operative
contributor guide.

---

## 1. The game, as implemented

| System | Understanding |
|---|---|
| **Alarm** | 0–50 counter, rises when line cards exit. **50 = game over.** Resets between missions. |
| **The Line** | Six-slot conveyor of obstacle cards. The rightmost occupied card exits (alarm + its value; face-down cards raise 0 and hold the exit), cards slide right to fill holes, new obstacles enter at the left at Card Refresh. Dealt from the right. |
| **Starting deck** | 3 × Hide (1 Stealth) + 5 × Punch (1 Fighting) — verified against PDF page 1 (an earlier draft assumed 4/4). |
| **Hand / Play Area / Discard** | Hand of 4 (5 after Mission 3). Played cards go to the Play Area, folded back into the deck at Card Refresh. KEEP cards are exempt from that discard and persist. |
| **Equip Area** | KEEP items and mission rewards persist here across missions. Items are never in hand. |
| **Resources** | Playing a hand card generates its top-half resources. Costs are Stealth, Fighting or any mix. **Unspent resources evaporate at the end of the turn** (C1). |
| **Interact** | Pay the printed cost, then Disarm or Knock Out. One interaction per turn initially; mission rewards raise the limit (C7/C8). Only the interaction is limited — you may play as many cards as you like. |
| **Obstacle effects** | Trigger on appearance or during Line Scroll, per printed text (Guard Dog, Patrolling Guard, Radio Tower, Watchtower, Dormitory, Inspector, Clumsy Guard, Flammable Barrel, Siren). Full detail in `js/data/effects-notes.md` and `docs/card-effect-audit.md`. |
| **Mission deck** | 23 cards (5 goals + 18 obstacles), lettered A–I. Completing a mission means satisfying the **whole** goal — resources and required equipped items — in a **single** Mission Check (C2). Completing a mission ends the turn (C10). |
| **Mission progression** | Reward → Equip → inject next mission's obstacles → reshuffle obstacles + line + deck, deal a new 6-card line (appearance effects fire in draw order) → alarm to 0 → reshuffle the player deck (Equip stays) → draw a hand. |
| **Game over** | Alarm hits 50, or the line cannot be refilled to 6 even after reshuffling the obstacle discard. |
| **Scoring** | Alarm at the end of each mission, summed. Lower is better; best runs logged in localStorage. |

Card set: 54 physical cards from 38 definitions (`copies` in `js/data/cards.json`) — 8 starting,
22 obstacles, 23 mission, 1 alarm counter.

## 2. Architecture

Pure static site: vanilla HTML/CSS/JS, everything committed, GitHub Pages serves the repo root.

```
index.html
css/styles.css
js/
  data/cards.json         54 cards (see schema)
  data/missions.json      five goals, letters, rewards
  data/effects-notes.md   clarifications + interpretations
  state.js                seeded, serializable state; invariant checks
  engine.js               pure rules: turn phases, effects, game over
  actions.js              player intent → engine
  ui.js                   rendering, modals, zoom, accessibility
  table.js                view layer that replays engine events as card movement
  audio.js                Web Audio SFX + music beds (muted by default)
  tutorial.js             Training Run coach
  save.js                 localStorage save/continue + score log
  main.js                 bootstrap
assets/cards/            54 crops + back.jpg
assets/fonts/            self-hosted OFL fonts
upstream/                original print-and-play source (read-only)
docs/                    flowchart, audit, spec, validation
```

### Design rules that still hold

1. **The engine is pure.** State in → state out, no DOM, no `Math.random` (injectable seeded RNG).
   This makes rules testable and makes save/undo trivial: a snapshot is a perfect rewind.
2. **State is one serializable object** — `alarm`, `line` (six slots, `null` for holes), `hand`,
   `deck`, `discard`, `playArea`, `equip`, `obstacleDeck`, `obstacleDiscard`, `missionIndex`,
   `interactionsLeft`, `faceDown`, `resources`, `sources`, `rules`, `log`, `events`.
3. **Effects are data.** A declarative descriptor in `cards.json` + one handler in the engine. New
   effect = new handler, never a special-cased card id.
4. **Animation is a view, not a rule.** `state.events` describes what moved; `table.js` replays it.
   No animation may change state.
5. **Determinism.** A visible seed makes every run reproducible, which is what the tests and
   "Replay this seed" rely on.

### Card schema

```json
{
  "id": "obs_guard_dog",
  "set": "obstacle",              // starting | obstacle | mission | alarm
  "name": "Guard Dog",
  "obstacleType": "animal",       // person | animal | equipment | location | door
  "copies": 1,
  "cost": { "stealth": 1, "fighting": 0, "either": 0 },
  "alarm": 3,
  "keep": false,
  "topText": "...", "bottomText": "...",
  "reward": { "name": "...", "resource": { "stealth": 0, "fighting": 2 }, "effect": null },
  "effect": { "type": "slideToFirstPersonRight" },
  "sound": "bark",
  "missionLetter": "B",
  "art": ["assets/cards/014.jpg"]
}
```

## 3. Milestones — all done

| # | Milestone | Done when | Status |
|---|---|---|---|
| M1 | Content database | 54 cards + 5 missions transcribed, counts and alarm values verified | ✓ |
| M2 | Static board | Every area rendered from the data with printed art | ✓ |
| M3 | One full turn | Play → pay → disarm/knock out → scroll → refresh, alarm tracked | ✓ |
| M4 | Effect handlers | Every obstacle effect, on-appearance and on-scroll | ✓ |
| M5 | Campaign | Progression, rewards, goal checks, both loss states, score screen | ✓ |
| M6 | Polish | Save/continue, seeded replay, accessibility, audio, about/credit | ✓ |
| M7 | Ship | GitHub Pages live, README, CI | ✓ |

Ongoing polish (see "Open work" in `AGENTS.md`): mobile QA, finer-grained animation steps, FX.

## 4. Verification strategy

- **Invariants after every engine step:** line ≤ 6, hand plausible, alarm ≤ 50, no card in two zones,
  card counts conserved per set.
- **Scripted playthroughs** on fixed seeds: mission completion, both loss states, the Mission 5
  knock-out win path, per-card effect tests.
- **UI tests** run against a minimal DOM stub (`js/tests/ui.test.mjs`) — buttons exist, modals open,
  zoom works, cache tokens match.
- **Manual pass** against the designer video and the printed rules.

Run everything with `node --test js/tests/*.test.mjs` (152 tests); CI runs the same suite on every
push.

## 5. Explicit non-goals

Multiplayer, accounts, cloud saves, any server, print tooling, localization.
