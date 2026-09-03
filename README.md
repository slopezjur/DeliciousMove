# 🍬 DeliciousMove - Modern Match-3 Web Game

A high-performance, deterministic Match-3 web game designed and built to modern 2026 web engineering standards. Powered by a decoupled headless core engine, native GPU vector rendering via **PixiJS v8**, sequenced animation timelines with **GSAP**, and procedural zero-asset audio synthesis via the **Web Audio API**.

---

## 🏛 Architecture

DeliciousMove separates deterministic core game logic from presentation:

```
┌───────────────────────────────────────────────────────────────────┐
│                    Composition Root & Orchestration               │
│         (Game, TurnCoordinator, InputController, HUDView)         │
└───────────────┬───────────────────────────────────▲───────────────┘
                │ Actions (e.g. User Swap)           │ State Events
┌───────────────▼────────────────┐  ┌───────────────┴───────────────┐
│       Deterministic Core       │  │        PixiJS View Layer      │
│  - Board & Grid Matrix         │  │  - Native GPU GraphicsContext │
│  - BoardInitializer (seeding)  │  │  - GSAP AnimationQueue        │
│  - MatchRuleRegistry (3,4,5,L/T)│  │  - EffectPresenterRegistry    │
│  - SpecialRegistry (Strategy)  │  │  - Procedural VFX Particles   │
│  - GravitySystem & TileSpawner │  │  - Responsive Viewport Fit    │
│  - ScoreCalculator             │  │  - Procedural SoundManager    │
│  - GameSession & LevelProgression│ └───────────────────────────────┘
│  - ShuffleEngine (Deadlocks)   │
│  - IRandomSource (injected RNG)│
└────────────────────────────────┘
```

### Core Subsystems & Responsibilities

* **Deterministic Core**:
  * `Board`: Pure grid state matrix and indexing.
  * `BoardInitializer`: Initial board layout generator ensuring no pre-existing runs or squares.
  * `MatchDetector`: Scans the grid for raw runs and delegates pattern matching to registered rules.
  * `BoardGravitySystem`: Simulates falling tiles and compaction into empty cells.
  * `TileSpawner`: Procedural refill generator for empty slots.
  * `ScoreCalculator`: Calculates move points and combo multipliers.
  * `GameSession`: Manages moves, goals, game states, and bonus banking.
  * `LevelProgression`: Difficulty curves and stage configurations.
  * `ShuffleEngine`: Detects deadlocks and resolves board configurations into valid states.
* **Orchestration & Input**:
  * `TurnCoordinator`: Orchestrates the lifecycle of player moves, swaps, direct activations, cascades, and deadlocks.
  * `InputController`: Handles pointer and touch drag/tap gestures, intent dispatching, and interaction locking.
  * `Game`: Composition root, dependency wiring, and viewport resizing.
* **Extensible Rule & Special Strategies**:
  * `MatchRuleRegistry`: Priority-ordered `IMatchRule` strategies using `MatchEvaluationContext` (3-match, 4-line, L/T-shape, 2x2 square).
  * `SpecialRegistry`: Strategy registry for single special detonations and dual-special combination mechanics.
  * `EffectPresenterRegistry`: Registered `IEffectPresenter` handlers for each visual detonation effect.
* **Presentation & Contracts**:
  * `BoardView`: PixiJS v8 board display container implementing `IBoardView`.
  * `AnimationQueue`: Sequenced GSAP timeline runner for swaps, drops, spawns, and detonations.
  * `VFXManager`: Procedural particle bursts, shockwaves, lasers, and projectile flights via `IVFXManager`.
  * `SoundManager`: Web Audio API procedural synthesis implementing `ISoundService`.
  * `BrowserClipboardService`: Segregated clipboard I/O implementing `IClipboardService`.
  * `GameTelemetryService`: Domain diagnostic recorder implementing `IGameTelemetryService`.
  * **Injected RNG**: All random selections receive `IRandomSource`, ensuring complete replayability and headless test determinism.

---

## 🎮 Game Rules & Specials Matrix

### Basic Matches & Direct Activation
* **Match-3:** Normal horizontal or vertical 3-in-a-row clears matched tiles.
* **2x2 Square:** Spawns an **Airplane**. When detonated, clears takeoff neighbors and flies to bomb a strategic target on the board.
* **4-in-a-Row:** Spawns a **Striped Candy** (Horizontal clears entire row; Vertical clears entire column).
* **T or L Shape (Intersection):** Spawns a **Wrapped Candy** (Explodes a 3x3 radius).
* **5-in-a-Row:** Spawns a **Color Bomb** (Rainbow chocolate disco ball).
* **Direct Click/Tap Activation:** Tap any special candy directly on the board to activate it immediately without swapping (consumes 1 move).
* **Free Dragging (No Color Match Required):** Drag and swap any special candy with any adjacent tile to detonate it at the target position.

A new special always survives the pass that created it, even when a chained blast sweeps
the cell it was born in. A special candy already sitting inside a match is never silently
overwritten: the new candy lands on a plain tile of the run and the old one detonates.

