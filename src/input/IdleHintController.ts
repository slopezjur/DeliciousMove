import { Board } from '../core/Board.ts';
import { IDeadlockResolver } from '../core/ShuffleEngine.ts';
import { IGameSession } from '../core/GameSession.ts';
import { IHintAnimator } from '../view/IAnimationSequencer.ts';
import { SpecialType } from '../core/TileTypes.ts';
import { IIdleHintController } from './IIdleHintController.ts';

export const IDLE_HINT_DELAY_MS = 10_000;
export const IDLE_HINT_REPEAT_MS = 7_000;

export class IdleHintController implements IIdleHintController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isActive = false;

  constructor(
    private readonly board: Board,
    private readonly deadlockResolver: Pick<IDeadlockResolver, 'findPossibleMoves'>,
    private readonly session: Pick<IGameSession, 'canMakeMove'>,
    private readonly animations: IHintAnimator,
    private readonly idleDelayMs: number = IDLE_HINT_DELAY_MS,
    private readonly repeatDelayMs: number = IDLE_HINT_REPEAT_MS
  ) {}

  public start(): void {
    this.isActive = true;
    this.resetTimer();
  }

  public stop(): void {
    this.isActive = false;
    this.clearTimer();
  }

  public resetTimer(): void {
    this.clearTimer();
    if (!this.isActive) return;

    this.timer = setTimeout(() => {
      this.triggerHint();
    }, this.idleDelayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private triggerHint(): void {
    if (!this.isActive || !this.session.canMakeMove()) return;

    // 1. Check possible swap moves
    const possibleMoves = this.deadlockResolver.findPossibleMoves(this.board);
    if (possibleMoves.length > 0) {
      const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      const tileA = this.board.get(move.from.row, move.from.col);
      const tileB = this.board.get(move.to.row, move.to.col);
      if (tileA && tileB) {
        this.animations.animateHint([tileA.id, tileB.id]);
      }
    } else {
      // 2. Or check any activatable specials on the board
      const specials: number[] = [];
      this.board.forEachTile((t) => {
        if (t.special !== SpecialType.None && t.special !== SpecialType.Rock) {
          specials.push(t.id);
        }
      });
      if (specials.length > 0) {
        const randomId = specials[Math.floor(Math.random() * specials.length)];
        this.animations.animateHint([randomId]);
      }
    }

    // Reschedule repeat if player remains idle
    this.timer = setTimeout(() => {
      this.triggerHint();
    }, this.repeatDelayMs);
  }
}
