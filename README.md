# DeliciousMove

A browser match-3 game built with TypeScript, PixiJS, GSAP, and procedural Web Audio.
The core supports deterministic simulation when supplied with a seeded random source.

## Run locally

Use Node.js 20 to match the GitHub Actions test/build runtime. Node.js 24 is also
verified locally. Install npm with Node.js, then run:

```sh
npm ci
npm run dev
```

Vite serves the game at http://localhost:3000 by default. If that port is occupied,
check the URL printed by Vite.

```sh
npm test          # Headless engine, orchestration, and presentation-contract tests
npm run build    # TypeScript checks and production bundle in dist/
npm run preview  # Serve the production bundle locally
```

The GitHub Pages workflow in `.github/workflows/deploy.yml` tests, builds, and
deploys pushes to `main`. Enable GitHub Actions as the Pages source in repository settings.

Vitest runs in a headless Node environment. `vitest.config.ts` loads
`tests/setup.ts` before test modules: it supplies the minimal `navigator` fixture
required by Pixi's import-time browser detection and reinstalls it before each test.
Do not rely on browser globals supplied by newer Node versions; tests must also
pass on the workflow's Node 20 runtime. This fixture is test-only and does not
change browser language detection in the game.

## Controls and matching

- Drag a candy onto a neighbor, or tap two adjacent candies to swap them.
- Normal swaps must form a match. Rejected swaps return to their original positions without spending a move.
  A normal swap must change the colors in its two cells and involve a moved candy
  in the resulting match; an unrelated match elsewhere cannot validate it.
- Tap a special to activate it directly, or swap it with a neighbor to activate it.
- Rocks cannot be swapped or activated and are immune to special blasts.
- After ten seconds of inactivity, the game highlights a possible move.
- Open **Settings** (gear) and use the language selector, or press **L**, to change language. The selector shows the current language. The browser language is used initially;
  unsupported languages fall back to English. Explicit choices are remembered.
- **New Game** starts a fresh run after confirmation; it preserves the old checkpoint in a recovery archive.

Match rewards:

- Three in a row: clear the matched candies.
- Four in a row: create a striped candy. **The player's swap axis determines its firing axis**:
  an upward/downward swap creates a column-clearing candy; a leftward/rightward swap
  creates a row-clearing candy. Two-tap swaps follow the same rule.
- Four formed by a later cascade: use the matched line's orientation, because that
  cascade has no player swipe. Stripes clear the entire row or column in both directions.
- Five in a row: create a color bomb.
- Intersecting horizontal and vertical matches: create a wrapped candy.
- A 2×2 square: create an airplane.

Rules run in priority order: five-in-a-row, intersection, square, four-in-a-row, then
normal matches. Spawn placement prefers a cell involved in the swap. An existing
special in that cell is preserved for detonation by choosing a plain candy when possible.
A newly created special survives its creation pass, including chained blasts.

Colored specials participate in every matching pattern, including 2×2 squares.
Existing specials caught in a match fire once; newly created specials cannot be
targeted or triggered until a later pass. If every matched candy is already special,
the original effect at the upgraded cell still fires before the new candy survives.

Overlapping patterns share tile ownership: each candy is counted once. Higher-priority
complete patterns claim their reward first; overlapping shapes clear any remaining
matched candies without reusing claimed tiles to create another reward. Equal-priority
ties use deterministic scan order (horizontal before vertical; squares top-left first).

## Responsive interface

- Narrow layouts keep level/settings at the top, moves and score progress directly above
  the board, and total score/rescue shuffles underneath. Windows at least 900px wide
  use a sidebar even when taller than they are wide. Short windows at least 600px
  wide also use the compact sidebar.
- Desktop board size follows available width and height, up to a 1040px canvas.
  Sidebar width, text, and spacing scale with the board. The complete gameplay group
  stays centered; no space is reserved for unimplemented features or advertising.
- Settings contains language, sound, diagnostics, and New Game. The native dialog
  supports keyboard focus containment, Escape, and outside-click dismissal.
- A compact checkpoint indicator stays visible; full save details are available in
  Settings. Storage/recovery warnings remain visible beside the game. Saving still
  happens only after a completed level, never during a level.
- Best level cleared and best total score appear beneath the run totals. These lifetime
  records update only at level completion, survive New Game, and start from an existing
  completed checkpoint when upgrading. Clearing browser site data removes them.
- CSS owns the board region, using dynamic viewport units and safe-area insets.
  Pixi measures that region via ResizeObserver; canvas/grid resizing is deferred until
  turn playback settles. Extremely short windows can scroll instead of clipping controls.
  In short landscape layouts the board stays visible while the objective sidebar scrolls.
- Controls have at least 44px touch targets. Long labels and large scores can wrap;
  the board retains square cells and correct input coordinates at every size.

Validate both languages at 320px/375px/412px phone widths, tablet portrait,
wide desktop, and short landscape, including bonus-phase badges and the settings dialog.

## Specials and combinations