### Dual Special Combinations (Swapping two specials)
| Combo | Visual Effect | Gameplay Result |
| :--- | :--- | :--- |
| **Airplane + Airplane** | Squadron Launch | Launches 3 paper airplanes simultaneously targeting strategic tiles across the board. |
| **Airplane + Striped** | Airborne Laser Drop | Airplane flies to target and detonates a full horizontal + vertical cross laser. |
| **Airplane + Wrapped** | Airborne Heavy Bombardment | Airplane flies to target and triggers a 3x3 explosive detonation. |
| **Color Bomb + Airplane** | Squadron Conversion | Converts all candies of the airplane's color into airplanes and launches them. |
| **Striped + Striped** | Electric Cross Beam | Clears both entire row AND entire column in a "+" cross. |
| **Striped + Wrapped** | Giant 3-Row Cross | Clears 3 full rows AND 3 full columns simultaneously. |
| **Wrapped + Wrapped** | Mega Shockwave | Giant 5x5 explosion centered on the target. |
| **Color Bomb + Striped** | Laser Chain Reaction | Converts ALL candies of that color into Striped candies and detonates them all. |
| **Color Bomb + Normal** | Color Wipe | Clears every candy sharing the swapped candy's colour. |
| **Color Bomb + Color Bomb** | Cosmic Wipe | Clears the entire board! |

Combos resolve on the **destination cell** — the square you dropped the candy into — so a
cross or giant cross is centred where you aimed it. A Color Bomb swallowed by an ordinary
match wipes the colour of *that match*, not whichever colour happens to be most common.

---

## ♾️ Infinite Level Progression

There is no final level. Clearing the target opens **"Next Level →"** and the ladder
continues indefinitely, with `InfiniteLevelProgression` scaling three budgets:

| Budget | Rule | Level 1 | Level 5 | Level 10 | Level 25 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Target score** | `4000 × 1.28^(level-1)`, rounded to 50 | 4,000 | 10,750 | 36,900 | 1,496,600 |
| **Moves** | `25 - floor((level-1)/2)`, floor of 16 | 25 | 23 | 21 | 16 |
| **Rescue shuffles** | `4 - floor((level-1)/3)`, floor of 1 | 4 | 3 | 1 | 1 |

Score resets each level; the level number, moves and remaining shuffles are shown in the
HUD. Losing restarts the run at level 1. Every constant lives in
`DEFAULT_INFINITE_TUNING` (`src/core/LevelProgression.ts`) — swap in your own
`InfiniteProgressionTuning`, or a completely different `ILevelProgression`, to reshape the
curve without touching the session.

## 🧩 Deadlocks & Losing

There are two ways to lose:

1. **Out of moves** — the move budget hits zero before the target score.
2. **No moves possible** — the board jams and you have no rescue shuffle left.

When no valid swap exists, the `ShuffleEngine` spends one **rescue shuffle** and scrambles
the board into an arrangement guaranteed to have at least one move and no pre-formed
matches. Once the level's budget is exhausted, the next jam ends the run — as does the rare
case where the scrambler cannot find a solvable arrangement at all (`shuffleBoard` reports
`success: false` rather than silently handing back a dead board).

**How likely is that?** Measured over 400 simulated 30-move games on a standard 8×8,
6-colour board playing random legal moves, **about 3% of games hit at least one deadlock**
(roughly 0.09% of turns). With the default budget the risk is deliberately a long tail
rather than a routine threat: you have to jam repeatedly within one level to actually lose
that way. Lower `baseShuffles` in `DEFAULT_INFINITE_TUNING` to make it bite harder.

The opening board of every level is always solvable — that guarantee is free and is not
charged against the rescue budget.

---

## 🛠 Tech Stack

* **Language:** TypeScript 5.7+ (strict mode, ESNext module resolution)
* **Bundler & Dev Server:** Vite 6+ (instant HMR, tree-shaking)
* **Renderer:** PixiJS v8 (native GPU vector geometry via `GraphicsContext`, WebGL2 backend)
* **Animation Sequencing:** GSAP 3 (staggered cascade timelines, bounce drop curves, pop scales)
* **Audio Synthesis:** Web Audio API (procedural harmonic pentatonic chime scale, laser sweeps, bass rumbles)
* **Unit Testing:** Vitest (headless deterministic simulation, 61 tests)

---

## 🚀 Getting Started

### Prerequisites
* **Node.js:** v18.0.0 or later (v20+ recommended)
* **npm:** v9.0.0 or later

### Installation
```bash
# Clone the repository
git clone https://github.com/your-repo/DeliciousMove.git
cd DeliciousMove

# Install dependencies
npm install
```

### Development
```bash
# Run local dev server with HMR at http://localhost:3000
npm run dev
```

### Production Build
```bash
# Type-check and bundle into /dist
npm run build

# Preview production build locally
npm run preview
```

### Testing
```bash
# Execute headless Match-3 engine test suite
npm test
```

### Deployment (GitHub Pages)

