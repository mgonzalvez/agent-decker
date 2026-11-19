# Homebase Radio — the Colonel in the lower left

**Status:** decisions locked (§2). Phase 1 (the brain) and Phase 2 (the voice) are built and
tested. The radio set itself — DOM, CRT portrait, mouth animation, audio — is Phase 3 onward.

**One-line:** a field radio sitting under the draw deck. Press **Call Homebase** and a
scanline portrait of the handler on the other end of the frequency talks you through the
best play for the position on the belt — in spy radio voice, not rules text.

**Why it exists:** Agent Decker punishes inexperience with alarm. A player who knows what
the belt is doing scores far lower. This feature is a *coach disguised as set dressing*:
it turns the state of the game into a ranked, explainable turn plan, and delivers it in the
voice of a handler who is clearly not impressed.

Measured on 30 identical seeded campaigns:

| Policy | Campaigns finished | Avg missions reached | Avg turns survived |
|---|---|---|---|
| random legal play | 0/30 | 0.00 | 10.5 |
| casual ("deal with whatever looks scary") | 0/30 | 0.13 | 13.2 |
| advisor | 2/30 | 1.47 | 76.3 |

That is the target of the feature: not a perfect solver, a meaningful lift for a player who
would otherwise flail.

---

## 1. What is actually being built

Three layers, deliberately decoupled (same split as engine/table/audio):

| Layer | File | Nature |
|---|---|---|
| **The brain** | `js/advisor.js` | Pure. State in → ranked list of legal actions out. No DOM, no RNG, no text. |
| **The voice** | `js/radio.js` | Pure-ish. An action record + position context → thematic transmission copy. |
| **The set** | `js/ui.js`, `css/styles.css`, `js/audio.js` | DOM, CRT animation, mouth sync, radio SFX. |

The brain never knows the Colonel exists. The voice never knows the rules. The set knows
neither.

---

## 2. Decisions (locked)

1. **Likeness.** Original handler, **"the Colonel"** — never named, never a Campbell
   likeness. Drawn, not photographic.
2. **Conflicting objectives.** The advisor always computes both. When the mission-push plan
   and the belt-control plan differ materially, the Colonel **presents the choice**: "Two
   ways out of this. A ends the mission but costs you the guard on the right. B keeps the
   belt clean and gives the mission up for this turn." The player picks.
3. **Granularity.** One or more moves, bounded by the interactions actually available this
   turn and the cards in hand. The plan is ordered and every step is legal at the moment it
   is performed.
4. **The Colonel never presses buttons.** He highlights the obstacle cards involved; every
   control stays pressable. No auto-play, ever.
5. **Assist level:** `off` (default) / `nudge` / `full plan`, on the switchboard.
6. **Cost of advice:** none. Calls are logged in the Mission Log ("Homebase consulted, turn 4")
   so a run can be audited later. No score penalty.
7. **Contact:** button press only. No auto-briefing, except a one-line transmission at mission
   start (the new goal) and mission end (congrats, score).
8. **Training Run:** the taped coach note is **deprecated**; the Colonel is the coach. The
   gating logic in `js/tutorial.js` stays — only the voice changes.
9. **Platform:** desktop and tablet only. No phone layout work. Below ~720 px the game is
   declared unsupported rather than contorted.
10. **Copy:** thematic radio slang only, with a **Plain** toggle in the set for players who
    want the mechanics spelled out. Both registers are generated from the same record.

Still open (asked, not yet answered):
- Where the "Radio link" switch lives: the switchboard in the top bar, or on the radio set
  itself? (Recommend the set — it is a physical object with a switch on it.)
- Whether the mouth animation should also run for mission briefs and end-of-mission lines,
  or only for on-demand advice.
- Naming the highlight: do the suggested cards get a marker (a chalk outline, a signal dot)
  or is the existing "you can afford this" glow enough?

---

## 3. UX spec

### The object

A physical field radio on the felt: metal case, a small CRT screen, a tuning knob, a
frequency label, an antenna, a two-stop switch, and one big pressed button. Not a panel.
It obeys the art-direction rubric in `docs/ui-art-direction.md`: 2 px corners, printed ink,
no chips, no glow, no dashboard meters.

States:

| State | What you see | What the button says |
|---|---|---|
| `off` | Switch off; the set is dark, button disabled | — |
| `idle` | Portrait, static, mouth closed, frequency label | **Call Homebase** |
| `calling` | Carrier tone, static burst, portrait fades in, ~700 ms | (disabled, "…") |
| `transmitting` | Mouth moves in sync with the typed text, signal bars flicker | **Again** |
| `stale` | Portrait dims, a "position changed" stamp | **Call Homebase** |

### Interaction

- Button, plus a keyboard shortcut (`C` — `Escape` is the zoom modal, `Ctrl+Z` is Undo).
- Advice is invalidated the moment any action is taken. The set shows `stale` rather than
  silently showing wrong advice. Never auto-recompute.
