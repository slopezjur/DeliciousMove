import { Board } from './core/Board.ts';
import { ICascadeResolver } from './core/CascadeResolver.ts';
import { IDeadlockResolver } from './core/ShuffleEngine.ts';
import { IGameSession } from './core/GameSession.ts';
import { Position } from './core/TileTypes.ts';
import { IAnimationSequencer } from './view/IAnimationSequencer.ts';
import { IBoardViewAnimator } from './view/IBoardViewContracts.ts';
import { IGameTelemetryService } from './core/telemetry/IGameTelemetry.ts';

export interface ITurnCoordinator {
  playMove(from: Position, to: Position): Promise<boolean>;
  activateTile(pos: Position): Promise<boolean>;
}

export interface TurnCoordinatorDependencies {
  board: Board;
  boardView: IBoardViewAnimator;
  animations: IAnimationSequencer;
  cascadeResolver: ICascadeResolver;
  deadlockResolver: IDeadlockResolver;
  session: IGameSession;
  telemetry?: IGameTelemetryService;
}

/**
 * Owns the lifecycle of a single player move: animate the swap, resolve it against the
 * model, play the cascade, then settle the board and close the turn (SRP). Depends only
 * on abstractions so it can be driven headlessly in tests.
 */
export class TurnCoordinator implements ITurnCoordinator {
  private readonly board: Board;
  private readonly boardView: IBoardViewAnimator;
  private readonly animations: IAnimationSequencer;
  private readonly cascadeResolver: ICascadeResolver;
  private readonly deadlockResolver: IDeadlockResolver;
  private readonly session: IGameSession;
  private readonly telemetry?: IGameTelemetryService;

  constructor(deps: TurnCoordinatorDependencies) {
    this.board = deps.board;
    this.boardView = deps.boardView;
    this.animations = deps.animations;
    this.cascadeResolver = deps.cascadeResolver;
    this.deadlockResolver = deps.deadlockResolver;
    this.session = deps.session;
    this.telemetry = deps.telemetry;
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
      this.telemetry?.recordSwap(from, to, false, 0, 0);
      return false;
    }

    // 2. Valid move: charge it and play out the cascade.
    const scoreBefore = this.session.getScore();
    this.session.onMoveInitiated();
    await this.animations.playCascadeSteps(result.steps, (gained) => this.session.addPoints(gained));
    const scoreGained = this.session.getScore() - scoreBefore;

    const specialsFormed = result.steps.flatMap((s) => s.evolutions?.map((e) => e.specialTile.special) ?? []);
    const specialsTriggered = result.steps.flatMap((s) => s.triggeredSpecials?.map((t) => t.effectType) ?? []);
    this.telemetry?.recordSwap(from, to, true, scoreGained, result.steps.length, specialsFormed, specialsTriggered);

    // 3. Settle the board, then close the turn.
    await this.settleDeadlocks();
    this.session.onTurnCompleted();
    return true;
  }

  /**
   * Activates a special candy directly on click/tap, without requiring a swap.
   * @returns true when activation succeeded and consumed a move.
   */
  public async activateTile(pos: Position): Promise<boolean> {
    if (!this.session.canMakeMove()) return false;

    const tile = this.board.get(pos.row, pos.col);
    if (!tile) return false;

    const spec = tile.special;
    const result = this.cascadeResolver.resolveActivation(this.board, pos);
    if (!result.valid) return false;

    const scoreBefore = this.session.getScore();
    this.session.onMoveInitiated();
    await this.animations.playCascadeSteps(result.steps, (gained) => this.session.addPoints(gained));
    const scoreGained = this.session.getScore() - scoreBefore;

    const specialsTriggered = result.steps.flatMap((s) => s.triggeredSpecials?.map((t) => t.effectType) ?? []);
    this.telemetry?.recordActivation(pos, spec, scoreGained, result.steps.length, specialsTriggered);

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
    this.telemetry?.recordShuffle('deadlock_auto', success);

    if (!success) {
      this.session.endWithDeadlock();
    }
  }
}
