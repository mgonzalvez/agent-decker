# Card Effect Audit

**Date:** 2026-11-15 · **Scope:** all 38 card definitions (54 physical cards), every printed effect, checked against
`upstream/AgentDecker_rules.md`, the card fronts in `assets/cards/` (cut from `upstream/AgentDecker_cards_full_art.pdf`),
the designer's playthrough (`docs/video-validation.md`), and `js/engine.js`.

Legend: **OK** = implemented and matches the print · **FIXED** = wrong before this pass, corrected now ·
**[I]** = our interpretation, printed rules are silent · **?** = needs a designer ruling (see §4).

---

## 1. Top-half (disarm reward) effects

| Card | Printed text | Engine behaviour | Verdict |
|---|---|---|---|
| Hide | 1 Stealth | `addResource` on play | OK |
| Punch | 1 Fighting | same | OK |
| Guard → Gun | 2 Fighting | on play | OK |
| Patrolling Guard → Interrogate | Draw two cards | `draw 2` | OK |
| Motion Sensor Hall → Don't Move | 3 Stealth | on play only; inert in the line **[I]** | OK |
| Waste Room → Bin | Take any number of cards from your hand and remove them from the game | opens the **Bin** over the hand, unlimited, one click per card | OK |
| Guard Dog → Follow | Draw a card | `draw 1` | OK |
| Sentry Gun → Machine Gun | 3 Fighting | on play | OK |
| Security Camera → Out of Sight | 2 Stealth | on play | OK |
| Gym Door → Flashy Move | 1 Fighting for every two cards in your discard, rounded down | `floor(discard/2)` at the moment it is played | OK |
| Sleeping Guard → Keycard (KEEP) | Place Keycard in your discard to interact with a **door** | item pays the cost of one door interaction; item Equip → discard | OK **[I]** — see Q4 |
| Infimary → Chloroform (KEEP) | … interact with a **person** | type-gated, same as Keycard | OK **[I]** |
| Yard Door → Throw a Rock | 1 Fighting **or** draw a card | now a real either/or; the engine refuses to resolve it without a choice | **FIXED** |
| Radio Tower → Misdirect | Place any number of cards from your hand in the Play Area, 2 Stealth each | chosen cards move hand → Play Area, 2 Stealth each | OK |
| Siren → Gear Up! (KEEP) | Draw a card for every KEEP you have currently equipped, max three | equipped passive at Card Refresh | OK **[I]** (items are never in hand, so "played" cannot be the trigger) |
| Locker Room → Guard Uniform (KEEP) | 1 Stealth, once per turn | per-turn passive | OK |
| Inspector → Recall | Take a card from your discard pile to your hand | prompted choice | OK |
| Archive Door → Plan Ahead | Look at the top three cards of your deck. **Keep one** and put back the rest in any order | now implemented: chosen card → hand, the rest reordered | **FIXED** |
| Dormitory → Distraction | Pull an obstacle card back to the start of the line | prompted choice, `unshift` | OK (Q8) |
| Engineering Bay → E.M.P. (KEEP) | Place E.M.P. in your discard to interact with an **equipment** | type-gated item payment | OK **[I]** |
| C.C.T.V. Room Door → Retrace Steps | Shuffle the obstacles discard with the obstacles deck to form a new obstacles deck | exactly that | OK |
| Sniper → Just The Thing | Search your deck for a card, shuffle it, then place it on top | pick → shuffle rest → push on top | OK |
| Watchtower → Foresight | Look at the top five cards and put them back in any order | prompted ordering | OK |
| Prison Door → Prisoner (KEEP) | 1 Fighting, once per turn | per-turn passive | OK |
| Flammable Barrel → Burn | Pick up to two cards from your discard and remove them from the game | Bin over the discard, capped at 2 | OK |
| Guard with Bazooka → Bazooka | 5 Fighting; when used it goes to the **obstacles** discard | routed to `obstacleDiscard` on play | OK |
| Tech Container → Optic Camouflage | **4** Stealth; when used it goes to the obstacles discard instead of your own | a regular player-deck card: 4 Stealth on play, then straight to the obstacles discard | **FIXED** (it was mis-flagged as a KEEP item and its 4 was never paid) |
| Chain Link Fence → Save Bullets | Save an unused card for the next turn | `saved` zone, re-enters hand at refresh | OK |
| Laser Hall → Superspeed | Draw three cards | `draw 3` | OK |
| Clumsy Guard → Heavy Hand | 3 Fighting | on play | OK |
| Armored Guard → Auto Rifle | 4 Fighting | on play | OK |
| Hawk → Swap | Swap your deck with your discard | swaps the two piles | OK |
| Mission One → Map (KEEP) | 1 Stealth, once per turn | passive | OK |
| Mission Two → New Rule: Gear up | Interact with up to TWO obstacles per turn | `rules.interactionLimit = 2` | OK |
| Mission Three → New Rule: Gather info | Draw FIVE cards instead of four | `rules.handSize = 5` | OK |
| Mission Four → New Rule: Overpower | Interact with up to THREE obstacles per turn | `rules.interactionLimit = 3` | OK |
| Mission Five → Mission Complete | — | ends the campaign | OK |

