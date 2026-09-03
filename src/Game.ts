import { Application, ContainerChild } from 'pixi.js';
import { Board } from './core/Board.ts';
import { BoardInitializer, IBoardInitializer } from './core/BoardInitializer.ts';
import { CascadeResolver, ICascadeResolver } from './core/CascadeResolver.ts';
import { MatchDetector } from './core/MatchDetector.ts';
import { SpecialResolver } from './core/SpecialResolver.ts';
import { SpecialRegistry } from './core/specials/SpecialRegistry.ts';
import { ScoreCalculator } from './core/ScoreCalculator.ts';
import { BoardGravitySystem } from './core/BoardGravitySystem.ts';
import { TileSpawner } from './core/TileSpawner.ts';
import { ShuffleEngine, IDeadlockResolver } from './core/ShuffleEngine.ts';
import { GameSession, GameState, IGameSession } from './core/GameSession.ts';
import { InfiniteLevelProgression } from './core/LevelProgression.ts';
import { IRandomSource, MathRandomSource } from './core/random/IRandomSource.ts';
import { ALL_TILE_COLORS, Position } from './core/TileTypes.ts';
import { BoardView } from './view/BoardView.ts';
import { IBoardView } from './view/IBoardViewContracts.ts';
import { AnimationQueue } from './view/AnimationQueue.ts';
import { IAnimationSequencer } from './view/IAnimationSequencer.ts';
import { InputController, IInputController } from './input/InputController.ts';
import { HUDView } from './ui/HUDView.ts';
import { IHUDView } from './ui/IHUDView.ts';
import { TurnCoordinator, ITurnCoordinator } from './TurnCoordinator.ts';
import { IGameTelemetryService } from './core/telemetry/IGameTelemetry.ts';
import { GameTelemetryService } from './core/telemetry/GameTelemetryService.ts';
import { DebugOverlayView } from './ui/DebugOverlayView.ts';
import { IDebugOverlayView } from './ui/IDebugOverlayView.ts';
import { IClipboardService } from './ui/IClipboardService.ts';
import { BrowserClipboardService } from './ui/ClipboardService.ts';

const HUD_HEIGHT = 90;
const END_OF_TURN_MODAL_DELAY_MS = 400;

export interface GameDependencies {
  app?: Application;
  random?: IRandomSource;
  board?: Board;
  boardInitializer?: IBoardInitializer;
  boardView?: IBoardView;
  animationQueue?: IAnimationSequencer;
  inputController?: IInputController;
  cascadeResolver?: ICascadeResolver;
  deadlockResolver?: IDeadlockResolver;
  session?: IGameSession;
  turnCoordinator?: ITurnCoordinator;
  hud?: IHUDView;
  telemetry?: IGameTelemetryService;
  debugOverlay?: IDebugOverlayView;
  clipboardService?: IClipboardService;
}

/**
 * Composition root: wires the deterministic core to the Pixi view and the DOM HUD.
 * Turn logic lives in TurnCoordinator, level rules in GameSession (SRP).
 */
export class Game {
  private readonly app: Application;
  private readonly board: Board;
  private readonly boardInitializer: IBoardInitializer;
  private readonly boardView: IBoardView;
  private readonly inputController: IInputController;
  private readonly deadlockResolver: IDeadlockResolver;
  private readonly session: IGameSession;
  private readonly hud: IHUDView;
  private readonly turnCoordinator: ITurnCoordinator;
  private readonly telemetry: IGameTelemetryService;
  private readonly debugOverlay?: IDebugOverlayView;

  constructor(deps: GameDependencies = {}) {
    const random = deps.random ?? new MathRandomSource();

    this.app = deps.app ?? new Application();
    this.board = deps.board ?? new Board(8, 8);
    this.boardInitializer = deps.boardInitializer ?? new BoardInitializer(random);
    this.boardView = deps.boardView ?? new BoardView(this.board);
    this.session = deps.session ?? new GameSession(new InfiniteLevelProgression());
    this.hud = deps.hud ?? new HUDView(this.onModalAction.bind(this));

    this.deadlockResolver =
      deps.deadlockResolver ?? new ShuffleEngine(new MatchDetector(), random);

    this.inputController =
      deps.inputController ??
      new InputController(
        this.boardView,
        this.onSwapMove.bind(this),
        this.onActivateTile.bind(this)
      );

    this.telemetry =
      deps.telemetry ??
      new GameTelemetryService({
        board: this.board,
        session: this.session,
        deadlockResolver: this.deadlockResolver,
        inputController: this.inputController,
      });

    const animations = deps.animationQueue ?? new AnimationQueue(this.boardView);
    const cascadeResolver =
      deps.cascadeResolver ??
      new CascadeResolver(
        new ScoreCalculator(),
        new BoardGravitySystem(),
        new TileSpawner(ALL_TILE_COLORS, random),
        new MatchDetector(),
        new SpecialResolver(new SpecialRegistry(random))
      );

    this.turnCoordinator =
      deps.turnCoordinator ??
      new TurnCoordinator({
        board: this.board,
        boardView: this.boardView,
        animations,
        cascadeResolver,
        deadlockResolver: this.deadlockResolver,
        session: this.session,
        telemetry: this.telemetry,
      });

    if (deps.debugOverlay) {
      this.debugOverlay = deps.debugOverlay;
    } else if (typeof document !== 'undefined' && document.getElementById('debug-overlay')) {
      const clipboard = deps.clipboardService ?? new BrowserClipboardService();
      this.debugOverlay = new DebugOverlayView(
        this.telemetry,
        {
          onUnlockInput: () => this.inputController.setLocked(false),
          onForceShuffle: () => this.forceShuffle(),
        },
        clipboard
      );
    }

    this.registerGlobalDebugHook();
    this.bindSessionEvents();
  }

