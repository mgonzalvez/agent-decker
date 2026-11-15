# Table Physics — spec for animating the deal, the scroll and the draw

**Status:** proposal, not implemented. Goal: make the browser feel like handling physical cards, without changing a single rule.

## 1. Principles

1. **The engine stays pure and instantaneous.** Rules resolve in one call. Animation is a *view* layer that replays the engine's output. No animation may change state, and no rule may depend on animation.
2. **Every mutation becomes an event.** The engine already mutates a state object; we add a structured `events` array describing *what moved from where to where*, so the UI can replay it.
3. **Cards are addressable by `uid`.** The DOM keeps one element per uid for the lifetime of a turn, so movement is a transform, not a rebuild.
4. **Graceful degradation.** `prefers-reduced-motion` or "Fast table" mode collapses everything to instant state swaps.

## 2. Rules fixes this depends on

| # | Issue | Fix |
|---|---|---|
| A | Setup deals the line left→right (`state.js: line: obstacleCards.slice(0, 6)`), but rules.md **C3** says "draw six cards. Place them in a line, **starting from the right**." | Deal one card at a time, inserting at the **right**, running `applyAppearance()` after each placement. The final line is the reverse of the draw order. |
| B | Appearance effects (Guard Dog slides right to the first person; Radio Tower pulls people to itself) currently run after the whole line exists in setup. | Run them in draw order, exactly as a human reads each card as it lands. |
| C | Refill after a scroll already uses `unshift` (left) + `applyAppearance` — correct. | Keep, but emit events. |

## 3. Event model

`state.events` (transient, reset on each action; persisted only for the current action) contains:

```js
{ type: 'dealLine',  card: uid, slot: 5 }          // card lands in the rightmost free slot
{ type: 'moveCard',  card: uid, from: 2, to: 4, reason: 'Guard Dog' }
{ type: 'scroll',    exiting: uid, shift: [uid…] } // every card slides one slot right
{ type: 'exitLine',  card: uid, alarm: 8 }         // card leaves the line → Obstacles Discard
{ type: 'flipUp',    card: uid, reason: 'Inspector' }
{ type: 'draw',      card: uid, from: 'deck', to: 'hand' }
{ type: 'play',      card: uid, from: 'hand', to: 'playArea' | 'equip' }
{ type: 'ko',        card: uid }                   // rotate 90°, desaturate
{ type: 'alarm',     amount: 8, total: 24 }
{ type: 'mission',   missionIndex: 1 }
```

Engine functions that currently mutate quietly (`refillLine`, `lineScroll`, `applyScrollTriggers`, `drawToHand`, `interact`, `completeMission`) push these events. Tests assert the event stream, not just the resulting state.

## 4. The table layer (`js/table.js`)

- **Slot geometry.** The line has 6 fixed slot positions (left→right). A "tray" for the Obstacles Deck sits to the left, the Obstacles Discard to the right. The hand has up to 7 slots; the Play Area and Equip Area are trays.
- **FLIP animation.** On each event: record each element's bounding box, apply the new position, then animate the delta with a CSS transform. One shared `--card-w` grid makes the math trivial.
- **Event queue.** Events from one action run sequentially, with a small overlap for parallel slides:
  - `dealLine` 260 ms, staggered 120 ms apart
  - `moveCard` 300 ms
  - `scroll` 240 ms (all cards slide together, the exiting card fades out over the edge)
  - `draw` 180 ms per card, staggered 90 ms
  - `play` 220 ms
  - `ko` 160 ms (rotate + desaturate)
  - Total for a full turn: ~2.5 s. Add a "Fast table" toggle (all durations → 0) and respect `prefers-reduced-motion`.
- **Sound hooks.** Each event has a matching synthesized cue (see §5), fired by the table layer, not the engine.

## 5. Sound map (all synthesized, no assets)

| Event | Sound |
|---|---|
| `dealLine` / `draw` | short card flick — filtered noise burst, ~40 ms |
| `play` | two-tone "tap" (330 → 500 Hz) |
| `moveCard` | soft slide — short lowpass sweep |
| `scroll` | conveyor hum, one tick per card |
| `exitLine` | deeper "drop" plus the alarm tone if `alarm > 0` |
| `ko` | muted thud (existing `burst`) |
| `flipUp` | quick snap |
| `alarm` | existing sawtooth, pitch scaled by level |
| `mission` | existing four-note chime |

SFX volume is independent of the music bed; the music tempo already follows the alarm.

## 6. What the player sees, turn by turn

1. **Mission start / new line:** six cards flip off the deck one at a time into the **rightmost** empty slot, each with its appearance effect animating immediately (Guard Dog slides right to the nearest person; Radio Tower drags people to itself). Alarm does not move.
2. **Play a card:** the card leaves the hand, arcs to the Play Area (or Equip Area for KEEP), and the resource chips tick up with a small pop.
3. **Disarm:** the card lifts out of the line into the Play Area; the remaining cards do *not* shift (the line is a conveyor, not a queue).
4. **Knock Out:** the card rotates 90° and desaturates in place.
5. **End Turn — Line Scroll:** every card slides right by one slot; the rightmost card tips over the edge into the Obstacles Discard and the alarm gauge fills with a matching tick. Face-down cards stay put if Dormitory is equipped.
6. **Card Refresh:** hand and Play Area cards sweep into the discard; then cards fly one at a time from the draw deck into the hand. Unspent resources visibly fade to zero.

## 7. Implementation phases

1. **PR 1 — engine events + setup deal order.** Pure engine change plus tests; no visual change. (~1 day)
2. **PR 2 — table layer for the line.** Deal, scroll, move, exit animations. Sound hooks.
3. **PR 3 — hand/Play Area/Equip animations.** Draw flicks, play arcs, KO rotation.
4. **PR 4 — Fast table toggle + reduced-motion path,** and a "Table speed" control in the top bar.

## 8. Tests

- Engine: assert the event stream for a scripted turn (deal 6 → scroll → refill), including Guard Dog and Radio Tower reordering and Dormitory stasis.
- Engine: assert the line is dealt from the right per C3 and that appearance triggers fire in draw order.
- UI (stub DOM): assert that rendering a state with `events` produces the expected number of animated card moves and that Fast mode emits none.
- Invariants unchanged: after every animated sequence, `checkInvariants` is clean.

## 9. Risks

- **Drift between view and truth.** Mitigation: the table layer only ever reads `state`; it never mutates. After an animation completes, re-render from state.
- **Long animations annoy experienced players.** Mitigation: Fast table by default after the first mission, or a persistent setting.
- **Performance on low-end phones.** Mitigation: cap at 6 simultaneous transforms; skip animations when `document.hidden`; use `transform` only (no layout thrash).
