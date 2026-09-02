import { FederatedPointerEvent } from 'pixi.js';
import { BoardView } from '../view/BoardView.ts';
import { Position } from '../core/TileTypes.ts';

export type SwapCallback = (from: Position, to: Position) => Promise<boolean>;

export class InputController {
  private boardView: BoardView;
  private onSwap: SwapCallback;

  private isLocked: boolean = false;
  private isPointerDown: boolean = false;
  private startPointerPos: { x: number; y: number } = { x: 0, y: 0 };
  private startGridPos: Position | null = null;
  private selectedGridPos: Position | null = null;

  private readonly DRAG_THRESHOLD = 22;

  constructor(boardView: BoardView, onSwap: SwapCallback) {
    this.boardView = boardView;
    this.onSwap = onSwap;

    this.setupListeners();
  }

  public setLocked(locked: boolean): void {
    this.isLocked = locked;
    if (locked) {
      this.clearSelection();
      this.isPointerDown = false;
      this.startGridPos = null;
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
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= this.DRAG_THRESHOLD) {
      // Determine swipe direction
      let targetRow = this.startGridPos.row;
      let targetCol = this.startGridPos.col;

      if (Math.abs(dx) > Math.abs(dy)) {
        targetCol += dx > 0 ? 1 : -1;
      } else {
        targetRow += dy > 0 ? 1 : -1;
      }

      const targetPos: Position = { row: targetRow, col: targetCol };

      if (this.boardView.board.isValidPosition(targetRow, targetCol)) {
        const fromPos = this.startGridPos;
        this.clearSelection();
        this.isPointerDown = false;
        this.startGridPos = null;
        this.triggerSwap(fromPos, targetPos);
      }
    }
  }

  private handlePointerUp(e: FederatedPointerEvent): void {
    if (this.isLocked || !this.isPointerDown || !this.startGridPos) {
      this.isPointerDown = false;
      this.startGridPos = null;
      return;
    }

    const local = this.boardView.toLocal(e.global);
    const tappedPos = this.boardView.localToGrid(local.x, local.y);

    this.isPointerDown = false;
    const fromPos = this.startGridPos;
    this.startGridPos = null;

    if (!tappedPos) {
      this.clearSelection();
      return;
    }

    // Tap handling
    if (!this.selectedGridPos) {
      this.selectPosition(tappedPos);
    } else {
      if (this.selectedGridPos.row === tappedPos.row && this.selectedGridPos.col === tappedPos.col) {
        // Deselect
        this.clearSelection();
      } else if (this.boardView.board.isAdjacent(this.selectedGridPos, tappedPos)) {
        // Tap adjacent tile -> execute swap
        const prevSelected = this.selectedGridPos;
        this.clearSelection();
        this.triggerSwap(prevSelected, tappedPos);
      } else {
        // Tap different distant tile -> select it instead
        this.clearSelection();
        this.selectPosition(tappedPos);
      }
    }
  }

  private selectPosition(pos: Position): void {
    this.selectedGridPos = pos;
    const tile = this.boardView.board.get(pos.row, pos.col);
    if (tile) {
      const sprite = this.boardView.getTileSprite(tile.id);
      sprite?.setSelected(true);
    }
  }

  private clearSelection(): void {
    if (this.selectedGridPos) {
      const tile = this.boardView.board.get(this.selectedGridPos.row, this.selectedGridPos.col);
      if (tile) {
        const sprite = this.boardView.getTileSprite(tile.id);
        sprite?.setSelected(false);
      }
      this.selectedGridPos = null;
    }
  }

  private async triggerSwap(from: Position, to: Position): Promise<void> {
    this.setLocked(true);
    await this.onSwap(from, to);
    this.setLocked(false);
  }
}
