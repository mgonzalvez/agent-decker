# Converting a physical card game to a web game — lessons from Agent Decker

Written after shipping Agent Decker (M1–M7, 148 tests, live on GitHub Pages). Everything here is
something we actually did or wish we had done earlier, not theory. Use it as a checklist for the next
print-and-play → digital project.

---

## 1. Spend the first days on understanding, not on code

The single biggest time saver was **not writing the engine first**.

- **Read the primary source three times**: the rules text, the player aid (the turn sequence), and the
  card fronts. The aid gave the turn order; the rules gave the exact wording; the cards gave the effects.
- **Watch a designer playthrough and transcribe it.** `docs/video-validation.md` +
  `docs/transcript-how-to-play.txt` settled more ambiguities than the rules text did. Time-stamped
  claims ("at 2:12 he knocks out the last card and the alarm stays at 0") are evidence you can cite later.
- **Find the community clarification thread** (BoardGameGeek for Agent Decker). It resolved 14 rulings in
  one pass — Guard Dog direction, Radio Tower geometry, whether an item replaces a cost, whether the line
  keeps holes. If you skip this, you will implement 14 wrong rules confidently.
- **Draw the turn as a flowchart before coding** (`docs/AgentDecker_turn_flowchart.svg`). It became both the
  implementation spec and an in-game "How to Play" screen. Two artefacts for one hour of work.

**Rule of precedence, decided up front and written down:** rules text (latest revision) > designer video >
older PDF > community thread > our interpretation. When wording is ambiguous, take the *conservative*
reading and record it.

## 2. Keep the sources physically separated from the derived work

```
upstream/      original rules, PDFs, cards — NEVER edited
docs/          derived: flowchart, validation notes, audit, spec
js/data/       the game data the engine actually reads
assets/        art, fonts
```

Why it mattered: the audit pass could re-open `upstream/AgentDecker_rules.md` and the card crops to verify
every effect without ever risking the shipped data. A future "did we mis-transcribe this?" question is a
five-minute check instead of a forensic investigation.

## 3. Model cards as data, effects as descriptors

- One JSON definition per **unique** card (38 definitions → 54 physical cards via a `copies` field).
- Every effect is a small typed descriptor: `{ "type": "slideRightToType", "targetType": "person" }`.
- One handler per effect type in the engine. **Never special-case a card id in engine code.** Adding a card
  is then "add JSON + maybe add one handler", and the 14 rulings from the audit were applied by editing data
  plus a handful of handlers.
- Store the **printed text verbatim** (`topText`, `bottomText`) alongside the machine-readable effect. It
  makes the audit possible, gives you tooltips for free, and is the record of what you *thought* the card
  said versus what it actually says.
- Also store what you might need later on day one: `art` paths, `sound` cues, `missionLetter`, `alarm`,
  `keep`, `reward`. Retrofitting a `sound` field to 38 cards later is a mechanical but annoying pass.

## 4. Make the engine pure and inspectable

The layer split that held up over seven milestones:

| Layer | Responsibility | Never does |
|---|---|---|
| `state.js` | create/validate state, RNG, registry | apply rules |
| `engine.js` | rules: state in → new state out | touch DOM, use `Math.random` |
| `actions.js` | translate player intent into engine calls | mutate state directly |
| `ui.js` | render state, prompt for choices | decide legality |
| `table.js` | turn `state.events` into animation + SFX | know the rules |
| `tutorial.js` | gate allowed actions for the coach | change rules |
| `save.js` | persist, score log | know the rules |

The payoff: a pure engine is trivially testable, and the event stream (`state.events`) let the animation
layer animate *whatever the rules decided* without re-deriving anything. When we changed the line from a
contiguous list to six slots, only the engine touched positions; the table layer kept working because it
compares DOM snapshots before/after.

Injectable, seeded RNG bought us: reproducible tests, "replay this seed", and a fixed tutorial seed.

## 5. Invariants are the highest-value test you can write

`checkInvariants()` runs after every engine call in tests: card conservation (54 cards across zones), no
card in two zones, line ≤ 6 slots, alarm ≤ 50, hand not absurdly large.

Every non-trivial bug in this project — a disappearing card during refill, a knocked-out Siren dumping the
line, a bot looping forever — was caught by conservation or by an invariant, not by a targeted assertion.
Run it after **every** action in the scripted playthrough tests, not just at the end of a turn.

Tripwires worth having:
- **Card counts per set** (8 starting, 22 obstacles, 23 mission, 1 alarm) catch transcription errors.
- **Type gating**: a validator (`validateTypes()`) fails the suite if any effect names an icon that does not
  exist or omits a `targetType`. Data bugs become build failures.

## 6. Test the rules with a bot, not just with assertions

Three test layers, in the order they paid off:

1. **Rule unit tests** (48 in `js/tests/turn.test.mjs`): one per effect, each named like a sentence
   ("guard dog slides right until it is adjacent to the first person on its right"). The test names double as
   the rules documentation.
