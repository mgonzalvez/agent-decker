# Video Validation Report

**Purpose:** Validate `upstream/AgentDecker_rules.md`, `upstream/AgentDecker_player_aid.md`, and `docs/AgentDecker_turn_flowchart.*` against the designer's own playthrough, and record the rules clarifications that followed.

**Video:** "How to play Agent Decker" — Manuel Correia, 4:45 — https://www.youtube.com/watch?v=ArPVpr5TNcg
**Transcript:** `docs/transcript-how-to-play.txt` (auto-captions, 2025-09-30; mishearings noted inline)
**Clarifications:** `js/data/effects-notes.md` (authoritative, C1–C10)

---

## 1. Video evidence vs. written rules

| # | Video evidence (≈timestamp) | Written rules | Verdict |
|---|---|---|---|
| 1 | "54 standard size cards and two tokens" | Components: 54 cards + 2 tokens | ✅ Match |
| 2 | "five missions, each about 20 minutes" | ~20 min/mission, 5 missions | ✅ Match |
| 3 | Starting deck: "PUNCH and HIDE, each gives one resource — fighting or stealth" | 8 starting cards give Stealth/Fighting (PDF p1: 3 HIDE + 5 PUNCH) | ✅ Match (the count comes from the card PDF, not the video) |
| 4 | "draw four cards" | Hand of 4 | ✅ Match |
| 5 | Obstacle card anatomy: name, type, cost, alarm-on-discard; top half = disarm reward | A1–A4 + top-half description | ✅ Match |
| 6 | Mission 1 goal: "get six stealth" | Goals have costs; paid at Mission Check | ✅ Match (goals = resource cost, per C2) |
| 7 | Disarm Security Camera: "pay the two stealth" | Pay cost, any mix | ✅ Match |
| 8 | Disarmed card "goes in your discard… it will show up [when the deck reshuffles]" | Disarm → **Play Area** | ✅ **Resolved** — see §2 |
| 9 | "at the end of the turn you move one step… the last card in the line is discarded… the alarm raises if it reaches 50 it's game over" | Line Scroll + Alarm 50 | ✅ Match |
| 10 | "check the obstacles for any effects… they can alter the card order, e.g. patrolling guard moves faster" | Effects activate on scroll | ✅ Match (per C5: 2 spaces, can exit + alarm) |
| 11 | Guard Dog enters line: "it will go to the first person he finds — the guard" | Card text: slide until adjacent to a person | ✅ Match (per C4: slides **right** to first person on its right) |
| 12 | "instead of disarming you can knock them out… it won't raise the alarm" | Knock Out: face-down, no alarm | ✅ Match |
| 13 | "now that your deck is out of cards… shuffle your discard to form the new deck" | Always reshuffle discard when deck runs out | ✅ Match |
| 14 | Mission complete: "you found the map… it says keep, so you keep it on the table, one stealth once per turn" | Reward top half → Equip Area; permanent resources | ✅ Match (per C6) |
| 15 | "take the mission obstacles labeled B and shuffle them along with the line, obstacles deck and discard — forms the deck for mission two" | Progression steps 2+3 | ✅ Match |
| 16 | "your goal is to get six fighting **and the guard uniform**" | Rules never state goals can require *items* | ⚠️ **Gap in rules.md** → resolved by C2 (item must be **equipped**, whole goal paid in one turn) |
| 17 | "write down your score… and reset the alarm" | Record alarm, reset to 0 | ✅ Match |

## 2. The one apparent contradiction — resolved

The video (line 8) says disarmed cards go to **your discard** and re-enter mid-mission when the deck runs out; the written rules route used cards through the **Play Area**. No real conflict: rules.md step 4 of Card Refresh moves *Play Area → discard* at the end of each turn, so a disarmed card returns to the deck mid-mission exactly as the designer demonstrates. The Play Area is simply a per-turn staging zone. **No flowchart or aid change needed.**

## 3. Gaps found in rules.md (now closed by clarifications)

| Gap | Resolution (see `js/data/effects-notes.md`) |
|---|---|
| Unspent resources: carry over or not? | **C1** — evaporate each turn |
| Goals: can they include items? paid over multiple turns? | **C2** — items must be equipped; entire goal paid in a single Mission Check |
| What does Don't Move do? | **C3** — top half only: 3 Stealth when played from hand; inert in the line |
| Guard Dog slide: who moves, which way? | **C4** — the dog slides **right** to the first person on its right |
| Patrolling Guard extra slide at the edge? | **C5** — 2 spaces per scroll; if pushed off, it exits and raises alarm 5 |
| Item equipping mandatory? | **C6** — optional, effectively required |
| Does Knock Out count as an interaction? | **C7** — yes; 1 interaction/turn = 1 disarm or 1 knockout |
| "New rules" rewards? | **C8** — rule changes printed on deck cards (Siren/"Gear up" example) |
| Are KEEP cards discarded at turn end? | **C9** — no *automatic* discard: the refresh step excludes them. But a KEEP card **deliberately used for its effect** goes to the discard pile and, once redrawn, can be equipped again. Siren's N = any KEEP-icon card in the player's areas |

## 4. Flowchart status

`docs/AgentDecker_turn_flowchart.svg/.png` validated against the video's turn play: all four phases, both game-over branches, the mission loop, and the Disarm/Knock Out choice are consistent. **One update applied:** step 4 now notes that unspent resources evaporate (C1), and the Mission Check diamond notes goals must be fully paid that turn (C2).
