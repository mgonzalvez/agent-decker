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
| Tech Container → Optic Camouflage (KEEP) | **4** Stealth; when used it goes to the obstacles discard instead of your own | 4 Stealth on use, card → obstacles discard | **FIXED** (the printed 4 was missing) — see Q5 |
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
| Radio Tower | When Radio Tower appears, slide all person cards all the way next to it | every face-up person is moved to the slots immediately right of the tower, in line order | OK **[I]** — see Q2 |
| Siren | When discarded, place every card in the line on the Obstacles Discard. Only raise the alarm for the Siren | on exit: line → obstacles discard, alarm only for the Siren; a **face-down** Siren does nothing (knocked-out cards ignore their effects) | **FIXED** |
| Inspector | At the Line Scroll, Inspector flips the last card in the line face up. "When appears" effects activate | flip happens before the exit, so the flipped card does raise its alarm; appearance effect re-runs | OK **[I]** — see Q7 |
| Dormitory | At the Line Scroll, facedown cards don't slide to the right. Faceup cards still do | if the card at the exit is face-down the conveyor is **jammed**: nothing exits, no alarm; extra slides are blocked by a face-down card | **FIXED** — it used to remove the rightmost face-up card regardless |
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

## 4. Open questions for the designer

1. **Guard Dog with a person to its LEFT.** The print says "if there is a person on the line". We only look to the
   right (the direction of the conveyor). If a person is left of the dog, does the dog still slide?
2. **Radio Tower direction.** "Slide all person cards all the way next to it" — persons already to the *left* of the
   tower would have to pass it. We move every face-up person to the tower's right side. Right?
3. **Does the line have gaps?** Disarming a card leaves a hole in the conveyor or the line closes up? Our model closes
   gaps, so adjacency (Watchtower, Clumsy Guard, Guard Dog) is always "next in the array". A strict conveyor would
   keep the hole, which changes which cards are adjacent and how Dormitory blocks the scroll.
4. **Keycard / Chloroform / E.M.P.** "Place <item> in your discard to interact with a door/person/equipment" — does
   the item **replace** the printed cost, or is it *in addition* to paying it? And does that use still consume the
   turn's interaction? We treat it as a replacement that still counts as the interaction.
5. **Optic Camouflage's printed 4 Stealth.** Items never sit in hand in our model (a drawn KEEP goes straight to the
   Equip Area). We now grant the 4 Stealth when the item is *used* from the Equip Area. Is that right — or should
   KEEP items be playable from hand like normal cards?
6. **Siren knocked out.** A face-down card "ignores its Type and Effect", so a knocked-out Siren no longer dumps the
   line when it exits. Confirm.
7. **Inspector timing.** Does the flip happen before the last card exits (so its alarm counts, our reading) or after
   the scroll (so it matters only for the *next* scroll)?
8. **Distraction.** When the pulled card lands at the start of the line, do its "when appears" effects trigger again
   (e.g. pulling a Guard Dog out of position)?
9. **Flammable Barrel's two knock-outs** — free bonus interactions, or do they eat the turn's interaction allowance?
10. **Clumsy Guard** — "you may instead knock out an adjacent card": do you still pay the 8 Fighting, and does the
    card you knock out cost anything? We pay the guard's cost and take the adjacent card for nothing.
11. **Mission Five** — "Knock out the six cards in the line": must the line still contain exactly six cards (so
    disarming any of them makes the goal impossible that mission)? We require exactly six, all face-down.
12. **Watchtower +2** — is the extra 2 paid in the same resource the card's cost is printed in, or in any mix?
13. **Items equipped mid-turn** — does Map/Guard Uniform/Prisoner give their resource in the turn they are acquired,
    or only from the next Card Refresh onward? (We say next turn.)
14. **Does the Bin accept KEEP items?** Printed: "any number of cards from your hand" — items never reach the hand in
    our model, so effectively it only ever purges non-item cards.
