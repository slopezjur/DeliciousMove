import { Board } from './core/Board.ts';
import { ICascadeResolver } from './core/CascadeResolver.ts';
import { IDeadlockResolver } from './core/ShuffleEngine.ts';
import { GameSession } from './core/GameSession.ts';
import { Position } from './core/TileTypes.ts';
import { IAnimationSequencer } from './view/IAnimationSequencer.ts';
import { IBoardViewAnimator } from './view/IBoardViewContracts.ts';

export interface TurnCoordinatorDependencies {
  board: Board;
  boardView: IBoardViewAnimator;
  animations: IAnimationSequencer;
  cascadeResolver: ICascadeResolver;
  deadlockResolver: IDeadlockResolver;
  session: GameSession;
}

/**
 * Owns the lifecycle of a single player move: animate the swap, resolve it against the
 * model, play the cascade, then settle the board and close the turn (SRP). Depends only
 * on abstractions so it can be driven headlessly in tests.
 */
export class TurnCoordinator {
  private readonly board: Board;
  private readonly boardView: IBoardViewAnimator;
  private readonly animations: IAnimationSequencer;
  private readonly cascadeResolver: ICascadeResolver;
  private readonly deadlockResolver: IDeadlockResolver;
  private readonly session: GameSession;

  constructor(deps: TurnCoordinatorDependencies) {
    this.board = deps.board;
    this.boardView = deps.boardView;
    this.animations = deps.animations;
    this.cascadeResolver = deps.cascadeResolver;
    this.deadlockResolver = deps.deadlockResolver;
    this.session = deps.session;
  }

  /**
   * @returns true when the swap was legal and consumed a move.
   */
  public async playMove(from: Position, to: Position): Promise<boolean> {
    if (!this.session.canMakeMove()) return false;

    const tileA = this.board.get(from.row, from.col);
    const tileB = this.board.get(to.row, to.col);
    if (!tileA || !tileB) return false;

    const spriteA = this.boardView.getTileSprite(tileA.id);
    const spriteB = this.boardView.getTileSprite(tileB.id);
    if (!spriteA || !spriteB) return false;

    // 1. Show the swap before the model commits to it.
    await this.animations.animateSwap(spriteA, spriteB, from, to);

    const result = this.cascadeResolver.resolveSwap(this.board, from, to);
    if (!result.valid) {
      await this.animations.animateSwap(spriteA, spriteB, to, from);
      return false;
    }

    // 2. Valid move: charge it and play out the cascade.
    this.session.onMoveInitiated();
    await this.animations.playCascadeSteps(result.steps, (gained) => this.session.addPoints(gained));

    // 3. Settle the board, then close the turn.
    await this.settleDeadlocks();
    this.session.onTurnCompleted();
    return true;
  }

  /**
   * Rescues a jammed board while the level still has reshuffles. Once the budget is
   * spent — or the scrambler cannot find a solvable arrangement — the run is over.
   */
  private async settleDeadlocks(): Promise<void> {
    if (this.deadlockResolver.hasPossibleMoves(this.board)) return;

    if (!this.session.consumeShuffle()) {
      this.session.endWithDeadlock();
      return;
    }

    const { success, mapping } = this.deadlockResolver.shuffleBoard(this.board);
    await this.animations.animateShuffle(mapping);

    if (!success) {
      this.session.endWithDeadlock();
    }
  }
}
