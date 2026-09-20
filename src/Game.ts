import { LanguageService } from './i18n/LanguageService.ts';
import { LanguageControls } from './i18n/LanguageControls.ts';
import { IStorage, BrowserStorage } from './persistence/Storage.ts';
import { SaveStore } from './persistence/SaveStore.ts';
import { GameSave, SAVE_SCHEMA_VERSION, GAME_RULES_VERSION } from './persistence/SaveCodec.ts';
import { Application } from 'pixi.js';
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
import { IRandomSource, MathRandomSource, SeededRandomSource, isStatefulRandomSource } from './core/random/IRandomSource.ts';
import { ALL_TILE_COLORS, Position } from './core/TileTypes.ts';
import { BoardView } from './view/BoardView.ts';
import { IBoardView } from './view/IBoardViewContracts.ts';
import { AnimationQueue } from './view/AnimationQueue.ts';
import { IAnimationSequencer, IHintAnimator } from './view/IAnimationSequencer.ts';
import { InputController, IInputController } from './input/InputController.ts';
import { HUDView } from './ui/HUDView.ts';
import { IHUDView } from './ui/IHUDView.ts';
import { GameModalView } from './ui/GameModalView.ts';
import { IGameModalView } from './ui/IGameModalView.ts';
import { TurnCoordinator, ITurnCoordinator } from './TurnCoordinator.ts';
import { IGameTelemetryService } from './core/telemetry/IGameTelemetry.ts';
import { GameTelemetryService } from './core/telemetry/GameTelemetryService.ts';
import { GameDebugController } from './debug/GameDebugController.ts';
import { ISoundService } from './audio/ISoundService.ts';
import { SoundManager } from './audio/SoundManager.ts';
import { IDebugOverlayView } from './ui/IDebugOverlayView.ts';
import { IClipboardService } from './ui/IClipboardService.ts';
import { BrowserClipboardService } from './ui/ClipboardService.ts';
import { IdleHintController } from './input/IdleHintController.ts';
import { IIdleHintController } from './input/IIdleHintController.ts';

const HUD_HEIGHT = 90;
const END_OF_TURN_MODAL_DELAY_MS = 400;

export interface GameDependencies {
  app?: Application;
  storage?: IStorage;
  language?: LanguageService;
  random?: IRandomSource;
  board?: Board;
  boardInitializer?: IBoardInitializer;
  boardView?: IBoardView;
  animationQueue?: IAnimationSequencer & IHintAnimator;
  sound?: ISoundService;
  inputController?: IInputController;
  idleHintController?: IIdleHintController;
  cascadeResolver?: ICascadeResolver;
  deadlockResolver?: IDeadlockResolver;
  session?: IGameSession;
  turnCoordinator?: ITurnCoordinator;
  hud?: IHUDView;
  modal?: IGameModalView;
  telemetry?: IGameTelemetryService;
  debugOverlay?: IDebugOverlayView;
  clipboardService?: IClipboardService;
}

/**
 * Composition root: wires the deterministic core to the Pixi view and the DOM HUD.
 * Turn logic lives in TurnCoordinator, level rules in GameSession (SRP).
 */
export class Game {
  private readonly language: LanguageService;
  private readonly saves: SaveStore;
  private readonly random: IRandomSource;
  private readonly savedRun: GameSave | null;
  private turnInFlight = false;
  private layoutPending = false;
  private modalTimer?: ReturnType<typeof setTimeout>;
  private readonly app: Application;
  private readonly board: Board;
  private readonly boardInitializer: IBoardInitializer;
  private readonly boardView: IBoardView;
  private readonly inputController: IInputController;
  private readonly idleHintController: IIdleHintController;
  private readonly deadlockResolver: IDeadlockResolver;
  private readonly session: IGameSession;
  private readonly hud: IHUDView;
  private readonly modal: IGameModalView;
  private readonly turnCoordinator: ITurnCoordinator;
  private readonly telemetry: IGameTelemetryService;
  private readonly debug: GameDebugController;

