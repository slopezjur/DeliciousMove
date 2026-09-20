import { Board } from './Board.ts';
import { TileColor, ALL_TILE_COLORS } from './TileTypes.ts';
import { IRandomSource, MathRandomSource } from './random/IRandomSource.ts';

export interface IBoardInitializer {
  populate(board: Board, seedColors?: TileColor[][]): void;
}

/**
 * Owns board generation policy (SRP): fills an empty grid with colors that never
 * form a pre-existing 3-in-a-row. Board itself only holds grid state.
 */
export class BoardInitializer implements IBoardInitializer {
  private readonly random: IRandomSource;
  private readonly availableColors: readonly TileColor[];

  constructor(
    random: IRandomSource = new MathRandomSource(),
    availableColors: readonly TileColor[] = ALL_TILE_COLORS
  ) {
    this.random = random;
    this.availableColors = availableColors;
  }

  public populate(board: Board, seedColors?: TileColor[][]): void {
    board.clear();

    if (seedColors) {
      for (let r = 0; r < board.rows; r++) {
        for (let c = 0; c < board.cols; c++) {
          if (!board.isValidPosition(r, c)) continue;
          board.createTile(r, c, seedColors[r][c]);
        }
      }
      return;
    }

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        if (!board.isValidPosition(r, c)) continue;
        const excludedColors = this.collectExcludedColors(board, r, c);
        const available = this.availableColors.filter((color) => !excludedColors.has(color));
        const pool = available.length > 0 ? available : this.availableColors;
        board.createTile(r, c, this.random.pick(pool));
      }
    }
  }

  /** Colors that would immediately close a 3-in-a-row at (row, col). */
  private collectExcludedColors(board: Board, row: number, col: number): Set<TileColor> {
    const excluded = new Set<TileColor>();

    if (col >= 2) {
      const left1 = board.get(row, col - 1);
      const left2 = board.get(row, col - 2);
      if (left1 && left2 && left1.color === left2.color) {
        excluded.add(left1.color);
      }
    }

    if (row >= 2) {
      const up1 = board.get(row - 1, col);
      const up2 = board.get(row - 2, col);
      if (up1 && up2 && up1.color === up2.color) {
        excluded.add(up1.color);
      }
    }

    if (row >= 1 && col >= 1) {
      const up = board.get(row - 1, col);
      const left = board.get(row, col - 1);
      const upLeft = board.get(row - 1, col - 1);
      if (up && left && upLeft && up.color === left.color && up.color === upLeft.color) {
        excluded.add(up.color);
      }
    }

    return excluded;
  }
}
