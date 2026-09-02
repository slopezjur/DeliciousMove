import { Application } from 'pixi.js';
import { Board } from './core/Board.ts';
import { CascadeResolver } from './core/CascadeResolver.ts';
import { ShuffleEngine } from './core/ShuffleEngine.ts';
import { Position } from './core/TileTypes.ts';
import { BoardView } from './view/BoardView.ts';
import { AnimationQueue } from './view/AnimationQueue.ts';
import { InputController } from './input/InputController.ts';
import { HUDView } from './ui/HUDView.ts';

export class Game {
  private app: Application;
  private board: Board;
  private boardView: BoardView;
  private animationQueue: AnimationQueue;
  private inputController: InputController;
  private hud: HUDView;

  private totalScore: number = 0;
  private movesLeft: number = 25;
  private targetScore: number = 4000;
  private isGameOver: boolean = false;

  constructor() {
    this.app = new Application();
    this.board = new Board(8, 8);
    this.boardView = new BoardView(this.board);
    this.animationQueue = new AnimationQueue(this.boardView);
    this.inputController = new InputController(this.boardView, this.onSwapMove.bind(this));
    this.hud = new HUDView(this.startNewGame.bind(this));
  }

  public async init(containerElement: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: window,
      backgroundColor: 0x160c28,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      preference: 'webgpu',
    });

    containerElement.appendChild(this.app.canvas);
    this.app.stage.addChild(this.boardView);

    window.addEventListener('resize', this.onResize.bind(this));

    this.startNewGame();
  }

  public startNewGame(): void {
    this.totalScore = 0;
    this.movesLeft = 25;
    this.targetScore = 4000;
    this.isGameOver = false;

    this.hud.initLevel(this.movesLeft, this.targetScore);

    // Populate board guaranteeing at least 1 move and 0 initial matches
    this.board.clear();
    this.board.populateInitial();
    if (!ShuffleEngine.hasPossibleMoves(this.board)) {
      ShuffleEngine.shuffleBoard(this.board);
    }

    this.boardView.initFromBoard();
    this.onResize();
    this.inputController.setLocked(false);
  }

  private onResize(): void {
    const hudHeight = 90;
    const availableWidth = this.app.screen.width;
    const availableHeight = this.app.screen.height - hudHeight;

    this.boardView.updateLayout(availableWidth, availableHeight);
    this.boardView.y += hudHeight;
  }

  private async onSwapMove(from: Position, to: Position): Promise<boolean> {
    if (this.isGameOver) return false;

    // Check validity and calculate cascade steps
    const result = CascadeResolver.resolveSwap(this.board, from, to);

    if (!result.valid) {
      await this.animationQueue.animateSwap(from, to, true);
      return false;
    }

    // Valid move!
    await this.animationQueue.animateSwap(from, to, false);

    this.movesLeft--;
    this.hud.updateMoves(this.movesLeft);

    // Play all cascades and score updates
    await this.animationQueue.playCascadeSteps(result.steps, (gained) => {
      this.totalScore += gained;
      this.hud.addScore(gained);
    });

    // Check if board has valid moves left, otherwise auto-shuffle
    if (!ShuffleEngine.hasPossibleMoves(this.board)) {
      const mapping = ShuffleEngine.shuffleBoard(this.board);
      await this.animationQueue.animateShuffle(mapping);
    }

    // Check win/loss conditions
    if (this.totalScore >= this.targetScore) {
      this.isGameOver = true;
      this.inputController.setLocked(true);
      setTimeout(() => this.hud.showVictory(this.totalScore), 400);
    } else if (this.movesLeft <= 0) {
      this.isGameOver = true;
      this.inputController.setLocked(true);
      setTimeout(() => this.hud.showGameOver(this.totalScore), 400);
    }

    return true;
  }
}
