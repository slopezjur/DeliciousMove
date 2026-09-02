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
import { GameSession, GameState } from './core/GameSession.ts';
import { InfiniteLevelProgression } from './core/LevelProgression.ts';
import { IRandomSource, MathRandomSource } from './core/random/IRandomSource.ts';
import { ALL_TILE_COLORS, Position } from './core/TileTypes.ts';
import { BoardView } from './view/BoardView.ts';
import { AnimationQueue } from './view/AnimationQueue.ts';
import { IAnimationSequencer } from './view/IAnimationSequencer.ts';
import { InputController } from './input/InputController.ts';
import { HUDView } from './ui/HUDView.ts';
import { IHUDView } from './ui/IHUDView.ts';
import { TurnCoordinator } from './TurnCoordinator.ts';

const HUD_HEIGHT = 90;
const END_OF_TURN_MODAL_DELAY_MS = 400;

export interface GameDependencies {
  app?: Application;
  random?: IRandomSource;
  board?: Board;
  boardInitializer?: IBoardInitializer;
  boardView?: BoardView;
  animationQueue?: IAnimationSequencer;
  inputController?: InputController;
  cascadeResolver?: ICascadeResolver;
  deadlockResolver?: IDeadlockResolver;
  session?: GameSession;
  hud?: IHUDView;
}

/**
 * Composition root: wires the deterministic core to the Pixi view and the DOM HUD.
 * Turn logic lives in TurnCoordinator, level rules in GameSession (SRP).
 */
export class Game {
  private readonly app: Application;
  private readonly board: Board;
  private readonly boardInitializer: IBoardInitializer;
  private readonly boardView: BoardView;
  private readonly inputController: InputController;
  private readonly deadlockResolver: IDeadlockResolver;
  private readonly session: GameSession;
  private readonly hud: IHUDView;
  private readonly turnCoordinator: TurnCoordinator;

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

    this.inputController =
      deps.inputController ?? new InputController(this.boardView, this.onSwapMove.bind(this));

    this.turnCoordinator = new TurnCoordinator({
      board: this.board,
      boardView: this.boardView,
      animations,
      cascadeResolver,
      deadlockResolver: this.deadlockResolver,
      session: this.session,
    });

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
    this.app.stage.addChild(this.boardView);

    window.addEventListener('resize', this.onResize.bind(this));

    this.session.restart();
    requestAnimationFrame(() => this.onResize());
  }

  /** Restarts the endless run from level 1. */
  public startNewGame(): void {
    this.session.restart();
  }

  private bindSessionEvents(): void {
    this.session.addListener({
      onLevelStarted: (config) => {
        this.hud.initLevel(config);
        this.buildPlayableBoard();
      },
      onScoreUpdated: (_score, added) => {
        if (added > 0) this.hud.addScore(added);
      },
      onMovesUpdated: (moves) => this.hud.updateMoves(moves),
      onShufflesUpdated: (shuffles) => this.hud.updateShuffles(shuffles),
      onStateChanged: (state, snapshot) => {
        if (state === GameState.Victory) {
          this.inputController.setLocked(true);
          setTimeout(
            () => this.hud.showVictory(snapshot.score, snapshot.level),
            END_OF_TURN_MODAL_DELAY_MS
          );
        } else if (state === GameState.GameOver) {
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
    const width = this.app.screen.width > 0 ? this.app.screen.width : window.innerWidth;
    const height = this.app.screen.height > 0 ? this.app.screen.height : window.innerHeight;

    // The board is centred once inside the area left below the HUD.
    this.boardView.updateLayout(width, Math.max(200, height - HUD_HEIGHT), HUD_HEIGHT);
  }

  private async onSwapMove(from: Position, to: Position): Promise<boolean> {
    const played = await this.turnCoordinator.playMove(from, to);
    // The turn may have ended the run, in which case the board stays locked.
    this.inputController.setLocked(!this.session.canMakeMove());
    return played;
  }
}
