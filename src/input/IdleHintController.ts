import { Board } from '../core/Board.ts';
import { IDeadlockResolver } from '../core/ShuffleEngine.ts';
import { IGameSession } from '../core/GameSession.ts';
import { IBoardViewAnimator } from '../view/IBoardViewContracts.ts';
import { IAnimationSequencer } from '../view/IAnimationSequencer.ts';
import { SpecialType } from '../core/TileTypes.ts';
import { IIdleHintController } from './IIdleHintController.ts';

export const IDLE_HINT_DELAY_MS = 10_000;
export const IDLE_HINT_REPEAT_MS = 7_000;

export class IdleHintController implements IIdleHintController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isActive = false;

  constructor(
    private readonly board: Board,
    private readonly boardView: IBoardViewAnimator,
    private readonly deadlockResolver: IDeadlockResolver,
    private readonly session: IGameSession,
    private readonly animations: IAnimationSequencer,
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
        const spriteA = this.boardView.getTileSprite(tileA.id);
        const spriteB = this.boardView.getTileSprite(tileB.id);
        const sprites = [spriteA, spriteB].filter((s): s is NonNullable<typeof s> => Boolean(s));
        if (sprites.length > 0) {
          this.animations.animateHint?.(sprites);
        }
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
        const sprite = this.boardView.getTileSprite(randomId);
        if (sprite) {
          this.animations.animateHint?.([sprite]);
        }
      }
    }

    // Reschedule repeat if player remains idle
    this.timer = setTimeout(() => {
      this.triggerHint();
    }, this.repeatDelayMs);
  }
}