## 2. Bottom-half (in-the-line) effects

| Card | Printed text | Engine behaviour | Verdict |
|---|---|---|---|
| Guard Dog | When Guard Dog appears, if there is a person on the line, slide it all the way until it's **adjacent** to it | slides right and stops in the slot **immediately before** the first person to its right; does nothing if already adjacent | **FIXED** — it used to land on the far side of the person (Q1) |
| Patrolling Guard | During the Line Scroll, slides forward one more position | 2 spaces per scroll; can exit the line and raise its 5 alarm (C5) | OK |
| Radio Tower | When Radio Tower appears, slide all person cards all the way next to it | every face-up person slides toward the tower and stops as close as it can get, never crossing it | **FIXED** |
| Siren | When discarded, place every card in the line on the Obstacles Discard. Only raise the alarm for the Siren | on exit: line → obstacles discard, alarm only for the Siren; a **face-down** Siren does nothing (knocked-out cards ignore their effects) | **FIXED** |
| Inspector | At the Line Scroll, Inspector flips the last card in the line face up. "When appears" effects activate | flip happens before the exit, so the flipped card does raise its alarm; appearance effect re-runs | OK **[I]** — see Q7 |
| Dormitory | At the Line Scroll, facedown cards don't slide to the right. Faceup cards still do | the card at the end of the line **always** leaves (silently if it is face-down); a face-down card holds its slot and parks everything behind it | **FIXED (designer ruling, 2026-11-20)** — it used to stop the whole conveyor when the exit card was knocked out |
| Sniper | Sniper can't be interacted with unless it's the only person in the line | counts face-up persons only (face-down cards ignore their type) | OK |
| Watchtower | Increases the cost of adjacent cards by 2 | +2 to each face-up neighbour, in the resource type that card's cost is printed in | OK **[I]** — see Q12 |
| Flammable Barrel | When you interact with Flammable Barrel, knock out the cards that are **adjacent** to it | both neighbours of the barrel are knocked out, using the slots captured **before** the barrel leaves the line; free of the interaction limit | **FIXED** — disarming used to knock out the wrong card |
| Clumsy Guard | When you interact with Clumsy Guard, you may **instead** knock out an adjacent card | pay the 8 Fighting, Clumsy Guard stays in the line, one adjacent face-up card is knocked out | OK — see Q10 |
| Hawk | When Hawk is faceup in the line, you can't interact with cards that cost only Stealth | blocks stealth-only costs while Hawk is face-up | OK |

## 3. Turn / mission logic checked in the same pass

- Resources are per-turn and evaporate at Card Refresh **[C1]** — OK.
- Only the obstacle interaction is limited; playing hand cards is unlimited — OK.
- **Mission goals are type-specific.** Mission 2 prints a red (Fighting) 6, Mission 1 a blue (Stealth) 6, Mission 4 the combined glyph (any mix, 18). The engine previously let Stealth satisfy a Fighting goal — **FIXED**.
- A goal must be paid in one Mission Check; required items must be equipped **[C2]** — OK.
- Completing a mission ends the turn **[C10]** — OK.
- Line refill always reshuffles the obstacles discard; game over only if the line still cannot be filled **[C4]** — OK.
- Score = alarm at each mission end; alarm resets between missions — OK.
- Card conservation is checked after every action by `checkInvariants` (54 cards, binned cards accounted for separately) — OK.

## 4. Rulings adopted (designer / BoardGameGeek clarification thread, 2026-11-15)

