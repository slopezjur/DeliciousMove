import { LanguageService } from './i18n/LanguageService.ts';
import { LanguageControls } from './i18n/LanguageControls.ts';
import { IStorage, BrowserStorage } from './persistence/Storage.ts';
import { SaveStore } from './persistence/SaveStore.ts';
import { RecordsStore } from './persistence/RecordsStore.ts';
import { RecordsView } from './ui/RecordsView.ts';
import { SaveStatusView } from './ui/SaveStatusView.ts';
import { SoundControlsView } from './ui/SoundControlsView.ts';
import { PlayerResources } from './persistence/PlayerResources.ts';
import { LivesView } from './ui/LivesView.ts';
import { GameSave, SAVE_SCHEMA_VERSION, GAME_RULES_VERSION } from './persistence/SaveCodec.ts';
import { Application } from 'pixi.js';
import { Board } from './core/Board.ts';
import { BoardInitializer, IBoardInitializer } from './core/BoardInitializer.ts';
import { CascadeResolver, ICascadeResolver } from './core/CascadeResolver.ts';
import { MatchDetector } from './core/MatchDetector.ts';
import { SpecialResolver } from './core/SpecialResolver.ts';
import { SpecialRegistry } from './core/specials/SpecialRegistry.ts';
import { AirplaneTargetSelector } from './core/specials/AirplaneTargetSelector.ts';
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
import { SettingsView } from './ui/SettingsView.ts';
import { LevelBoardSetup } from './core/LevelFeatures.ts';
import { TerrainResolver } from './core/TerrainResolver.ts';

const END_OF_TURN_MODAL_DELAY_MS = 400;

export interface GameDependencies {
  /** Test/practice entry point; production always starts at level 1 or its checkpoint. */
  initialLevel?: number;
  now?: () => number;
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
  private readonly initialLevel: number;
  private readonly language: LanguageService;
  private readonly saves: SaveStore;
  private readonly saveStatusView: SaveStatusView;
  private readonly records: RecordsStore;
  private readonly recordsView: RecordsView;
  private readonly resources: PlayerResources;
  private readonly livesView: LivesView;
  private checkpoint = 'new';
  private restoringAttempt = false;
  private readonly random: IRandomSource;
  private readonly savedRun: GameSave | null;
  private turnInFlight = false;
  private layoutPending = false;
  private boardViewport: HTMLElement | null = null;
  private layoutObserver?: ResizeObserver;
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
    this.initialLevel = deps.initialLevel ?? 1;
    const storage = deps.storage ?? new BrowserStorage();
    this.language = deps.language ?? new LanguageService(storage, typeof navigator === 'undefined' ? 'en' : navigator.language);
    this.saves = new SaveStore(storage);
    this.saveStatusView = new SaveStatusView(this.language);
    this.savedRun = this.saves.load();
    this.checkpoint = this.savedRun ? `${this.savedRun.savedAt}:${this.savedRun.session.config.level}` : 'new';
    this.resources = new PlayerResources(storage, deps.now);
    this.livesView = new LivesView(this.language);
    this.records = new RecordsStore(storage);
    if (this.savedRun) this.records.recordCompletedLevel(this.savedRun.session);
    this.recordsView = new RecordsView(this.records, this.language);
    const random = deps.random ?? new SeededRandomSource(new MathRandomSource().nextInt(0x100000000));
    this.random = random;
    const sound = deps.sound ?? new SoundManager();
    new SoundControlsView(sound, this.language);

