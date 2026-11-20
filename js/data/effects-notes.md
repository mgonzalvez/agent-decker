# Rules Clarifications & Effect Notes

This file is the engine-facing rules reference. Per `AGENTS.md`, ambiguous readings are documented here.

**Sources, in priority order:**
1. **Designer clarifications** (session of 2025-09-30, via gonz) — authoritative.
2. `upstream/AgentDecker_rules.md` (2015-09-27).
3. `docs/video-validation.md` — designer playthrough video ("How to play Agent Decker", 4:45, youtube.com/watch?v=ArPVpr5TNcg); transcript in `docs/transcript-how-to-play.txt`.
4. **[I]** = our own interpretation where no source is explicit.

---

## 1. Resources

- Stealth / Fighting are **per-turn only**: any unspent resources evaporate when the turn ends (Card Refresh). **[C1]**
- Playing a hand card generates its top-half resources/effect. A card in the **line** has no top-half effect — only its bottom half (name, type, cost, alarm, bottom-half effect) is active there. **[C3]**
  - Example: *Don't Move* (Motion Sensor Hall reward) generates **3 Stealth** when played from hand. Inert as an obstacle. Thematically: the agent stayed perfectly still. **[C3]**
- **"Once per turn" reward resources** (e.g. Map: 1 Stealth, once per turn) generate resources; this does **not** consume one of the turn's obstacle interactions. **[I]**

## 2. Mission goals

- The **entire** goal must be satisfied in a **single Mission Check** — resources and required items alike; nothing accumulates across turns. **[C2]**
- **Item requirements must be equipped** (in the Equip Area). Mission 2: 6 Fighting **and** the Guard Uniform equipped. **[C2]**
- Mission 1 goal for reference: 6 Stealth. **[video]**

## 3. Interactions

- **1 interaction per turn** initially; one interaction = one Disarm *or* one Knock Out. **[C7]**
- Later reward items can raise the per-turn interaction limit. **[C7, C8]**
- **[C10] Completing a mission ends the turn.** The player aid says a successful Mission Check "complete the mission … skip steps 3–4", and Mission Progression step 6 says "Draw 4 cards. **Begin the new mission at step 1**." That new step 1 is a *new turn*: the interaction allowance is not topped up on top of the one already spent, so finishing Mission One never lets the agent deal with two obstacles. `Engine.completeMission()` therefore increments `state.turn` as it sets up the next mission.
- You may play any number of hand cards to generate resources; only the obstacle interaction is limited. **[rules.md]**

## 4. Items (KEEP)

- Equipping is **optional** when disarming, but effectively required — the game can't realistically be won without items. **[C6]**
- **Mission rewards** are earned on completion and equipped (placed in the Equip Area). **[C6]**
- Equipped items and "new rules" persist on the table across missions (never shuffled into the deck). **[rules.md]**
- **[C9] Persistence with an exception:** a disarmed-but-unequipped KEEP card sitting in the Play Area **stays** at turn end (exempt from the refresh discard). But if a KEEP card is **deliberately used/discarded for its own effect** during a turn, it goes straight to the **discard pile** (exception to the usual Play Area routing); it keeps its KEEP icon, and when it reappears in the hand it can be equipped again. **[C9 + rules.md]**
- **[I] Items never occupy the hand.** rules.md: "You can equip them when you draw them again." The engine routes any drawn KEEP card straight to the **Equip Area** and keeps drawing until the hand is full, so an item never counts against the hand size. (Alternative reading — the item sits in hand and you choose to equip it — is equivalent in practice, since equipping is always the desired action.)
- **[I] Equipped items fire once per turn.** "Once per turn" resources (Map: 1 Stealth, Guard Uniform: 1 Stealth, Prisoner: 1 Fighting) are granted when the item enters the Equip Area and again at every subsequent Card Refresh (`state.passives` is cleared each refresh, so each equipped item pays once per turn). **Siren / "Gear Up!"** draws one card per equipped KEEP item, to a maximum of three — with 3 items equipped that gives exactly the 7-card hand Mission 3 asks for.
- **[I] Optic Camouflage.** "When used, it is discarded to the obstacles discard instead of your own" — the Equip Area shows a **Use** button; using it sends the card to the Obstacles Discard, where it returns through the line.
- **[I]** If two copies of the same KEEP item end up in your deck and both are drawn, the player may equip/swap; duplicate equipped copies stack their once-per-turn uses.

