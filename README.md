# DeliciousMove

A browser match-3 game built with TypeScript, PixiJS, GSAP, and procedural Web Audio.
The core supports deterministic simulation when supplied with a seeded random source.

## Run locally

Install Node.js and npm, then run:

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

## Controls and matching

- Drag a candy onto a neighbor, or tap two adjacent candies to swap them.
- Normal swaps must form a match. Rejected swaps return to their original positions without spending a move.
- Tap a special to activate it directly, or swap it with a neighbor to activate it.
- Rocks cannot be swapped or activated and are immune to special blasts.
- After ten seconds of inactivity, the game highlights a possible move.
- Use the EN/ES button or **L** to change language. The browser language is used initially;
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

## Specials and combinations

- Striped: clears its row or column.
- Wrapped: clears a 3×3 area.
- Airplane: clears takeoff neighbors and flies to a target.
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

## Endless progression and bonus play

Levels repeat a four-tier cycle:

1. Easy: 26 base moves, 3,500 initial target, four rescue shuffles.
2. Medium: 22 base moves, 5,600 initial target, three rescue shuffles.
3. Hard: 18 base moves, 8,050 initial target, two rescue shuffles.
4. Very Hard: 15 base moves, 11,200 initial target, one rescue shuffle.

Each subsequent four-level cycle multiplies targets by 1.25, rounded to the nearest 50.
Configuration lives in `DEFAULT_ALTERNATING_TUNING` and `DEFAULT_DIFFICULTY_PRESETS`
in `src/core/LevelProgression.ts`.

Reaching the target starts the **bonus phase**; it does not immediately open the victory
modal. Further moves stop consuming the move budget. Bonus refills favor colors that
avoid new matches and gradually introduce rocks: a 35% roll for an eligible empty cell,
at most two rocks per refill wave and at most one newly spawned rock per column per wave.

When no legal swap or direct special activation remains during bonus play, the level
ends in victory. The next level receives its base moves plus all unused moves from
the previous level. Level score resets; global score continues accumulating.
Restarting after a loss resets the run, global score, and carried moves.

Before reaching the target, the run ends if the move budget expires or a deadlock cannot
be rescued. A deadlock spends one rescue shuffle; exhausted rescues or a failed shuffle
end the run. Each level grants at least one rescue. Opening-board reshuffling is free.

Deadlock frequency depends on board rules, player choices, and the current phase.
Earlier measurements from older rules are not estimates for the current game.

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
