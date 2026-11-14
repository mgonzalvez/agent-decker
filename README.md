# Agent Decker — browser player

A static, offline-friendly web implementation of **Agent Decker**, the solo deckbuilding game by **Manuel Correia** ([gamesbymanuel.com](https://gamesbymanuel.com)), licensed **CC BY-NC 4.0**.

Play the full five-mission campaign in any modern browser. No accounts, no server, no build step — it is plain HTML/CSS/JS served by GitHub Pages.

![tests](https://github.com/mgonzalvez/agent-decker/actions/workflows/test.yml/badge.svg)

**Live game:** https://mgonzalvez.github.io/agent-decker/ *(needs Pages enabled once — see "Deploy" below)*

> This is an unofficial implementation for personal play. It is not for sale, and all game content, rules and art remain © Manuel Correia.

## Play it locally

```bash
python3 -m http.server 8000
# open http://127.0.0.1:8000
```

Append `?seed=12345` to the URL for a reproducible shuffle. Your game auto-saves to `localStorage`, so refreshing the page resumes where you left off.

```bash
node --test js/tests/*.test.mjs   # 56 tests: rules, invariants, campaign, UI
```

## How a turn works

1. **Use Cards** — play any number of hand cards for Stealth / Fighting.
2. **Interact** — pay an obstacle's cost, then Disarm (take it; KEEP items go to the Equip Area) or Knock Out (face down, no alarm). One interaction per turn at first; mission rewards raise the limit.
3. **Mission Check** — you must pay the whole goal in a single turn.
4. **Line Scroll** — the rightmost card leaves the line and raises the alarm by its value.
5. **Card Refresh** — refill the line to 6, discard your hand and Play Area, draw a fresh hand; unspent resources evaporate.

Alarm reaches **50** → game over. Score = alarm at the end of each mission, summed; **lower is better**.

## Project layout

```
index.html              the game (one page)
css/styles.css          layout, card styling, animations
js/state.js             seeded, serializable game state + invariant checks
js/engine.js            pure rules engine (no DOM, injectable RNG)
js/actions.js           player intent -> engine
js/ui.js                board rendering, overlays, accessibility
js/save.js              localStorage save/continue + score log
js/audio.js             synthesized Web Audio SFX (muted by default)
js/data/cards.json      all 54 cards, with printed text
js/data/missions.json   the five missions: goals, letters, rewards
js/tests/               node:test suites
assets/cards/           54 card crops + a deck back, from the printed PDFs
upstream/               original print-and-play source (read-only)
docs/                   rules validation, turn flowchart, notes
PLAN.md                 mechanics, architecture, milestones
AGENTS.md               contributor guidelines
```

## Where the rules come from

- `upstream/AgentDecker_rules.md` and `upstream/AgentDecker_player_aid.md` — canonical rules text.
- `upstream/AgentDecker_cards_full_art.pdf` / `upstream/AgentDecker_cards_full_art.pdf` — the printed cards, transcribed card-by-card into `js/data/cards.json`.
- `js/data/effects-notes.md` — every designer clarification plus every case where the printed wording was ambiguous and we had to make a call.
- `docs/video-validation.md` — the rules cross-checked against the designer's playthrough video.

If a card behaves unexpectedly, check `js/data/effects-notes.md` before filing a bug: the interpretation is documented there.

## Known limitations

- No mobile-specific design pass beyond responsive scaling.
- The ambient music mentioned in the plan is not implemented; sound is limited to synthesized effects.
- Bot test runs do not beat the campaign — the naive test bot is not a good agent.

## Deploy

The site is plain static files, so GitHub Pages serves it directly:

1. Repo → **Settings → Pages**
2. Source: **main branch** (root of the repository)
3. Save. The game appears at https://mgonzalvez.github.io/agent-decker/

There is no build step, no dependency install, and no CDN: every asset is committed in the repo, so a cold cache only needs the files themselves.

## License

Game design, rules and artwork: © Manuel Correia, CC BY-NC 4.0. The implementation in this repository is shared under the same CC BY-NC 4.0 licence, so nothing here can be commercialised.