2. **Scripted campaign bot** (`js/tests/campaign.test.mjs`): plays a whole 5-mission campaign on fixed seeds and
   asserts invariants hold, missions complete, both loss states reachable. This is what found the real
   physics bugs — a single assertion never exercises interactions *and* scroll *and* refill together.
3. **UI tests** with a stub DOM (47), plus state/save/table/audio/tutorial smoke tests. Cheap, and they catch
   rendering breaks that engine tests can't.

Budget for a "bot rewrite" whenever the rules change: the bot's strategy had to be rewritten twice (once
for free item interactions, once for the conveyor model).

## 7. Physical-model traps that bit us

- **Contiguous array vs. real slots.** A line that "shrinks" when you disarm a card is not a conveyor. Gaps
  change adjacency (Watchtower, Clumsy Guard, Guard Dog), what exits, and when the line refills. Decide this
  in week one: are positions fixed or does everything compact?
- **"Rightmost card always leaves, even with a gap to its right"** — a rule you only discover from the
  clarification thread.
- **Trigger timing**: "when it appears" vs "at the line scroll" vs "when discarded" are different events.
  Inspector flipping *before* vs *after* the exit changes whether the flipped card raises alarm.
- **Resources evaporate**; only the interaction is limited, playing cards is not. Easy to get backwards.
- **Face-down cards ignore type and effect** — every "is this card a person?" query needs a face-down guard.
- **Order of operations inside a phase** (scroll → refill → discard hand → draw → passives) is observable by
  the player, so write it down in the flowchart.

## 8. Record every interpretation as a numbered clarification

`js/data/effects-notes.md` holds `[C1]–[C10]` designer clarifications plus `[I]`-tagged interpretations,
with the *reason* and the date. When we later got an authoritative answer, we replaced the interpretation and
kept the trail. This is what makes the audit doc (`docs/card-effect-audit.md`) short to write: the table is
"printed text | engine behaviour | verdict".

Also keep **house rules opt-in and flagged** (`state.rules.quickHands`), never silently baked in.

## 9. Ship in milestones with explicit exit criteria

M1 card DB → M2 static board → M3 one full turn → M4 effects → M5 campaign → M6 polish (save, a11y, audio)
→ M7 deploy. Each milestone had a "done means" line, and each PR was small (Undo+Bin, Throw a Rock choice,
music, the conveyor refactor). Small PRs meant CI could verify rules before merge, and a regression was
always attributable to one change.

## 10. Deployment: no build step is a feature

- Vanilla HTML/CSS/JS, static host, no npm, no CDN for core logic → the site works from a cold clone and
  survives any hosting change.
- **Cache-busting tokens** (`?v=33`) in every script/link tag; bump them in the same commit as the code
  change, and verify the live site with `curl` after merge. GitHub Pages caches aggressively; without this
  you will chase "it works locally but not on Pages" ghosts.
- Self-host fonts (OFL) rather than pulling Google Fonts: fewer network dependencies, offline-friendly.
- CI runs the test suite on every PR. That is the merge gate.

## 11. Polish that pays for itself

- **Undo** with a snapshot stack: rule-heavy games are hard to learn, and undo makes experimentation safe.
- **A coach/tutorial that gates legal moves** (fixed seed) teaches the rules better than any help text.
- **Diegetic sound per card** (dog barks, door clangs) synthesized from Web Audio primitives — no asset
  files, no licensing, and it makes the board feel alive.
- **Accessibility is cheap if done early**: keyboard-focusable cards, aria-labels, aria-live alarm, Escape to
  close, `prefers-reduced-motion` respected, a "Fast table" toggle for animation.
- **Save/resume + score log** in localStorage, and a replayable seed, turn a 20-minute game into something
  people come back to.

## 12. Licensing and respect for the source

CC BY-NC 4.0: credit the designer in the UI and README, no monetisation, never modify upstream materials.
Decide the licence *before* you publish, and put the credit in a place players actually see.

---

## Start-the-next-project checklist

1. `upstream/` — rules PDF, card PDF, rules text, playthrough link. Read all of it.
2. `docs/card-effect-audit.md` — one row per card: printed text, implemented behaviour, verdict, open questions.
3. `docs/AgentDecker_turn_flowchart.svg` — the phase order, drawn before any code.
4. `data/cards.json` — unique definitions with `copies`, verbatim printed text, effect descriptors.
5. `engine.js` — pure functions, one handler per effect type, events emitted, seeded RNG injected.
6. `state.js` — `checkInvariants()` before you write a single rule test.
7. `js/tests/turn.test.mjs` — one test per effect, named like a rule.
8. `js/tests/campaign.test.mjs` — a bot that plays the whole game on fixed seeds with invariant checks.
9. Only then `ui.js` / `table.js` / `audio.js`.
10. CI runs the suite; merge gate is green; cache token bumped per release; verify with curl.

**Time spent (this project): roughly 40% understanding the game, 30% engine + tests, 30% UI/audio/polish.**
That ratio is about right for a rules-heavy game, and the 40% is the part that prevented rework later.