  public async init(containerElement: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: window,
      backgroundColor: 0x160c28,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      preference: 'webgl',
    });

    containerElement.appendChild(this.app.canvas);
    this.app.stage.addChild(this.boardView as unknown as ContainerChild);

    window.addEventListener('resize', this.onResize.bind(this));
    document.addEventListener('fullscreenchange', this.onResize.bind(this));

    this.session.restart();
    requestAnimationFrame(() => this.onResize());
  }

  /** Restarts the endless run from level 1. */
  public startNewGame(): void {
    this.session.restart();
  }

  /** Force board reshuffle (telemetry/debug recovery). */
  public forceShuffle(): void {
    const res = this.deadlockResolver.shuffleBoard(this.board);
    this.boardView.initFromBoard();
    this.telemetry.recordShuffle('manual_debug', res.success);
    this.debugOverlay?.refresh();
    this.inputController.setLocked(false);
  }

  private registerGlobalDebugHook(): void {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__GAME_DEBUG__ = {
        getHistory: (n?: number) => this.telemetry.getRecentMoves(n),
        getState: () => this.telemetry.getSnapshot(),
        dump: () => {
          const snap = this.telemetry.getSnapshot();
          console.log(`[DELICIOUS MOVE TELEMETRY] Level ${snap.level} (${snap.difficulty.toUpperCase()})`);
          console.log(`State: ${snap.state} | Score: ${snap.score}/${snap.targetScore} | Moves: ${snap.movesLeft} (Banked: ${snap.accumulatedBonusMoves})`);
          console.log(`Locked: ${snap.isInputLocked} | Possible Moves: ${snap.possibleMovesCount}`);
          console.log(`Specials:`, snap.specialsOnBoard);
          console.log(`\nBoard:\n${snap.boardAscii}`);
          console.table(snap.recentMoves.slice(-10));
          return snap;
        },
        copyReport: () =>
          this.debugOverlay
            ? this.debugOverlay.copyToClipboard()
            : new BrowserClipboardService().copyText(this.telemetry.exportDiagnosticJson()),
        unlockInput: () => {
          this.inputController.setLocked(false);
          console.log('[DELICIOUS MOVE] Input unlocked manually.');
        },
        forceShuffle: () => {
          this.forceShuffle();
        },
        toggleOverlay: () => {
          this.debugOverlay?.toggle();
        },
      };
    }
  }

  private bindSessionEvents(): void {
    this.session.addListener({
      onLevelStarted: (config) => {
        this.telemetry.recordStateTransition('level_start', `Level ${config.level} (${config.difficulty})`);
        this.hud.initLevel(config, this.session.getAccumulatedMoves());
        this.buildPlayableBoard();
        this.debugOverlay?.refresh();
      },
      onScoreUpdated: (_score, added) => {
        if (added > 0) this.hud.addScore(added);
      },
      onMovesUpdated: (moves) => this.hud.updateMoves(moves),
      onShufflesUpdated: (shuffles) => this.hud.updateShuffles(shuffles),
      onStateChanged: (state, snapshot) => {
        if (state === GameState.Victory) {
          this.telemetry.recordStateTransition('victory', `Score: ${snapshot.score}`);
          this.debugOverlay?.refresh();
          this.inputController.setLocked(true);
          setTimeout(
            () => this.hud.showVictory(snapshot.score, snapshot.level, snapshot.movesLeft),
            END_OF_TURN_MODAL_DELAY_MS
          );
        } else if (state === GameState.GameOver) {
          this.telemetry.recordStateTransition('game_over', `Reason: ${snapshot.reason}`);
          this.debugOverlay?.refresh();
          this.inputController.setLocked(true);
          setTimeout(
            () =>
              this.hud.showGameOver(
                snapshot.score,
                snapshot.level,
                snapshot.reason ?? this.session.getGameOverReason()!
              ),
            END_OF_TURN_MODAL_DELAY_MS
          );
        }
      },
    });
  }

  /** A level always opens on a solvable board; this free reshuffle is not charged. */
  private buildPlayableBoard(): void {
    this.boardInitializer.populate(this.board);
    if (!this.deadlockResolver.hasPossibleMoves(this.board)) {
      this.deadlockResolver.shuffleBoard(this.board);
    }

    this.boardView.initFromBoard();
    this.onResize();
    this.inputController.setLocked(false);
  }

  /** Victory continues the ladder; a loss restarts it. */
  private onModalAction(): void {
    if (this.session.getState() === GameState.Victory) {
      this.session.advanceLevel();
    } else {
      this.session.restart();
    }
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Explicitly resize the Pixi renderer to the actual viewport dimensions
    if (this.app.renderer) {
      this.app.renderer.resize(width, height);
    }

    const hudEl = document.getElementById('top-hud');
    const hudHeight = hudEl ? hudEl.offsetHeight : HUD_HEIGHT;

    // The board is centred once inside the area left below the HUD.
    this.boardView.updateLayout(width, Math.max(200, height - hudHeight), hudHeight);
  }

  private async onSwapMove(from: Position, to: Position): Promise<boolean> {
    const played = await this.turnCoordinator.playMove(from, to);
    this.debugOverlay?.refresh();
    // The turn may have ended the run, in which case the board stays locked.
    this.inputController.setLocked(!this.session.canMakeMove());
    return played;
  }

  private async onActivateTile(pos: Position): Promise<boolean> {
    const activated = await this.turnCoordinator.activateTile(pos);
    this.debugOverlay?.refresh();
    this.inputController.setLocked(!this.session.canMakeMove());
    return activated;
  }
}