## 5. Line effects (obstacle bottom-half)

- **Guard Dog** — when it *appears* in the line (drawn during Card Refresh or mission setup), it slides **right** until adjacent to the **first person-type card to its right**. **[C4]**
  - **[I]** No person-type card to its right → it simply stays.
- **Patrolling Guard** — during Line Scroll it moves **2 spaces right** (1 normal + 1 extra, swapping with the card to its right each space). If this pushes it **off the line, it leaves and raises the Alarm by its value (5)** — i.e. it can exit in the same scroll as a normal card. **[C5]**
- All other line-altering effects follow the same pattern: activate **on appearance** (as the card is placed) or **during Line Scroll**, per their printed text. Verify each during M4.
- **[I] The line is dealt from the right.** rules.md **C3**: "draw six cards. Place them in a line, starting from the right. Read the cards as you draw them". So the *first* card drawn sits in the rightmost slot and the line grows leftward; each card's appearance effect resolves against the **partial** line at the moment it lands, in draw order. `Engine.dealLine()` models this (it `unshift`s each drawn card); the UI renders a short line right-aligned so the first card visibly lands on the exit end.

## 6. "New rules" cards (deck-entered rule changes)

Missions are where the game scales up: completing them gives better rewards, and new cards added to the deck (via disarms) can carry **printed rule changes**. **[C8]**

- **Siren / "Gear up"** — printed: *"draw a card for every KEEP you have currently equipped, to a maximum of three."* Implemented as an **equipped passive** that triggers at Card Refresh (items are never in hand, so "played from hand" cannot be the trigger). **[C8, C9]**
- **[C9] KEEP cards are persistent** against *automatic* discarding: the Card Refresh step ("discard hand + Play Area") **excludes** them — they stay in the Play/Equip Areas at turn end. The one route by which a KEEP card leaves play is the player's **own choice**: deliberately using/discarding it for its effect sends it to the discard pile, where it later returns via the deck and can be equipped again (see §4).

## 7. Resolved apparent contradiction

- The video says a disarmed card goes "in your **discard**" and re-enters the deck when the deck runs out; the written rules use a **Play Area**. **No conflict**: step 4 of Card Refresh moves Play Area → discard, so the disarmed card *does* return mid-mission exactly as shown in the video. The Play Area is a per-turn staging zone. **[video + rules.md]**

---

## 8. M1 transcription notes (2026-11-13, from `upstream/AgentDecker_cards_full_art.pdf`)

Verified card-by-card against the 7 PDF pages (54 fronts, cut individually in `upstream/cards/fronts/`).

- **Starting deck is 3 HIDE + 5 PUNCH** (not 4/4 as `PLAN.md` §1 assumed). Page 1 of the PDF is the source of truth.
- Set counts confirmed: 8 starting, 22 obstacle, 23 mission (5 goals + 18 obstacles), 1 alarm counter = 54.
- **Mission letters:** A = Mission 1 goal, B = obstacles entering for Mission 2, C = Mission 2 goal, D = Mission 3 obstacles, E = Mission 3 goal, F = Mission 4 obstacles, G = Mission 4 goal, H = Mission 5 obstacles, I = Mission 5 goal.
- **Cost icon convention:** blue triangle = Stealth only, red circle = Fighting only, red triangle inside a blue circle = "either" (any mix). Alarm = clock circle. Types: person, animal, equipment, location, door.
- **Mission 4 goal is "either 18"** (any mix of Stealth/Fighting) plus the Prisoner equipped — the goal icon is the combined "either" glyph, not a plain Fighting circle.
- **Radio Tower has no mission letter** → it belongs to the base 22-card Obstacle Deck (that is the 22nd obstacle; without it the count is 21).
- **Misdirect** (Radio Tower reward): 2 Stealth per card placed in the Play Area from hand (printed "2", not 1).
- **Siren** (letter B obstacle): bottom-half text is *"When discarded, place every card in the line on the Obstacles Discard. Only raise the alarm for the Siren."* — an on-exit effect, engine handler `flushLineToDiscardOnExit`.
- **Guard Uniform** comes from Locker Room (letter B), which is injected exactly when Mission 2 starts — consistent with C2 (the Mission 2 goal requires it equipped).
- Duplicate copies are encoded as `copies` in `js/data/cards.json` (38 unique definitions, 54 physical cards); the engine expands them into deck instances.