Source: the BGE clarifications thread by rkonigsberg (with gr9yfox and the designer's own answers).

| Question | Ruling | Engine |
|---|---|---|
| Guard Dog — which persons? | Only persons **to its right** (the direction of the conveyor). "Slide it all the way next to it" = stop as close as possible, never jump over the target. | OK |
| Radio Tower — direction | Every face-up person slides **toward** the tower and stops as close as it can get, without ever crossing it. Persons on the left pack immediately to its left, persons on the right immediately to its right. | **FIXED** (previously moved everyone to the right side only) |
| Keycard / Chloroform / E.M.P. | The item **replaces** the printed cost and still counts as the turn's interaction. Items can be used from the Equip Area or from the hand; they go to the *discard*, not the Play Area. | OK |
| Optic Camouflage | **Not a KEEP item** — it is a regular card in the player's deck. Played from hand it gives 4 Stealth, and when used it goes to the obstacles discard instead of the player discard. | **FIXED** (it was flagged `keep: true` and its 4 was unused) |
| Inspector | Flip happens to the last card of the line, which then scrolls off and raises its alarm — the only reading in which waking a knocked-out card does anything. "When appears" effects activate. | OK |
| Distraction | "The start of the line" = the back of the line, as if it were the newest card. Appearance effects of the pulled card do **not** re-trigger. | OK |
| Mission 5 | "Knock out the six cards in the line" means all six line slots face-down. | OK |
| Watchtower +2 | Paid in the resource the card's cost is printed in. | OK |
| Flammable Barrel's two knock-outs | Free; the barrel is the only interaction spent. | OK |
| Clumsy Guard | A choice: interact with Clumsy Guard itself for 8 Fighting, **or** pay 8 Fighting to knock out an adjacent card for nothing. | OK |
| Items acquired mid-turn | Their once-per-turn resources apply **immediately** (Map, Guard Uniform, Prisoner). | **FIXED** |
| Knocked-out cards at the Line Scroll | They are still discarded ("Add the last card in the line to the obstacles discard") but raise **no** alarm. Dormitory is the exception to the *sliding*, never to the exit: while it is face-up, face-down cards do not slide, but the last card in the line always leaves. | OK |
| Mission objectives | "Get 6 stealth" = play 6 stealth from hand to the Play Area. Objectives do **not** count against the interaction limit, and resources spent on obstacles cannot double-count toward the goal. | OK |
| Bin | Purges any number of cards from the **hand** only; Bin itself is already in the Play Area, so it cannot bin itself. | OK |
| Empty draw pile | Whenever a draw cannot be satisfied, shuffle the discard into the deck and draw the remainder. | OK |
| Just The Thing | Take the chosen card, shuffle the deck, then put the card on top. | OK |
| Save Bullets | The saved card does not count against the draw. | OK |
| Patrolling Guard | Scrolls one extra space, swapping with the card in front of it. | OK |

## 5. The line is a six-slot conveyor (implemented 2026-11-16)

`state.line` is six positions, and an empty position is `null`:

- Disarming a card leaves its slot empty; the hole does not close up.
- At the Line Scroll the **rightmost occupied** card is discarded (alarm unless it is face-down), then every card
  slides one place right into any hole. Refill happens at Card Refresh and enters at the **left** end.
- Adjacency (Watchtower +2, Clumsy Guard, Guard Dog) is measured in slots, so a hole breaks adjacency.
- Dormitory (face-up in the line) means face-down cards do not slide: they hold their slot, so anything behind
  them is stuck, but the card at the end of the line always leaves. Disarm or knock out the Dormitory and the
  whole stretch starts moving again.

Confirmed rulings that this pass settled: Dormitory's effect only applies while it is in the line and face up; a
Patrolling Guard that is already at the exit does leave the line on its extra step and raises its alarm.

## 6. Designer playtest report (2026-11-20)

Manuel Correia played the build and reported six things. What happened to each:

| Report | Finding | Fix |
|---|---|---|
| Mission 4: the line stopped scrolling at the end of a turn, even after Retrace Steps | Dormitory was face-up with a knocked-out card at the exit. The engine read "face-down cards don't slide" as "nothing leaves the line", which is a softlock: a knocked-out card can never be interacted with again. | The exit card always goes to the obstacles discard (silently if face-down). Face-down cards still refuse to slide, so they park the stretch behind them. `js/engine.js lineScroll()` |
| Training Run: "Exit training" does not get you out of it | The coach's own board overwrote the campaign save, so leaving training left you on the practice board with no way back. | The training run is never written to the resume slot; the board you were on is held and restored by **Back to my campaign**. |
| After Mission 3 the banner still showed Mission One's goal | Not reproducible in this build (the mission slip and the coach both re-render on completion). A regression test now covers it. | `js/tests/ui.test.mjs` |
| Yard Door / Throw a Rock: "Play this card" did nothing | The choice overlay was built after a "nothing to choose" guard that looked at the draw deck. With an empty deck the engine threw and the click silently failed. | The "X or Y" choice is asked before any pool is built, and only the options that are actually possible are offered. |
| Resume after a reboot kept the resources but reset the hand and the alarm | The save slot could hold a stale state: a finished game was never cleared, and a state from an older build was resumed unchecked. | Game over clears the resume slot; loaded states are validated (shape + every card id resolves in the current registry) before they are restored; the save note names the mission and turn restored. |
| Naming: "use Chloroform", not "use Infimary" | Half the UI named a card by its obstacle half even in the agent's hands. | Belt = obstacle name (Yard Door). Hand, Play Area, Equip Area, Bin, deck totals, the log and the radio = the top-half name (Throw a Rock). `Engine.agentName()` / `UI.itemName()` |
