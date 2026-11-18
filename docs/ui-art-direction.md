# Art direction: making the table look made, not generated

**Why this document exists.** Feedback on the live site: the chrome reads as AI-generated —
a dark dashboard with cards, chips, meters and glowing buttons, dressed in an "amber on navy"
spy theme. The printed game already has a strong visual language. The rework replaces the
dashboard with that language: the player is at a table with physical objects, not inside an app.

**Status:** PRs 1–4 landed, PRs 5–6 partly. The rubric in §5 is enforced by tests in
`js/tests/ui.test.mjs`; the remaining work is switches instead of dropdown menus and drawn
sprites for the lamp and the belt.

Reference, from the printed cards themselves (`assets/cards/`):

| Printed motif | Where it appears | How the UI should use it |
|---|---|---|
| Hex-grid felt (blue for Stealth, orange for missions) | every card field | the table surface, not a flat `#071019` |
| Diagonal black band splitting top/bottom halves | every obstacle and mission card | section edges, header, modal edges |
| Stencil/transport display type, mixed case | "PATROLLING GUARD", "MISSION ONE" | headings — not letter-spaced all-caps micro-labels |
| Icon grammar: blue triangle = Stealth, red circle = Fighting, circle+triangle = either, clock = alarm | cost/alarm fields | resource and alarm displays use the printed glyphs |
| Yellow KEEP stamp, rotated | item cards | equipped items get a stamp, not a border |
| Corner letter (A–I) | mission cards | zone labels as corner marks |
| Person / animal / equipment pictograms | obstacle types | type markers, drawn, not emoji |

---

## 1. The hallmarks, identified in this codebase

Concrete, with the file that produces the effect.

### Structure

1. **One uniform card recipe for everything.** `.panel`, `.area`, `.stack`, `.deck-panel`,
   `.turn-panel`, `.mission-banner`, `.alarm`, `.coach`, `.log-zone` all resolve to
   `border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: 12–16px`.
   39 `border-radius` declarations, 14 of them exactly `8px`. Identical containers = dashboard.