- Striped: clears its row or column.
- Wrapped: clears a 3×3 area.
- Airplane: clears takeoff neighbors and flies to a target.
  Every airplane variant randomly prefers tiles that help unfinished objectives:
  jelly, ice/blockers, required colors, or tiles below cherries in the same gravity
  segment. Ingredients and rocks are never direct targets. With no useful target,
  planes favor activatable specials, then other eligible tiles. Targeting uses the seeded RNG.
- Color bomb: clears the matched or swapped color; a blast without color context
  selects the most abundant color.

Swapping specials combines their effects:

- Striped + striped: a row-and-column cross.
- Striped + wrapped: three rows and three columns.
- Wrapped + wrapped: a 5×5 area.
- Color bomb + normal: all candies of that color.
- Color bomb + striped: converts that color into stripes and triggers them.
- Color bomb + color bomb: clears breakable tiles across the board.
- Airplane + airplane: three airplane targets.
- Airplane + striped: a cross at the flight target.
- Airplane + wrapped: a 3×3 blast at the flight target.
- Color bomb + airplane: converts that color into airplanes and launches them.

Rocks remain immune to these effects.
Color-bomb conversions also leave rocks unchanged. Rocks' stored placeholder color
does not count toward color-bomb target selection or bonus-refill color matching.
Combo participants do not fire their original effects again when hit by a later
chain, except partners explicitly detonated by a conversion combo.

## Endless progression and bonus play

Move/shuffle budgets repeat a four-tier difficulty cycle. Every newly generated level
requires its minimum score **and all additional board objectives**:

1. Easy: 26 base moves, 3,500 initial target, four rescue shuffles.
2. Medium: 22 base moves, 5,600 initial target, three rescue shuffles.
3. Hard: 18 base moves, 8,050 initial target, two rescue shuffles.
4. Very Hard: 15 base moves, 11,200 initial target, one rescue shuffle.

Each subsequent four-level cycle multiplies targets by 1.25, rounded to the nearest 50.
Configuration lives in `DEFAULT_ALTERNATING_TUNING` and `DEFAULT_DIFFICULTY_PRESETS`
in `src/core/LevelProgression.ts`.

Completing every level objective starts the **bonus phase**; it does not immediately open the victory
modal. Further moves stop consuming the move budget. Bonus refills favor colors that
avoid new matches and gradually introduce rocks: a 35% roll for an eligible empty cell,
at most two rocks per refill wave and at most one newly spawned rock per column per wave.
Bonus refills avoid both lines and squares when an allowed color is available,
including squares containing existing specials.
The persistent **Bonus round** banner explains the frozen moves, extra scoring, and
why play continues. It disappears when the next level starts.

When no legal swap or direct special activation remains during bonus play, the level
ends in victory. The next level receives its base moves plus all unused moves from
the previous level. Level score resets; global score continues accumulating.
Restarting after a loss resets the run, global score, and carried moves.

Before completing all objectives, the run ends if the move budget expires or a deadlock cannot
be rescued. A deadlock spends one rescue shuffle; exhausted rescues or a failed shuffle
end the run. Each level grants at least one rescue. Opening-board reshuffling is free.

Deadlock frequency depends on board rules, player choices, and the current phase.
Earlier measurements from older rules are not estimates for the current game.

## Level objectives and board features

Level 1 teaches scoring. Levels 2–10 introduce color collection, jelly, ice,
frosting, crates, shaped boards, cherries, chocolate, and mixed objectives, in that
order. Level 11 returns to scoring. These ten families then repeat with rotating
colors and notched, bridge, or separated-island layouts. Feature targets and blocker
counts remain bounded; difficulty budgets and banked moves still apply.

- **Objectives:** all counters must finish before bonus play. Score contributes to
  the global total on every level. Neither minimum score nor a collection/delivery
  goal can substitute for the other. The score header shows the minimum; goal cards
  show additional requirements. Removed candies and candies used to create a special count once by color.
- **Jelly:** pink cell outlines stay in place. Clearing or matching the candy on
  that cell removes a layer, including when it evolves into a special. A cherry
  delivery alone does not remove jelly.
- **Ice:** cell-anchored shells lock candies against swapping, matching, activation,
  gravity, and shuffling. Nearby candy clears or direct blasts remove one layer per
  cascade pass. The candy survives the hit that thaws it.
- **Frosting / crates:** fixed blockers start with two/three layers, shown as dots.
  Orthogonally adjacent candy clears or direct special hits remove one layer per
  pass, regardless of how many simultaneous hits occur. Removal opens their cell.
- **Shapes:** holes are not empty cells. Matches cannot bridge them; gravity stops
  at gaps, ice, and fixed blockers. Each vertical segment refills independently.
  Internal refills fade in locally rather than crossing occupied cells or holes.
- **Cherries:** movable, non-matching ingredients cannot activate or be destroyed or
  converted by specials. Swaps still need a candy match or a special activation.
  Gravity carries cherries to green arrow exits at the bottom of playable segments;
  each delivered cherry counts once and is not respawned. Shuffling preserves them.
