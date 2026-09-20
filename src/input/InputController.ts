import { FederatedPointerEvent } from 'pixi.js';
import { IBoardInputSurface } from '../view/IBoardViewContracts.ts';
import { Position } from '../core/TileTypes.ts';

export type SwapCallback = (from: Position, to: Position) => Promise<boolean>;
export type ActivateCallback = (pos: Position) => Promise<boolean>;

export interface IInputController {
  setLocked(locked: boolean): void;
  isLocked(): boolean;
}

export class InputController implements IInputController {
  private boardView: IBoardInputSurface;
  private onSwap: SwapCallback;
  private onActivate?: ActivateCallback;
  private onActivity?: () => void;

  private locked: boolean = false;
  private isPointerDown: boolean = false;
  private startPointerPos: { x: number; y: number } = { x: 0, y: 0 };
  private startGridPos: Position | null = null;
  private selectedGridPos: Position | null = null;

  private readonly DRAG_THRESHOLD = 22;

  constructor(
    boardView: IBoardInputSurface,
    onSwap: SwapCallback,
    onActivate?: ActivateCallback,
    onActivity?: () => void
  ) {
    this.boardView = boardView;
    this.onSwap = onSwap;
    this.onActivate = onActivate;
    this.onActivity = onActivity;

    this.setupListeners();
  }

  public isLocked(): boolean {
    return this.locked;
  }

  public setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.clearSelection();
      this.resetDrag();
    } else {
      this.onActivity?.();
    }
  }

  private setupListeners(): void {
    this.boardView.eventMode = 'static';
    this.boardView.on('pointerdown', this.handlePointerDown.bind(this));
    this.boardView.on('globalpointermove', this.handlePointerMove.bind(this));
    this.boardView.on('pointerup', this.handlePointerUp.bind(this));
    this.boardView.on('pointerupoutside', this.handlePointerUp.bind(this));
  }

  private handlePointerDown(e: FederatedPointerEvent): void {
    if (this.locked) return;
    this.onActivity?.();

    const local = this.boardView.toLocal(e.global);
    const gridPos = this.boardView.localToGrid(local.x, local.y);
    if (!gridPos) return;

    // Rock obstacles are static: reject picking up or dragging rocks
    if (this.boardView.isBlocked?.(gridPos) ?? this.boardView.isRock?.(gridPos)) return;

    this.isPointerDown = true;
    this.startPointerPos = { x: local.x, y: local.y };
    this.startGridPos = gridPos;
  }

  private handlePointerMove(e: FederatedPointerEvent): void {
    if (this.locked || !this.isPointerDown || !this.startGridPos) return;

    const local = this.boardView.toLocal(e.global);
    const dx = local.x - this.startPointerPos.x;
    const dy = local.y - this.startPointerPos.y;

    if (Math.hypot(dx, dy) < this.DRAG_THRESHOLD) return;

    let targetPos: Position;
    if (Math.abs(dx) > Math.abs(dy)) {
      targetPos = {
        row: this.startGridPos.row,
        col: this.startGridPos.col + (dx > 0 ? 1 : -1),
      };
    } else {
      targetPos = {
        row: this.startGridPos.row + (dy > 0 ? 1 : -1),
        col: this.startGridPos.col,
      };
    }

    const fromPos = this.startGridPos;
    this.clearSelection();
    this.resetDrag();

    if (this.boardView.isValidPosition(targetPos)) {
      this.triggerSwap(fromPos, targetPos);
    }
  }

  private handlePointerUp(e: FederatedPointerEvent): void {
    if (this.locked || !this.isPointerDown || !this.startGridPos) {
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

    // Rock obstacles are static: reject selection or activation
    if (this.boardView.isBlocked?.(tappedPos) ?? this.boardView.isRock?.(tappedPos)) {
      this.clearSelection();
      return;
    }

    // Tap handling
    if (!this.selectedGridPos) {
      // If tapping a special candy directly, activate it immediately!
      if (this.boardView.isSpecialTile(tappedPos) && this.onActivate) {
        this.triggerActivate(tappedPos);
        return;
      }
      this.selectPosition(tappedPos);
      return;
    }

    const previous = this.selectedGridPos;
    this.clearSelection();

    if (previous.row === tappedPos.row && previous.col === tappedPos.col) {
      // If tapping the already selected special candy, activate it!
      if (this.boardView.isSpecialTile(tappedPos) && this.onActivate) {
        this.triggerActivate(tappedPos);
        return;
      }
      return; // Tapping normal selected tile deselects it.
    }

    if (this.boardView.isAdjacent(previous, tappedPos)) {
      this.triggerSwap(previous, tappedPos);
    } else {
      if (this.boardView.isSpecialTile(tappedPos) && this.onActivate) {
        this.triggerActivate(tappedPos);
        return;
      }
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

  private async triggerSwap(from: Position, to: Position): Promise<void> {
    this.setLocked(true);
    try {
      await this.onSwap(from, to);
    } catch (err) {
      console.error('[DeliciousMove] Swap execution error:', err);
      this.setLocked(false);
    }
  }

  private async triggerActivate(pos: Position): Promise<void> {
    if (!this.onActivate) return;
    this.setLocked(true);
    try {
      await this.onActivate(pos);
    } catch (err) {
      console.error('[DeliciousMove] Activation execution error:', err);
      this.setLocked(false);
    }
  }
}