    this.app = deps.app ?? new Application();
    this.board = deps.board ?? new Board(this.savedRun?.board.rows ?? 8, this.savedRun?.board.cols ?? 8);
    this.boardInitializer = deps.boardInitializer ?? new BoardInitializer(random);
    this.boardView = deps.boardView ?? new BoardView(this.board);
    this.session = deps.session ?? new GameSession(new InfiniteLevelProgression());
    this.modal = deps.modal ?? new GameModalView(this.onModalAction.bind(this), sound, this.language);
    this.hud = deps.hud ?? new HUDView(this.language);

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
        new SpecialResolver(new SpecialRegistry(random, new AirplaneTargetSelector(random, () => this.session.getObjectives()))),
        new TerrainResolver(random)
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
        onUnlockInput: () => this.inputController.setLocked(!this.canPlay()),
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
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      preference: 'webgl',
    });

    this.boardViewport = document.getElementById('board-viewport');
    (this.boardViewport ?? containerElement).appendChild(this.app.canvas);
    this.app.stage.addChild(this.boardView.displayObject);

    window.addEventListener('resize', this.onResize.bind(this));
    document.addEventListener('fullscreenchange', this.onResize.bind(this));
    window.visualViewport?.addEventListener('resize', this.onResize.bind(this));
    if (this.boardViewport && typeof ResizeObserver !== 'undefined') {
      this.layoutObserver = new ResizeObserver(() => this.onResize());
      this.layoutObserver.observe(this.boardViewport);
    }

    new SettingsView();
    new LanguageControls(this.language, () => this.onResize());
    this.recordsView.render();
    this.language.subscribe(() => this.refreshLives());
    document.getElementById('new-game-btn')?.addEventListener('click', () => {
      if (!this.turnInFlight && window.confirm(this.language.t('newGameConfirm'))) this.startNewGame();
    });
    const attempt = this.resources.getAttempt(this.checkpoint);
    this.restoringAttempt = true;
    const restored = this.restoreProgress();
    const resumingLevel = this.savedRun
      ? this.savedRun.session.config.level + (this.savedRun.session.state === GameState.Victory ? 1 : 0)
      : this.initialLevel;
    if (attempt && attempt.level === resumingLevel) {
      if (restored && this.savedRun?.session.state !== GameState.Victory) {
        this.session.reconcileBank(attempt.bank);
      } else {
        this.session.startLevel(attempt.level, attempt.bank);
      }
      if (attempt.failed) this.session.failAttempt(attempt.failed);
      else if (this.session.getState() === GameState.Ready) this.session.onTurnCompleted();
    } else if (!restored) {
      if (this.initialLevel === 1) this.session.restart();
      else this.session.startLevel(this.initialLevel);
    }
    this.restoringAttempt = false;
    if (this.session.getState() === GameState.Ready) this.beginAttempt();
    this.refreshLives();
    if (!this.resources.snapshot().lives && this.session.getState() === GameState.Ready) this.modal.showNoLives?.();
    window.setInterval?.(() => this.refreshLives(), 1000);
    document.addEventListener('visibilitychange', () => this.refreshLives());
    this.renderSaveStatus();
    requestAnimationFrame(() => this.onResize());
  }

  /** Restarts the endless run from level 1. */
  public startNewGame(): void {
    if (this.turnInFlight) return;
    clearTimeout(this.modalTimer);
    this.saves.beginNewRun();
    this.checkpoint = 'new';
    this.resources.clearAttempt();
    this.session.restart();
    this.refreshLives();
    if (!this.resources.snapshot().lives) this.modal.showNoLives?.();
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
      onObjectivesUpdated: (objectives) => this.hud.updateObjectives?.(objectives),
      onLevelStarted: (config) => {
        if (!this.restoringAttempt) this.beginAttempt();
        this.telemetry.recordStateTransition('level_start', `Level ${config.level} (${config.difficulty})`);
        this.modal.hide();
        this.hud.initLevel(config, this.session.getAccumulatedMoves(), this.session.getGlobalScore());
        this.buildPlayableBoard();
        this.debug.refresh();
        if (this.canPlay()) this.idleHintController.start();
        this.renderSaveStatus();
      },
      onScoreUpdated: (_score, added, globalScore, isBonusPhase) => {
        if (added > 0) this.hud.addScore(added, globalScore, isBonusPhase);
      },
      onMovesUpdated: (moves, isFrozen) => {
        this.hud.updateMoves(moves, isFrozen, this.session.getLevelMovesLeft(), this.session.getAccumulatedMoves());
        if (!this.restoringAttempt) this.resources.spendBank(this.checkpoint, this.session.getLevel(), this.session.getAccumulatedMoves());
      },
      onShufflesUpdated: (shuffles) => this.hud.updateShuffles(shuffles),
      onStateChanged: (state, snapshot) => {
        this.hud.setLastChance(state === GameState.LastChance);
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
          this.resources.fail(this.checkpoint, snapshot.level, this.session.getAccumulatedMoves(), snapshot.reason!);
          this.refreshLives();
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
    const setup = new LevelBoardSetup();
    setup.configure(this.board, this.session.getLevelConfig().features);
    this.boardInitializer.populate(this.board);
    setup.placeObjects(this.board, this.session.getLevelConfig().features);
    if (!this.deadlockResolver.hasPossibleMoves(this.board)) {
      this.deadlockResolver.shuffleBoard(this.board);
    }

    this.boardView.initFromBoard();
    this.onResize();
    this.inputController.setLocked(!this.canPlay());
  }

  /** A failed attempt retries this level; only explicit New Game resets the ladder. */
  private onModalAction(): void {
    if (this.resources.snapshot().lives <= 0) { this.modal.showNoLives?.(); return; }
    if (this.session.getState() === GameState.Victory) {
      this.session.advanceLevel();
    } else if (this.session.getState() === GameState.GameOver) this.session.retryLevel();
    else this.modal.hide();
    this.refreshLives();
  }

  private onResize(): void {
    if (this.turnInFlight) { this.layoutPending = true; return; }
    this.layoutPending = false;
    const width = this.boardViewport?.clientWidth ?? window.innerWidth;
    const height = this.boardViewport?.clientHeight ?? window.innerHeight;
    if (width <= 0 || height <= 0) return;

    // CSS owns placement; Pixi owns only the measured board region.
    if (this.app.renderer) {
      this.app.renderer.resize(width, height);
    }

    this.boardView.updateLayout(width, height);
  }

  private async runTurn(action: () => Promise<boolean>): Promise<boolean> {
    if (this.turnInFlight) return false;
    if (!this.canPlay()) { this.inputController.setLocked(true); return false; }
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
      this.refreshLives();
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
    this.records.recordCompletedLevel(this.session.exportState());
    this.recordsView.render();
    if (!isStatefulRandomSource(this.random)) {
      this.saves.suspend();
    } else {
      const savedAt = new Date().toISOString();
      const saved = this.saves.save({
        schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION,
        savedAt, board: this.board.getSnapshot(),
        session: this.session.exportState(), random: this.random.getSnapshot(),
      });
      if (saved) {
        this.checkpoint = `${savedAt}:${this.session.getLevel()}`;
        this.resources.clearAttempt();
      }
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
    this.hud.updateMoves(save.session.movesLeft, this.session.isTargetReached(), this.session.getLevelMovesLeft(), this.session.getAccumulatedMoves());
    this.hud.updateShuffles(save.session.shufflesLeft);
    this.hud.updateObjectives?.(this.session.getObjectives());
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
    this.saveStatusView.render(this.saves.status);
  }

  private canPlay(): boolean { return this.resources.snapshot().lives > 0 && this.session.canMakeMove(); }

  private beginAttempt(): void {
    const bank = this.resources.beginAttempt(this.checkpoint, this.session.getLevel(), this.session.getAccumulatedMoves());
    this.session.reconcileBank(bank);
  }

  private refreshLives(): void {
    const snapshot = this.resources.snapshot();
    this.livesView.render(snapshot, this.resources.status);
    this.modal.updateLives?.(snapshot);
    if (this.turnInFlight) return;
    const playable = snapshot.lives > 0 && this.session.canMakeMove();
    const wasLocked = this.inputController.isLocked();
    if (wasLocked === playable) this.inputController.setLocked(!playable);
    if (!playable) this.idleHintController.stop();
    else if (wasLocked) this.idleHintController.start();
  }
}