## 9. M3 engine interpretations (2026-11-14)

These are the calls the engine makes where the printed rules are silent. Flagged for a designer check.

- **[I] Line Scroll model.** The conveyor is implemented as: the rightmost card exits, then only cards with an *extra* slide (Patrolling Guard) move again. A card is only "pushed off" if it is already at the right edge when its extra step happens (matches C5).
- **[I] Alarm clamp.** The counter never exceeds 50: it is clamped at 50 and the game ends immediately.
- **[I] Dormitory ("facedown cards don't slide").** Implemented as: face-down cards in the line do not take the extra step during scroll. Cards behind them are not physically blocked — the conveyor is treated as positions, not as a chain. Revisit in M4 if it ever matters.
- **[I] Spending an equipped item.** Keycard / Chloroform / E.M.P. pay for one interaction on an obstacle whose printed icon matches the item's icon (**door / person / equipment**). Using one discards it: because the item card is an obstacle card, it joins the **obstacles discard** (the pile the conveyor reshuffles from), so it can come back round and be equipped again. No resources are spent when an item pays.
- **[I] KEEP card in hand at Card Refresh.** C9 protects KEEP cards in the Play/Equip Areas. A KEEP card that happens to be in your **hand** is discarded like any other hand card.
- **[I] Bazooka / Optic Camouflage.** "Discarded to the obstacles discard instead of your own" is implemented as: when the card is played it goes to the **Obstacles Discard**, so it comes back through the line as an obstacle. Optic Camouflage is a KEEP item and is equipped rather than played; its clause is inert until M4 gives items an explicit "use" action.
- **[I] Mission progression and the hand.** Rules step 5 lists Play Area + discard + deck; the cards still in hand when a mission is completed are folded into the reshuffled deck, then 4 (or 5) are drawn. This keeps the 54-card conservation invariant true.
- **[I] Mission 3 goal.** Checked as `hand.length >= 7` at Mission Check.
- **[I] Keycard / Chloroform / E.M.P. (`discardToInteract`).** "Place <item> in your discard to interact with a person/equipment" is read as: the item **replaces the resource cost** of one interaction with a matching obstacle type (the interaction is still Disarm or Knock Out, and still consumes the turn's interaction). The item moves Equip Area → discard immediately. Requires a designer check: the printed wording could instead mean "in addition to paying the cost".
- **[I] Inspector (`flipLastLineCardFaceUp`).** The flip happens **before** the exiting card leaves the line, so a knocked-out card that Inspector flips face up *does* raise its alarm on exit — that is the only reading that makes the effect do anything. "'When appears' effects activate" is implemented as re-running the card's appearance effect.
- **[I] Dormitory (`faceDownCardsDoNotScroll`). "At the Line Scroll, facedown cards don't slide to the right. Faceup cards still do." Implemented as: while Dormitory is face-up in the line, the card that leaves the line is the **rightmost face-up** card; face-down cards hold their position. Without this, knocked-out cards would leave the line and Mission 5 ("knock out the six cards in the line") would be unwinnable with only three interactions per turn. **(Revised 2026-11-15: see §10 — the conveyor now jams when the card at the exit is face-down, and an extra slide is blocked if a face-down card sits in its way.) (Revised again 2026-11-20, designer ruling: see §11 — the exit never jams.)**
- **[I] Clumsy Guard (`knockOutAdjacentInsteadOfInteract`).** You pay Clumsy Guard's cost, it stays in the line, and an **adjacent** card is knocked out instead. Only cards orthogonally adjacent in the line are legal targets; the engine rejects anything else.
- **[I] Hand size.** The "draw four (or five)" rule caps the hand at the *start* of the turn; cards drawn mid-turn (Yard Door, Patrolling Guard, Laser Hall, Siren) can push it higher. The invariant therefore only flags implausibly large hands (> 12), not a hand above the draw size.
- **[I] Line size during a turn.** Disarming removes a card from the line and the line is only refilled at Card Refresh, so the line can be shorter than 6 mid-turn. The invariant now checks "at most 6", not "exactly 6".

## 10. Card-effect audit fixes (2026-11-15)

Full card-by-card table in `docs/card-effect-audit.md`. What changed in the engine:

- **Guard Dog** now stops in the slot *immediately before* the first face-up person to its right (it previously slid past that person). Still only looks right — see Q1.
- **Flammable Barrel** captures the two neighbour slots *before* disarm removes it, so it knocks out the cards that were actually beside it. The knock-outs are free of the interaction limit (Q9).
- **Patrolling Guard** knocked out face-down loses its extra slide (face-down cards ignore their type and effect).
- **Siren** knocked out face-down no longer dumps the line on exit.
- **Dormitory** holds face-down cards in place: a face-down card also blocks a Patrolling Guard's extra step. (It no longer stops the exit — see §11.)
- **Mission goals are type-specific.** Mission 1 (blue 6) is Stealth, Mission 2 (red 6) is Fighting, Mission 4 (combined glyph, 18) is any mix. Stealth could previously satisfy the Fighting goals.
- **Plan Ahead** now keeps exactly one of the three scouted cards in hand and puts the other two back in a chosen order.
- **Optic Camouflage**'s printed 4 Stealth is now granted when the item is used from the Equip Area (Q5).
- **Per-turn item resources** (`oncePerTurn`) are limited to Map, Guard Uniform and Prisoner. Cards whose printed number is a one-shot use (Bazooka, Optic Camouflage) no longer generate that resource every turn.

**The line is a six-slot conveyor** (`state.line` has six entries; an empty slot is `null`): a disarmed card leaves a hole, the rightmost *occupied* card is discarded at the Line Scroll, everything then slides one place right to fill the hole, and new obstacles enter at the left end at Card Refresh. Adjacency (Watchtower, Clumsy Guard, Guard Dog) is measured in slots, so a hole breaks adjacency. Rulings from the BoardGameGeek clarification thread are recorded in `docs/card-effect-audit.md` §4.

---

## 11. Designer playtest fixes (2026-11-20)

Manuel Correia played the build and filed six reports. The engine-facing changes:

- **The exit never jams.** "Add the last card in the line to the obstacles discard" is not a slide. The rightmost
  occupied slot always empties, quietly if the card there is face-down. Dormitory's "facedown cards don't slide"
  only holds those cards in place, so a face-down card parks the stretch behind it. The old reading — nothing moves
  at all when the exit card is knocked out — was a softlock in Mission 4, because a knocked-out card can never be
  interacted with again.
- **Two names, one card.** On the belt a card is the obstacle (Yard Door); in the agent's hands it is the item
  printed on the top half (Throw a Rock). `Engine.agentName(def)` and `UI.itemName(def)` are the only places that
  decide which name is used; nothing else hard-codes a card name.
- **"X or Y" is always asked before anything else.** A card with an `alternative` reward throws if it is played
  without a choice. The UI now asks for the choice before looking at the draw deck, and only offers the options
  that are actually possible (no "draw a card" when the deck and discard are both empty).
- **The training run is not the game.** A practice board is never written to the resume slot, and `Exit training`
  restores the campaign position the player stepped away from.
- **Resume is validated.** A game over clears the resume slot, and a loaded state is only restored if its shape and
  every card id resolve against the current registry.

*[Cn]* = designer clarification #n from the 2025-09-30 session. See `docs/video-validation.md` for the full validation report.

## House rules (our additions, off by default)

- **Quick Hands.** Equipping a KEEP item grants one extra interaction that turn, so items become an early-game way to act twice. The printed rules do **not** say this — equipping is instant (rules.md:61) but nothing grants an extra interaction, and "once per turn" passives are resolved when the item is equipped and at each Card Refresh (see §4), so a freshly equipped item cannot help in the turn it arrives. Implemented as `state.rules.quickHands` behind a top-bar toggle; the engine grants the interaction in `equipCard()` for every route into the Equip Area (disarm, drawn item, refresh). Never enable it if you want a faithful play of the printed game.