  constructor(deps: GameDependencies = {}) {
    const storage = deps.storage ?? new BrowserStorage();
    this.language = deps.language ?? new LanguageService(storage, typeof navigator === 'undefined' ? 'en' : navigator.language);
    this.saves = new SaveStore(storage);
    this.savedRun = this.saves.load();
    const random = deps.random ?? new SeededRandomSource(new MathRandomSource().nextInt(0x100000000));
    this.random = random;
    const sound = deps.sound ?? new SoundManager();

    this.app = deps.app ?? new Application();
    this.board = deps.board ?? new Board(this.savedRun?.board.rows ?? 8, this.savedRun?.board.cols ?? 8);
    this.boardInitializer = deps.boardInitializer ?? new BoardInitializer(random);
    this.boardView = deps.boardView ?? new BoardView(this.board);
    this.session = deps.session ?? new GameSession(new InfiniteLevelProgression());
    this.modal = deps.modal ?? new GameModalView(this.onModalAction.bind(this), sound, this.language);
    this.hud = deps.hud ?? new HUDView(sound, this.language);

    this.deadlockResolver =
      deps.deadlockResolver ?? new ShuffleEngine(new MatchDetector(), random);

    const animations = deps.animationQueue ?? new AnimationQueue(this.boardView, sound, undefined, this.language);

    this.idleHintController =
      deps.idleHintController ??
      new IdleHintController(
        this.board,
        this.deadlockResolver,
        this.session,
        animations
      );

    this.inputController =
      deps.inputController ??
      new InputController(
        this.boardView,
        this.onSwapMove.bind(this),
        this.onActivateTile.bind(this),
        () => this.idleHintController.resetTimer()
      );

    this.telemetry =
      deps.telemetry ??
      new GameTelemetryService({
        board: this.board,
        session: this.session,
        deadlockResolver: this.deadlockResolver,
        isInputLocked: () => this.inputController.isLocked(),
      });
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
        animations,
        cascadeResolver,
        deadlockResolver: this.deadlockResolver,
        session: this.session,
        telemetry: this.telemetry,
        getRandomSnapshot: () => isStatefulRandomSource(this.random) ? this.random.getSnapshot() : undefined,
      });

    this.debug = new GameDebugController(
      this.telemetry,
      {
        onUnlockInput: () => this.inputController.setLocked(!this.session.canMakeMove()),
        onForceShuffle: () => this.forceShuffle(),
      },
      deps.clipboardService ?? new BrowserClipboardService(),
      deps.debugOverlay,
      this.language
    );
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
    this.app.stage.addChild(this.boardView.displayObject);

    window.addEventListener('resize', this.onResize.bind(this));
    document.addEventListener('fullscreenchange', this.onResize.bind(this));

    new LanguageControls(this.language, () => this.onResize());
    this.language.subscribe(() => this.renderSaveStatus());
    document.getElementById('new-game-btn')?.addEventListener('click', () => {
      if (!this.turnInFlight && window.confirm(this.language.t('newGameConfirm'))) this.startNewGame();
    });
    if (!this.restoreProgress()) this.session.restart();
    this.renderSaveStatus();
    requestAnimationFrame(() => this.onResize());
  }

  /** Restarts the endless run from level 1. */
  public startNewGame(): void {
    if (this.turnInFlight) return;
    clearTimeout(this.modalTimer);
    this.saves.beginNewRun();
    this.session.restart();
  }

  /** Force board reshuffle (telemetry/debug recovery). */
  public forceShuffle(): void {
    if (!this.session.canMakeMove() || this.inputController.isLocked()) return;
    const res = this.deadlockResolver.shuffleBoard(this.board);
    this.boardView.initFromBoard();
    this.telemetry.recordShuffle('manual_debug', res.success);
    this.debug.refresh();
    this.inputController.setLocked(false);
  }

  private bindSessionEvents(): void {
    this.session.addListener({
      onLevelStarted: (config) => {
        this.telemetry.recordStateTransition('level_start', `Level ${config.level} (${config.difficulty})`);
        this.modal.hide();
        this.hud.initLevel(config, this.session.getAccumulatedMoves(), this.session.getGlobalScore());
        this.buildPlayableBoard();
        this.debug.refresh();
        this.idleHintController.start();
        this.renderSaveStatus();
      },
      onScoreUpdated: (_score, added, globalScore, isBonusPhase) => {
        if (added > 0) this.hud.addScore(added, globalScore, isBonusPhase);
      },
      onMovesUpdated: (moves, isFrozen) => this.hud.updateMoves(moves, isFrozen),
      onShufflesUpdated: (shuffles) => this.hud.updateShuffles(shuffles),
      onStateChanged: (state, snapshot) => {
        if (state === GameState.Victory) {
          this.idleHintController.stop();
          this.telemetry.recordStateTransition('victory', `Score: ${snapshot.score}`);
          this.debug.refresh();
          this.inputController.setLocked(true);
          this.modalTimer = setTimeout(
            () => this.modal.showVictory(snapshot.score, snapshot.level, snapshot.movesLeft, snapshot.globalScore),
            END_OF_TURN_MODAL_DELAY_MS
          );
        } else if (state === GameState.GameOver) {
          this.idleHintController.stop();
          this.telemetry.recordStateTransition('game_over', `Reason: ${snapshot.reason}`);
          this.debug.refresh();
          this.inputController.setLocked(true);
          this.modalTimer = setTimeout(
            () =>
              this.modal.showGameOver(
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
      this.startNewGame();
    }
  }

  private onResize(): void {
    if (this.turnInFlight) { this.layoutPending = true; return; }
    this.layoutPending = false;
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

  private async runTurn(action: () => Promise<boolean>): Promise<boolean> {
    if (this.turnInFlight) return false;
    this.turnInFlight = true;
    this.idleHintController.stop();
    const newGameButton = document.getElementById('new-game-btn') as HTMLButtonElement | null;
    if (newGameButton) newGameButton.disabled = true;
    try {
      const played = await action();
      if (played) this.saveProgress();
      return played;
    } finally {
      this.turnInFlight = false;
      if (this.layoutPending) this.onResize();
      if (newGameButton) newGameButton.disabled = false;
      this.debug.refresh();
      this.inputController.setLocked(!this.session.canMakeMove());
      if (this.session.canMakeMove()) this.idleHintController.start();
    }
  }

  private onSwapMove(from: Position, to: Position): Promise<boolean> {
    return this.runTurn(() => this.turnCoordinator.playMove(from, to));
  }

  private onActivateTile(pos: Position): Promise<boolean> {
    return this.runTurn(() => this.turnCoordinator.activateTile(pos));
  }

  private saveProgress(): void {
    if (this.session.getState() !== GameState.Victory) return;
    if (!isStatefulRandomSource(this.random)) {
      this.saves.suspend();
    } else {
      this.saves.save({
        schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION,
        savedAt: new Date().toISOString(), board: this.board.getSnapshot(),
        session: this.session.exportState(), random: this.random.getSnapshot(),
      });
    }
    this.renderSaveStatus();
  }

  private restoreProgress(): boolean {
    const save = this.savedRun;
    if (!save) return false;
    if (!isStatefulRandomSource(this.random) || save.board.rows !== this.board.rows
      || save.board.cols !== this.board.cols) {
      this.saves.suspend();
      return false;
    }
    this.board.restore(save.board);
    this.random.restore(save.random);
    this.session.restore(save.session);
    this.hud.initLevel(save.session.config, save.session.accumulatedMoves, save.session.globalScore);
    this.hud.addScore(save.session.score, save.session.globalScore, this.session.isBonusPhase());
    this.hud.updateMoves(save.session.movesLeft, this.session.isTargetReached());
    this.hud.updateShuffles(save.session.shufflesLeft);
    this.boardView.initFromBoard();
    this.onResize();
    this.inputController.setLocked(!this.session.canMakeMove());
    if (save.session.state === GameState.Victory) {
      this.modal.showVictory(save.session.score, save.session.config.level, save.session.movesLeft, save.session.globalScore);
    } else if (save.session.state === GameState.GameOver) {
      this.modal.showGameOver(save.session.score, save.session.config.level, save.session.reason!);
    } else {
      this.idleHintController.start();
    }
    return true;
  }

  private renderSaveStatus(): void {
    if (typeof document === 'undefined') return;
    const element = document.getElementById('save-status');
    if (element) {
      element.textContent = this.language.t(`save_${this.saves.status}`);
      element.dataset.warning = String(!['none', 'saved'].includes(this.saves.status));
    }
  }
}
