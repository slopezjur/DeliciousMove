import { RandomSnapshot } from './core/random/IRandomSource.ts';
import { Board } from './core/Board.ts';
import { ICascadeResolver } from './core/CascadeResolver.ts';
import { IDeadlockResolver } from './core/ShuffleEngine.ts';
import { IGameSession } from './core/GameSession.ts';
import { Position, SpecialType } from './core/TileTypes.ts';
import { IAnimationSequencer } from './view/IAnimationSequencer.ts';
import { IGameTelemetryService } from './core/telemetry/IGameTelemetry.ts';
import { LastChanceQueue } from './core/LastChanceQueue.ts';

export interface ITurnCoordinator {
  playMove(from: Position, to: Position): Promise<boolean>;
  activateTile(pos: Position): Promise<boolean>;
}

/** Turn execution cannot restart, restore, or reconfigure the session. */
export type ITurnSession = Pick<IGameSession,
  'canMakeMove' | 'getSnapshot' | 'isTargetReached' | 'getScore' | 'onMoveInitiated'
  | 'addPoints' | 'recordObjectiveEvents' | 'onTurnCompleted' | 'getMovesLeft'
  | 'completeWithVictory' | 'consumeShuffle' | 'endWithDeadlock' | 'beginLastChance'>;

export type ITurnTelemetry = Pick<IGameTelemetryService,
  'recordTurnDetails' | 'recordSwap' | 'recordActivation' | 'recordShuffle'>;

export interface TurnCoordinatorDependencies {
  board: Board;
  animations: IAnimationSequencer;
  cascadeResolver: ICascadeResolver;
  deadlockResolver: IDeadlockResolver;
  session: ITurnSession;
  telemetry?: ITurnTelemetry;
  getRandomSnapshot?: () => RandomSnapshot | undefined;
}

/**
 * Owns the lifecycle of a single player move: animate the swap, resolve it against the
 * model, play the cascade, then settle the board and close the turn (SRP). Depends only
 * on abstractions so it can be driven headlessly in tests.
 */
export class TurnCoordinator implements ITurnCoordinator {
  private readonly getRandomSnapshot?: () => RandomSnapshot | undefined;
  private readonly board: Board;
  private readonly animations: IAnimationSequencer;
  private readonly cascadeResolver: ICascadeResolver;
  private readonly deadlockResolver: IDeadlockResolver;
  private readonly session: ITurnSession;
  private readonly telemetry?: ITurnTelemetry;