- Each suggestion line has a small **Why?** affordance that opens the existing zoom modal
  with the rules explanation ("the camera at the exit costs 8 alarm on the scroll — knock it
  out and you pay nothing").
- Signal strength bars are derived from the confidence gap between the top plan and the
  runner-up: a big gap is a clear signal, a tiny gap is noise. Thematic and useful.
- Suggestion text names things the player can see, not slot indices: "the patrol on the
  right", "the dog at the far left", "the camera at the exit chute".

---

## 4. The brain: `js/advisor.js` (built)

The unit of analysis is not the turn — it is the **position**. `searchPlans` beams across
three turns: it enumerates every way to close the current turn, then the next, then the
next, and scores the state at the end of the horizon. The plan handed to the player is only
the first turn's actions. Without the horizon, the agent optimises the belt beautifully and
dies three turns later.

Playing a card is free and unspent resources evaporate at refresh, so the plan always plays
the whole hand first. The real decision — the only one worth radio chatter about — is which
obstacle to spend the interaction on.

### Candidate enumeration (all legal, from the real engine)

1. **Play hand cards.** Every card, including the option variants the engine needs
   (`choice: 'resource' | 'draw'`, the Misdirect subset, Recall's pick, etc.).
2. **Interact with a line card.** For each face-up line card where
   `Engine.canInteract(...).ok`: Disarm, Knock Out, and Knock-Out-Adjacent targets, each
   with each affordable payment path (resources vs. an equipped Keycard/Chloroform/E.M.P.).
3. **Use an equipped one-shot item** (`useItem`).
4. **Bin a card** if `state.bin` is open.
5. **Mission Check** if `Engine.goalSatisfied`.
6. **End Turn** (Line Scroll + Card Refresh run internally — the "do nothing" baseline).

Every candidate is applied to a clone, so the advisor cannot corrupt the live state.

### Evaluation

`evaluate(state)` is a weighted sum. Weights are in one object at the top of the file so
they can be swept without touching logic:

| Term | Why |
|---|---|
| `missionComplete` | Banked missions. Completing one ends the turn, so the belt never scrolls. |
| `alarm` | Every alarm point, banked or current, is a score point. |
| `exposure` | Alarm still live on the belt, weighted by distance to the chute (1.0 at the exit, 0.18 at the far end). Face-down cards contribute nothing. |
| `jam` | Dormitory face up with a face-down card at the exit: the belt stops and the mission stalls. |
| `sirenGift` | The Siren dumps the whole line to the discard with alarm only for herself. Leaving her on the belt is a feature, not a threat. |
| `inflation` | Watchtower makes its neighbours cost 2 more. |
| `pool` | Goal resources the deck can realistically produce in a hand (average quality × hand size). Pruning junk with the Bin raises it. This is the term that makes the agent build a deck instead of only mopping the belt. |
| `progress` | How close the objective is this turn. |
| `removed` | Cards binned out of the game, weighted by what they were worth. |

**No hidden information.** The advisor never reads `state.obstacleDeck` order — a test greps
the source for it. It reads the player's own deck only where the printed card shows it to
the player (Plan Ahead, Foresight, Just The Thing).

**Determinism.** Same position, same plan. No RNG is advanced.

---

## 5. The voice: `js/radio.js` (built)

The advisor emits a record:

```json
{ "action": "interact", "choice": "knockOut",
  "target": { "defId": "obs_security_camera", "type": "equipment", "slot": 5, "alarm": 8 },
  "cost": { "stealth": 2, "fighting": 0, "flexible": 0 },
  "confidence": 0.52 }
```

The voice layer renders it from a lexicon that converts internal names into field language:

| Internal | Radio copy |
|---|---|
| slot 5 | "at the exit chute" |
| slot 4 | "closing on the exit" |
| slot 0 | "just came in, far left" |
| Security Camera | "the camera" |
| Patrolling Guard | "the patrol on the move" |
| Guard with Bazooka | "the man with the bazooka" |
| face-down card | "already down" |

A real transmission from the build:

> Homebase.
> Use hide, hide, punch, punch. That gives you something to work with.
> Take the camera at the exit chute down. It raises nothing on the way out.
> Other way round: force the objective now. That costs about 6 alarm. Your call.
> Over.

Plain register for the same transmission:

> Play Hide, Hide, Punch, Punch. Interact with Security Camera (slot 6) and Knock Out.
> Cost: 2 Stealth. Alternative: check the mission this turn. Alarm difference: 6. End Turn.

Tone rules: short sentences, clipped, imperative. Rules vocabulary — "interact", "slot",
"line scroll", "card refresh" — is banned in the thematic register and enforced by a test;
the Why? modal carries the rules language. Never more than about eight lines. The handler
sounds like radio, with an occasional "Over." and a carrier-tone cut at the end.

Mission start: one line stating the new objective in field language.
Mission end: one line rating the run ("Objective secured for 12 alarm. Good work, agent.").

---

## 6. The set: visuals and animation (built)

**Portrait.** Inline SVG bust, drawn (not photographic), monochrome, palette sampled from
the printed card art. Scanlines and static are SVG `<pattern>` tiles inside the portrait —
the rubric bans CSS gradients, and a pattern tile is the same idea in the medium the board
already uses. No drift, no flicker: the set is still, and only moves when it is on the air.

**Mouth.** Three mouth states baked into the SVG (`closed`, `mid`, `open`). While the set has
`is-transmitting` the three mouths cycle in a 0.54 s `steps(1)` loop, nine cycles, staggered
by a third of a second each. The line reveal is a `clip-path` `steps()` animation on each
line, staggered 0.42 s per line. That reads as lip-sync without any per-character JS: the
text is in the DOM from the first frame (good for screen readers and for tests), and the
reveal is pure CSS. When the transmission ends, the animation simply runs out and the mouth
closes.

**Timing.** ~0.2 s before the first line, then 0.42 s per line. Fast table and
`prefers-reduced-motion` kill the animations wholesale, so the whole transmission appears at
once and the mouth does not move.

**Audio (`js/audio.js`).** `radioCall` is a two-tone square chirp followed by a short bandpass
hiss of open carrier; `radioOff` is a two-note drop. Both go through the existing Sound
switch, so silence is the default. A per-syllable blip was tried and dropped: it read as
chatter rather than radio.

**Accessibility.** The readout is `aria-live="polite"`, the portrait is `aria-hidden`, the
controls are real `<button>`s with `role="switch"` and `aria-checked` on the two switches.

**Layout.** `.hand-zone` is `210px minmax(0,1fr)`, with the deck panel and the radio stacked
in a `.left-rail`. At ≤1360 px the screen is capped to 108 px tall. Below 720 px the game is
declared unsupported rather than squeezed.

---

## 7. Tests

- `js/tests/advisor.test.mjs` (built)
  - every enumerated action is legal and leaves the invariants intact;
  - **every returned plan can be executed step by step without throwing**;
  - plans always close the turn;
  - a satisfiable goal is always claimed;
  - the agent prefers the card about to exit;
  - face-down cards are never offered as targets;
  - advice is deterministic;
  - the source never mentions the obstacle deck;
  - the search runs in well under the time a button press allows.
- `js/tests/radio.test.mjs` (built) — banned vocabulary in the thematic register, plain
  register uses the printed terms, every suggestion maps to a card the UI can highlight,
  transmissions stay short, mission briefs carry the real objective.
- `js/tests/ui.test.mjs` (Phase 3) — the radio exists, behaves like a switch, obeys the art
  rubric, cache token matches.
- Manual QA at tablet and desktop widths.

---

## 8. Phased plan

**Phase 0 — decisions.** Done (§2).

**Phase 1 — the brain.** Done. `js/advisor.js` + tests. Acceptance met: nothing illegal is
ever suggested, advice is deterministic, the horizon search is fast, and advisor play beats
casual play on every measured seed. *This phase alone already delivers the user's goal; the
rest is theatre.*

**Phase 2 — the voice.** Done. `js/radio.js`, the field-name lexicon, position words, tone
rules, mission briefs, closing lines, and the tests above.

**Phase 3 — the set (static).** Done. DOM under the deck panel, the case/CRT CSS, the idle
line, the Call button, `is-live`/`is-stale` states, the Plain switch and the Full plan switch.

**Phase 4 — the talking portrait.** Done. SVG bust with three mouths, the CSS line reveal,
signal bars that track the advisor's confidence.

**Phase 5 — audio.** Done. `radioCall` chirp + carrier hiss, `radioOff` drop, both behind the
Sound switch.

**Phase 6 — integration and trust.** Done. Link switch on the set, `C` keyboard shortcut, the
Why? button opens the existing zoom modal with the plan and the arithmetic, advice goes stale
the moment the position changes, chalk marks appear only on the cards the transmission is
about, and every call is written to the Mission Log. The Training Run coach still runs; the
Colonel is available in it too. *Not done:* a first-call explanation inside the How to Play
screens.

**Phase 7 — tuning.** Done to the point where the defaults were chosen by sweep
(`node js/tests/advisor-sweep.mjs`). Horizon 4, beam 12, `progress 60`, `pool 10`, `stall 6`.
Over 30 seeds: advisor finishes 3/30 campaigns, reaches 1.77 missions on average and survives
56 turns; casual play finishes 0/30, 0.13 missions, 13 turns. The campaign is not solved —
missions 4 and 5 (18 mixed resources plus Prisoner, and knocking out the whole line) are out
of reach for a four-turn beam. The copy says "a good play", not "the best play", and that is
the honest claim.

**Phase 8 — QA.** Cache token bumped to `?v=45`; README and AGENTS.md updated. Real-device
pass still outstanding.

Commit style: one PR per phase, message ending with the PR number.

---

## 9. Risks

- **Advice correctness is the whole feature.** A wrong suggestion is worse than no
  suggestion. The Phase 1 tests are non-negotiable.
- **"Optimal" is hard.** The heuristic is a heuristic and currently stops short of closing
  out campaigns. Be honest in copy: the Colonel gives a good play, not a guarantee.
- **Layout pressure.** The left column is narrow; the radio must not push the hand down.
- **Likeness.** Original character only (§2.1). No MGS asset, name or portrait.
