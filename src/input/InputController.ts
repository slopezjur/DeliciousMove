import { FederatedPointerEvent } from 'pixi.js';
import { IBoardInputSurface } from '../view/IBoardViewContracts.ts';
import { Position } from '../core/TileTypes.ts';

export type SwapCallback = (from: Position, to: Position) => Promise<boolean>;

export class InputController {
  private boardView: IBoardInputSurface;
  private onSwap: SwapCallback;

  private isLocked: boolean = false;
  private isPointerDown: boolean = false;
  private startPointerPos: { x: number; y: number } = { x: 0, y: 0 };
  private startGridPos: Position | null = null;
  private selectedGridPos: Position | null = null;

  private readonly DRAG_THRESHOLD = 22;

  constructor(boardView: IBoardInputSurface, onSwap: SwapCallback) {
    this.boardView = boardView;
    this.onSwap = onSwap;

    this.setupListeners();
  }

  public setLocked(locked: boolean): void {
    this.isLocked = locked;
    if (locked) {
      this.clearSelection();
      this.resetDrag();
    }
  }

  private setupListeners(): void {
    this.boardView.eventMode = 'static';

    this.boardView.on('pointerdown', this.handlePointerDown, this);
    this.boardView.on('globalpointermove', this.handlePointerMove, this);
    this.boardView.on('pointerup', this.handlePointerUp, this);
    this.boardView.on('pointerupoutside', this.handlePointerUp, this);
  }

  private handlePointerDown(e: FederatedPointerEvent): void {
    if (this.isLocked) return;

    const local = this.boardView.toLocal(e.global);
    const gridPos = this.boardView.localToGrid(local.x, local.y);
    if (!gridPos) return;

    this.isPointerDown = true;
    this.startPointerPos = { x: local.x, y: local.y };
    this.startGridPos = gridPos;
  }

  private handlePointerMove(e: FederatedPointerEvent): void {
    if (this.isLocked || !this.isPointerDown || !this.startGridPos) return;

    const local = this.boardView.toLocal(e.global);
    const dx = local.x - this.startPointerPos.x;
    const dy = local.y - this.startPointerPos.y;

    if (Math.hypot(dx, dy) < this.DRAG_THRESHOLD) return;

    // Dominant axis decides the swipe direction.
    const targetPos: Position =
      Math.abs(dx) > Math.abs(dy)
        ? { row: this.startGridPos.row, col: this.startGridPos.col + (dx > 0 ? 1 : -1) }
        : { row: this.startGridPos.row + (dy > 0 ? 1 : -1), col: this.startGridPos.col };

    const fromPos = this.startGridPos;
    this.clearSelection();
    this.resetDrag();

    // Swiping off the board edge simply cancels the gesture; it must not fall through
    // to the tap handler on release.
    if (this.boardView.board.isValidPosition(targetPos.row, targetPos.col)) {
      this.triggerSwap(fromPos, targetPos);
    }
  }

  private handlePointerUp(e: FederatedPointerEvent): void {
    if (this.isLocked || !this.isPointerDown || !this.startGridPos) {
      this.resetDrag();
      return;
    }

    const local = this.boardView.toLocal(e.global);
    const tappedPos = this.boardView.localToGrid(local.x, local.y);
    this.resetDrag();

    if (!tappedPos) {
      this.clearSelection();
      return;
    }

    // Tap handling
    if (!this.selectedGridPos) {
      this.selectPosition(tappedPos);
      return;
    }

    const previous = this.selectedGridPos;
    this.clearSelection();

    if (previous.row === tappedPos.row && previous.col === tappedPos.col) {
      return; // Tapping the selected tile deselects it.
    }

    if (this.boardView.board.isAdjacent(previous, tappedPos)) {
      this.triggerSwap(previous, tappedPos);
    } else {
      this.selectPosition(tappedPos);
    }
  }

  private selectPosition(pos: Position): void {
    this.selectedGridPos = pos;
    this.boardView.setTileSelected(pos, true);
  }

  private clearSelection(): void {
    if (this.selectedGridPos) {
      this.boardView.setTileSelected(this.selectedGridPos, false);
      this.selectedGridPos = null;
    }
  }

  private resetDrag(): void {
    this.isPointerDown = false;
    this.startGridPos = null;
  }

  /**
   * Locks input for the duration of the move. Unlocking is the caller's decision, since
   * the turn may have ended the game, in which case the board must stay locked.
   */
  private async triggerSwap(from: Position, to: Position): Promise<void> {
    this.setLocked(true);
    await this.onSwap(from, to);
  }
}