  constructor(deps: TurnCoordinatorDependencies) {
    this.getRandomSnapshot = deps.getRandomSnapshot;
    this.board = deps.board;
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

    // Rocks are completely static obstacles: swapping with a rock is forbidden
    if (!this.board.canSwap(from) || !this.board.canSwap(to)) {
      const candy = tileA.special === SpecialType.Rock ? tileB : tileA;
      if (candy.special !== SpecialType.Rock) {
        await this.animations.animateForbiddenMove?.(candy.id);
      }
      this.telemetry?.recordSwap(from, to, false, 0, 0);
      return false;
    }

    const boardBefore = this.board.getSnapshot();
    const sessionBefore = this.session.getSnapshot();
    const randomBefore = this.getRandomSnapshot?.();
    // 1. Show the swap before the model commits to it.
    await this.animations.animateSwap(tileA.id, tileB.id, from, to);

    const avoidMatches = this.session.isTargetReached();
    const result = this.cascadeResolver.resolveSwap(this.board, from, to, avoidMatches);
    if (!result.valid) {
      await this.animations.animateSwap(tileA.id, tileB.id, to, from);
      this.telemetry?.recordSwap(from, to, false, 0, 0);
      return false;
    }

    this.telemetry?.recordTurnDetails?.({
      boardBefore, sessionBefore, randomBefore, from, to,
      boardAfter: this.board.getSnapshot(), steps: result.steps,
    });

    // 2. Valid move: charge it and play out the cascade.
    const scoreBefore = this.session.getScore();
    this.session.onMoveInitiated();
    await this.animations.playCascadeSteps(result.steps, (gained, events) => {
      this.session.addPoints(gained);
      this.session.recordObjectiveEvents(events ?? []);
    });
    const scoreGained = this.session.getScore() - scoreBefore;

    const specialsFormed = result.steps.flatMap((s) => s.evolutions?.map((e) => e.specialTile.special) ?? []);
    const specialsTriggered = result.steps.flatMap((s) => s.triggeredSpecials?.map((t) => t.effectType) ?? []);
    this.telemetry?.recordSwap(from, to, true, scoreGained, result.steps.length, specialsFormed, specialsTriggered);

    // 3. Give existing specials a final chance before charging a failure.
    await this.playLastChance();
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
    if (!tile || !this.board.canActivate(pos)) return false;

    const boardBefore = this.board.getSnapshot();
    const sessionBefore = this.session.getSnapshot();
    const randomBefore = this.getRandomSnapshot?.();
    const spec = tile.special;
    const avoidMatches = this.session.isTargetReached();
    const result = this.cascadeResolver.resolveActivation(this.board, pos, avoidMatches);
    if (!result.valid) return false;
    this.telemetry?.recordTurnDetails?.({
      boardBefore, sessionBefore, randomBefore, from: pos,
      boardAfter: this.board.getSnapshot(), steps: result.steps,
    });

    const scoreBefore = this.session.getScore();
    this.session.onMoveInitiated();
    await this.animations.playCascadeSteps(result.steps, (gained, events) => {
      this.session.addPoints(gained);
      this.session.recordObjectiveEvents(events ?? []);
    });
    const scoreGained = this.session.getScore() - scoreBefore;

    const specialsTriggered = result.steps.flatMap((s) => s.triggeredSpecials?.map((t) => t.effectType) ?? []);
    this.telemetry?.recordActivation(pos, spec, scoreGained, result.steps.length, specialsTriggered);

    await this.playLastChance();
    await this.settleDeadlocks();
    this.session.onTurnCompleted();
    return true;
  }

  private async playLastChance(): Promise<void> {
    if (this.session.getMovesLeft() !== 0 || this.session.isTargetReached()) return;
    const queue = new LastChanceQueue(this.board);
    let tile = queue.next(this.board);
    if (!tile || !this.session.beginLastChance()) return;

    while (tile) {
      const from = { row: tile.row, col: tile.col };
      const boardBefore = this.board.getSnapshot(), sessionBefore = this.session.getSnapshot();
      const randomBefore = this.getRandomSnapshot?.();
      const result = this.cascadeResolver.resolveActivation(this.board, from, false, 'last_chance');
      if (result.valid) {
        queue.record(result.steps);
        this.telemetry?.recordTurnDetails?.({
          boardBefore, sessionBefore, randomBefore, from, activationContext: 'last_chance',
          boardAfter: this.board.getSnapshot(), steps: result.steps,
        });
        const scoreBefore = this.session.getScore();
        await this.animations.playCascadeSteps(result.steps, (points, events) => {
          this.session.addPoints(points);
          this.session.recordObjectiveEvents(events ?? []);
        });
        this.telemetry?.recordActivation(from, tile.special, this.session.getScore() - scoreBefore,
          result.steps.length, result.steps.flatMap(step => step.triggeredSpecials?.map(effect => effect.effectType) ?? []), 'last_chance');
      }
      tile = queue.next(this.board);
    }
  }

  /**
   * Rescues a jammed board while the level still has reshuffles. Once the budget is
   * spent, the attempt fails. Failed rescues try the remaining shuffle budget.
   * In bonus phase, a board with no legal action concludes the level with victory.
   */
  private async settleDeadlocks(): Promise<void> {
    // After the finale, unused shuffles still cannot buy moves.
    if (!this.session.isTargetReached() && this.session.getMovesLeft() === 0) return;
    if (this.deadlockResolver.hasPossibleMoves(this.board)) return;

    if (this.session.isTargetReached()) {
      this.session.completeWithVictory();
      return;
    }

    while (this.session.consumeShuffle()) {
      const { success, mapping } = this.deadlockResolver.shuffleBoard(this.board);
      await this.animations.animateShuffle(mapping);
      this.telemetry?.recordShuffle('deadlock_auto', success);
      if (success) return;
    }
    this.session.endWithDeadlock();
  }
}