- **Chocolate:** one eligible neighboring plain candy is replaced after a valid turn
  unless any chocolate was removed during that turn's cascades. It cannot cross
  gaps or overwrite ice, exits, blockers, ingredients, or special candies. Rejected
  swaps and rescue shuffles do not cause growth. Clearing all chocolate stops it.

The HUD displays localized goals and a context hint. **Settings → Board guide**
explains the markings. Goal cards wrap on phones and scale with the desktop sidebar;
small/short windows can scroll instead of hiding controls.

For isolated local QA, development builds accept `?practiceLevel=2` through
`?practiceLevel=100` (for example `http://127.0.0.1:3000/?practiceLevel=10`).
Practice uses seed 20 and an in-memory store, never the player's localStorage save.
The practice entry point is excluded from production builds. Reload resets practice.

## Saved progress

Progress is saved locally **only when a level is completed**, after bonus play and
animations finish. Reloading restores the last victory screen; **Next Level** continues
with banked moves and global score. Unfinished-level moves are not saved. Before the
first completed level, refreshing starts a new run.

Saves include schema/rules versions, validation, sequential migration hooks, and a
previous-checkpoint backup. Corrupt or unsupported saves are preserved instead of
overwritten. See [docs/SAVES.md](docs/SAVES.md) for storage behavior and the migration
workflow. Saves are local to the browser and origin; there is no cloud sync.

## Architecture and extension points

- `Board`: grid state and tile identity.
- `BoardFeatures`, `LevelBoardSetup`: playable-cell topology and authored object placement.
- `TerrainResolver`: layered damage, jelly removal, and once-per-turn chocolate growth.
- `ObjectiveTracker`: event-based objective counters independent of scoring.
- `BoardInitializer`: initial generation without existing line or square matches.
- `MatchDetector` and `IMatchRule`: run scanning and prioritized match recognition.
- `CascadeResolver`: match evolution, detonation, gravity, refill, and score events.
- `TileSpawner`: fills empty cells. `IRefillPolicy.beginWave()` supplies tile selection
  with wave-local state; `RandomRefillPolicy` and `BonusRefillPolicy` own phase rules.
- `SpecialResolver`: executes handlers registered in `SpecialRegistry`.
  `registerComboHandler(handler, priority)` accepts explicit precedence: lower numbers
  run first; equal priorities retain registration order. Custom handlers default to 0,
  and the generic color-bomb fallback runs at 1000. Use a negative priority to override
  an existing specific handler.
- `GameSession` and `ILevelProgression`: score, moves, phase state, and level configuration.
- `TurnCoordinator`: coordinates turns through `IAnimationSequencer`, passing tile IDs
  and positions. It does not depend on Pixi sprites or board-view internals.
- `IdleHintController`: requests hints through the separate `IHintAnimator` contract.
- `AnimationQueue`, `BoardView`, and effect presenters: sprite lookup and visual playback.
  The board exposes a typed `displayObject` for mounting into the Pixi stage.
  Cascade payloads are independent step-local snapshots; sprites own their presentation
  data. Playback cannot move domain tiles or mutate earlier/later cascade events.
- `SoundManager`: instance-owned audio context and mute state. `Game` explicitly shares
  one service across the HUD, modal, and animations; independent games can use separate services.
- `GameTelemetryService`: diagnostic history and snapshots. Input lock state arrives
  through a read-only callback, without importing input-controller code.
- `GameDebugController`: optional overlay and browser debug API.
- `LanguageService` / `LanguageControls`: typed EN/ES dictionaries, preferences and DOM controls.
- `ObjectivesView`, `TerrainView`, `FeatureAssets`: responsive counters and resolution-independent board markings.
- `SaveCodec` / `SaveStore`: validated, versioned checkpoints and browser-storage policy.
- `Game`: constructs and connects these services, binds session events, and handles layout.

Inject `IRandomSource` for core random decisions, for example
`new Game({ random: new SeededRandomSource(42) })`.
Reproducing a game requires the same seed, configuration, game version, and action sequence.
Cosmetic animation, audio noise, hint selection, and diagnostic timestamps are separate
from deterministic core simulation.

New match rules and special handlers plug into their registries. New tile types still
need model definitions, rendering assets, and any relevant interaction rules.
New refill behaviors implement `IRefillPolicy`; alternative level curves implement
`ILevelProgression`.

## Diagnostics

The overlay and `window.__GAME_DEBUG__` expose recent actions, session state, input lock
state, board contents, and copyable JSON reports. The latest valid turn also includes
its pre-turn board/session/RNG, resolved board, interaction, and individual cascade
snapshots to diagnose intermediate visual failures. Older reports without those
fields cannot reproduce an exact unknown action sequence. Browser commands include
`getState()`, `getHistory()`, `dump()`, `copyReport()`, `toggleOverlay()`,
`unlockInput()`, and `forceShuffle()`.

Debug unlock respects whether the session can accept moves. Manual reshuffling is
ignored while input is locked or the session cannot accept a move.

## Feature backlog

See [docs/ROADMAP.md](docs/ROADMAP.md) for prioritized ways to add variety.
These are proposed features, not implemented mechanics.