The project includes an automated GitHub Actions workflow (`.github/workflows/deploy.yml`) that runs all tests, compiles the production bundle with relative asset paths, and publishes to GitHub Pages on every push to `main`.

**One-time GitHub Setup:**
1. Go to your repository **Settings** $\to$ **Pages**.
2. Under **Build and deployment** $\to$ **Source**, choose **GitHub Actions**.
3. Push your commits to `main` (or run manually via **Actions** $\to$ **Deploy to GitHub Pages** $\to$ **Run workflow**).

---

## 📁 Project Structure

```
DeliciousMove/
├── src/
│   ├── audio/
│   │   ├── ISoundService.ts          # Audio contract abstraction (DIP)
│   │   └── SoundManager.ts           # Web Audio API synthesizer
│   ├── core/
│   │   ├── Board.ts                  # Pure grid state & tile indexing (SRP)
│   │   ├── BoardInitializer.ts       # Match-free board generation (SRP)
│   │   ├── BoardGravitySystem.ts     # Gravity collapse simulation (SRP)
│   │   ├── CascadeResolver.ts        # Turn cascade coordinator
│   │   ├── GameSession.ts            # Session state machine & rescue budget
│   │   ├── LevelProgression.ts       # Endless difficulty curve (OCP)
│   │   ├── MatchDetector.ts          # Geometric run scanner
│   │   ├── ScoreCalculator.ts        # Scoring & multiplier formulas (SRP)
│   │   ├── ShuffleEngine.ts          # Deadlock detector & scrambler
│   │   ├── SpecialResolver.ts        # Special activation coordinator
│   │   ├── TileSpawner.ts            # Column refill generation (SRP)
│   │   ├── TileTypes.ts              # Core enums and data interfaces
│   │   ├── matching/
│   │   │   ├── IMatchRule.ts         # Match pattern strategy contract (OCP)
│   │   │   └── MatchRuleRegistry.ts  # ColorBomb / Wrapped / Striped / Normal rules
│   │   ├── random/
│   │   │   └── IRandomSource.ts      # Injected RNG: Math-backed & seeded (DIP)
│   │   └── specials/
│   │       ├── ISpecialHandler.ts    # Strategy contracts & detonation context (OCP)
│   │       └── SpecialRegistry.ts    # Special & combo strategy registry
│   ├── input/
│   │   └── InputController.ts        # Drag/swipe & tap input handling
│   ├── ui/
│   │   ├── GameModalView.ts          # Victory / defeat modal
│   │   ├── HUDView.ts                # Glassmorphic level, score & moves meter
│   │   ├── IGameModalView.ts         # Modal contract (DIP)
│   │   └── IHUDView.ts               # HUD contract (DIP)
│   ├── view/
│   │   ├── AnimationQueue.ts         # GSAP step playback sequencer
│   │   ├── AssetFactory.ts           # PixiJS v8 native GPU GraphicsContexts
│   │   ├── BoardView.ts              # Viewport container & coordinate mapping
│   │   ├── IAnimationSequencer.ts    # Playback contract (ISP/DIP)
│   │   ├── IBoardViewContracts.ts    # Segregated view interfaces (ISP)
│   │   ├── TileSprite.ts             # Display object with shared vector context
│   │   ├── VFXManager.ts             # Particle bursts, text popups, screen shake
│   │   └── vfx/
│   │       ├── IEffectPresenter.ts   # Per-effect audiovisual contract (OCP)
│   │       └── EffectPresenterRegistry.ts # Beam / shockwave / cross / bomb presenters
│   ├── Game.ts                       # Application composition root
│   ├── TurnCoordinator.ts            # Single-move lifecycle orchestration (SRP)
│   └── main.ts                       # DOM entry point
├── tests/
│   ├── cascade_regression.test.ts    # Spawned-special survival, combo centring, bomb colour
│   ├── level_progression.test.ts     # Endless curve, shuffle floor, deadlock loss
│   ├── match_engine.test.ts          # Board & cascade unit tests
│   ├── matching_rules.test.ts        # MatchRuleRegistry & HUD/modal separation
│   ├── random_source.test.ts         # Seeded determinism across the core
│   ├── session_specials.test.ts      # GameSession & SpecialRegistry unit tests
│   └── turn_coordinator.test.ts      # Turn lifecycle, infinite mode, getting stuck
├── index.html                        # Modern HTML shell with glassmorphic UI
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🔧 Extending the Game

Because the core is registry-driven, the common extensions need no edits to existing code:

* **A new match shape** — implement `IMatchRule`, then `registry.registerRule(new SquareRule())`.
  Priority decides which rule claims a run first.
* **A new special candy** — add the `SpecialType`, implement `ISpecialEffectHandler`
  (and `ISpecialComboHandler` for pairings), register both, then add an `IEffectPresenter`
  for its visuals.
* **A different difficulty curve** — implement `ILevelProgression` and hand it to `GameSession`.
* **Reproducible runs** — construct `Game` with `{ random: new SeededRandomSource(seed) }`
  and the entire game replays identically.