2. **Title + subtitle header on every panel.** `panel-head`, `panel-title`, `panel-sub` ("The Line /
   conveyor — the card at the far right exits and raises the alarm", "The Agent / hand · gear ·
   objective", "Mission Log / transcript of the run"). The `word · word · word` gloss is a
   generator tell.
3. **Centered, symmetric grid.** `.board { max-width: 1180px; margin: 0 auto; }` with three equal
   stacked panels. No focal point, no asymmetry, no sense that anything was placed by hand.
4. **Auto-fill grid** for areas: `repeat(auto-fill, minmax(132px, 1fr))`.

### Controls and readouts

5. **Pill chips** for resources (`border-radius: 999px`) — the single most recognizable AI-UI
   component.
6. **Progress bar meter** (`.alarm-bar` + `.alarm-fill` percentage) and a **glowing status dot**
   (`.signal-dot`, 10px circle with box-shadow glow). Meters and status dots are dashboard furniture;
   the rules describe *two alarm tokens on a 0–50 counter*.
7. **Dropdown menus with ▾ caret characters** ("Learn ▾", "Table & audio ▾", "Related sites ▾").
8. **Toggle labels in `Name: on/off` form** ("Fast table: off", "Quick hands: off", "Sound: off").
9. **Uniform button hover** — every button becomes `var(--accent)`, and every display button is
   uppercase mono.
10. **`empty` placeholder text** in muted grey.

### Decoration

11. **Radial gradient hero + SVG noise texture on `body`** — "subtle gradient + noise" is the
    standard generated-site background.
12. **Glow as a communication device**: `actionGlow`, `barFlash`, `dangerFlash`, `signalPulse`,
    `targetPulse`, `exitGlow`, `alarmPulse` — 8 keyframes, most of them infinite pulses with
    `box-shadow: 0 0 Npx`.
13. **Hover lift on every card** (`translateY(-4px) rotate(-1.2deg)`), applied whether or not the
    card is actionable.
14. **Blanket uppercase + letter-spacing**: 25 `text-transform: uppercase`, 31 `letter-spacing`.
    Uppercase stencil is authentic on the cards; uppercase on the seed readout, the save status and
    the log stamps is not.

### Type

15. **Big Shoulders Display + IBM Plex Sans + IBM Plex Mono.** A competent pairing, but the
    Plex duo is the default "technical web" voice of the last five years and it does not match the
    printed stencil lettering on the cards.

### Copy (the strongest tell of all)

16. Balanced, reassuring, em-dash-heavy sentences:
   - "Mission complete. The complex never saw it coming."
   - "Nice work, Agent — Mission One is done with the alarm at 4."
   - "Guards and radios everywhere — expect harder obstacles and a line that rearranges itself."
   - "A run is five missions. Everything else follows from these five rules."
   - "The housekeeping that keeps a turn readable."
   - "Keep this open while you play."
   Uniform fluency, no voice, no terseness. A human briefing sheet is clipped: "MISSION ONE —
   CLOSED. Alarm 4."

17. **Instructional micro-copy everywhere** ("Click **Play** on a hand card to use it …",
   "Click a card to read it at full size."). Explaining the interface in a muted paragraph is a
   generated-UI habit; good affordances explain themselves.

---

## 2. Target: the table, not the dashboard

Five rules the rework must obey.

1. **Every object is a thing.** Belt, box, folder, punch card, stamp, typewired transcript,
   shredder, switch, lamp. If a UI element has no physical analogue in the game, it is not the
   game's UI.
2. **Materials over gradients.** Flat printed ink, felt hex-grid, paper, cardboard, brass. One
   gradient max, and it is the printed card gradient already in the art.
3. **Asymmetry and imperfection.** Objects are placed, not aligned to a grid: taped at 2°, a
   slightly crooked stamp, a pile of cards with different offsets, a corner punch hole.
4. **Motion is physical, not decorative.** A card slides because the belt moves. A token clicks
   because the alarm went up. Nothing pulses for ambience.
5. **Text is clipped and diegetic.** Short, typed, in-world. No subtitles under headings, no
   explanatory grey paragraphs, no aphorisms.

Palette, sampled from the cards rather than invented:

```css
--felt-blue:  #1f5f8f;   /* Stealth card field */
--felt-orange:#d99433;   /* mission card field */
--print-black:#0d1014;   /* the diagonal band */
--paper:      #f2ece0;   /* briefing sheets, the log */
--ink:        #1b2431;
--stamp-red:  #c0392b;   /* alarm, redaction */
--stamp-yellow:#e8c14b;  /* KEEP, play buttons */
```

---

## 3. Component rework

### 3.1 Header → case file, not a toolbar

**Now:** flex row of brand text, a `mission-banner` card, an `alarm` card, nine buttons.
**Instead:** a printed header sheet.

- Wordmark lifted from the deck back: "AGENT" in thin stencil over "DECKER" in heavy stencil, on
  the diagonal band. SVG, not text styling.
- Mission as a punch-card: paper stock, punched corner hole, letter A–E in the corner, the goal
  typed in, a red tab for the current objective.
- Alarm as **two tokens** (tens and ones) rendered as physical dials, matching the rules. The
  number is a consequence of the tokens, not a percentage bar. Above 40 the tokens sit in a red
  well and a lamp (a drawn bulb, not a glowing dot) is lit.

### 3.2 Panels → zones on the table

Delete `panel-head`/`panel-title`/`panel-sub` entirely. Zones are marked by what they are:

- **The Line** is a belt: a drawn strip with rollers, side rails, and an exit chute on the right.
  Face-down cards sit flipped with a "KO" stamp. A disarmed slot shows the belt itself (a hole you
  can see through), not a dashed placeholder box.
- **Obstacle deck / discard** are a box and a used pile, with the count written in grease pencil.
- **Equip Area** is a folder with a brass clasp and the equipped items tucked behind the flap.
- **Play Area** is a stack on the table, slightly rotated.
- **Bin** is a shredder: binned cards appear as strips.
- **Mission Log** is a teletype wire on paper: typed line numbers, no grouping headers, no pill
  stamps. Entries with `kind: 'mission'` are marked with a red pencil underline.

### 3.3 Controls → hardware

- Replace the three ▾ menus with **folder flaps** (physical tabs that open) or a printed
  "TABLE SETTINGS" slip that slides out.
- Sound/music/fast-table become **drawn switches**: rocker switch with two positions, a bulb for
  the alarm lamp. Labels read `AUDIO`, `BED`, `TABLE` — the state is visible in the drawing, so the
  label does not need `: on/off`.
- Undo becomes a **rewind lever**; Replay this seed becomes a stamp ("RUN AGAIN, seed 42").
- Hand cards: no separate Play button. The card is picked up (click) and played. Play is confirmed
  with the card moving to the stack and a stamped tally. Bin is a shredder slot next to the card.

### 3.4 Modals → the card lifted off the table

The modal is the object itself: the card, larger, with its shadow on the felt, and the payment
information as a typed slip of paper clipped beside it. No sticky header, no "Close" pill — a
physical "put it back" tab. Zoom = the card is held up; Escape puts it down.

### 3.5 Coach → a note in the margin

A handwritten note taped to the table corner (self-hosted OFL handwriting face, e.g. Caveat),
rotated 1.5°, with the coach text typed on it. No badge, no panel, no border.

### 3.6 Typography

| Role | Now | Proposed |
|---|---|---|
| Display / zone names | Big Shoulders Display, uppercase, .12–.16em tracking | stencil/transport face, **mixed case**, tighter tracking |
| Body / rules text | IBM Plex Sans | a serif or typewriter face for printed text (e.g. Newsreader / Courier-style OFL) |
| Typed readouts | IBM Plex Mono everywhere | keep a mono for the wire log only; numbers in the stencil face |

Drop letter-spacing except on the stencil wordmark.

### 3.7 Copy rewrite

| Current | Replaced with |
|---|---|
| "conveyor — the card at the far right exits and raises the alarm" | *(none — the belt drawing shows it)* |
| "hand · gear · objective" | *(none)* |
| "transcript of the run" | *(none)* |
| "Mission complete. The complex never saw it coming." | "MISSION CLOSED. Alarm: 4." |
| "Nice work, Agent — Mission One is done with the alarm at 4." | "Report filed. Next: MISSION TWO — 6 Fighting, Guard Uniform." |
| "Guards and radios everywhere — expect harder obstacles and a line that rearranges itself." | "They send guards and radios. The belt moves on its own." |
| "The housekeeping that keeps a turn readable." | "Gear. Bin. Rewind." |
| "Click a card to read it at full size." | *(none — cards are clickable)* |
| "Fast table: off" | switch with two stops, `TABLE` / `FAST` |
| "empty" | an empty space; when labelled, "nothing in the folder" |

Style rule: no sentence longer than 12 words; no em-dash aphorisms; no second-person coaching
("you should", "keep this open").

---

## 4. Assets to make (all committed, small, hand-written SVG)

`assets/ui/belt.svg`, `tokens.svg`, `folder.svg`, `shredder.svg`, `lamp.svg`, `switch.svg`,
`wordmark.svg`, `stamp-ko.svg`, `tape.svg`. Each uses jittered paths (not perfect rectangles) so
they read as drawn. Total budget: under 40 KB, no external tooling.

Textures: replace the body noise/gradient with the hex-grid felt taken from the card art —
a small repeating SVG tile at 2% ink.

---

## 5. Acceptance rubric (enforced by tests)

In `js/tests/ui.test.mjs`:

- No `border-radius` above 2 px anywhere in the stylesheet.
- No gradient at all; no `text-transform: uppercase`; no `infinite` animation.
- No `.chip`, `.alarm-bar`, `.alarm-fill`, `.signal-dot`, `.panel-head`.
- No caret glyphs (`▾`) or `class="hint"` in the markup; the board is built from `zone`s.
- Banned copy: "Nice work", "never saw it coming", "housekeeping", "Keep this open",
  "everything else follows" — checked across `js/ui.js`, `js/tutorial.js` and `index.html`.
- The line is a belt with a chute; face-down cards get a KO stamp; the Equip Area has a folder
  tab; the coach note is taped.
- The alarm pointer moves with the value and changes ink at 20 / 40 / 45.

---

## 6. Sequencing

| PR | Scope | Exit criterion |
|---|---|---|
| 1 | Palette from the cards; delete chips, panel headers, meters, glows; felt texture; asymmetric board | **done** — no pills, no gradients, no uppercase, no glow, zones instead of panels |
| 2 | Header as case file; alarm as two tokens + lamp | no `.alarm-bar`, no percentage meter |
| 3 | Belt, chute, KO stamps, card pickup instead of Play buttons | the line reads as an object, not a grid |
| 4 | Folder / stack / shredder / teletype log | side zones are objects |
| 5 | Switches instead of dropdown menus; modal as lifted card + typed slip | the three menus become flaps/switches (the ▾ carets are already gone) |
| 6 | Copy sweep + rubric tests | banned-string test passes |

Keep intact through all of it: keyboard access, Escape-to-close, `aria-live` alarm/log,
`prefers-reduced-motion`, Fast table, Undo, seeded replay.

---

## 7. What is *not* a problem

The mechanics presentation is not the AI tell. The diegetic per-card sounds, the seeded replay, the
strict icon/type gating, the training run and the turn flowchart are all specific and worth keeping
exactly as they are. Only the chrome and the voice need to change.
