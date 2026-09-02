import { Board } from './Board.ts';
import { DropMovement } from './TileTypes.ts';

export interface IGravitySystem {
  applyGravity(board: Board): DropMovement[];
}

export class BoardGravitySystem implements IGravitySystem {
  /**
   * Drops remaining tiles down into empty slots per column.
   * Modifies board in-place and returns the list of discrete drop movements.
   */
  public applyGravity(board: Board): DropMovement[] {
    const drops: DropMovement[] = [];

    for (let c = 0; c < board.cols; c++) {
      let emptyRow = board.rows - 1;
      for (let r = board.rows - 1; r >= 0; r--) {
        const tile = board.get(r, c);
        if (tile !== null) {
          if (r !== emptyRow) {
            board.set(r, c, null);
            board.set(emptyRow, c, tile);
            drops.push({
              id: tile.id,
              fromRow: r,
              toRow: emptyRow,
              col: c,
            });
          }
          emptyRow--;
        }
      }
    }

    return drops;
  }
}
