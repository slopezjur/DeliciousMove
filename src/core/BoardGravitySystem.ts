import { Board } from './Board.ts';
import { DropMovement } from './TileTypes.ts';
import { gravityPaths } from './BoardMechanics.ts';

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

    for (const path of gravityPaths(board)) {
      let empty = path.length - 1;
      for (let index = path.length - 1; index >= 0; index--) {
        const from = path[index];
        const tile = board.get(from.row, from.col);
        if (tile !== null) {
          if (index !== empty) {
            const to = path[empty];
            board.set(from.row, from.col, null);
            board.set(to.row, to.col, tile);
            drops.push({ id: tile.id, fromRow: from.row, toRow: to.row, col: to.col,
              ...(from.col !== to.col ? { fromCol: from.col, teleport: true } : {}) });
          }
          empty--;
        }
      }
    }

    return drops;
  }
}
