import { Board } from './Board.ts';
import { SpawnData, TileColor, ALL_TILE_COLORS } from './TileTypes.ts';
import { IRandomSource, MathRandomSource } from './random/IRandomSource.ts';

export interface ITileSpawner {
  refillEmptySlots(board: Board): SpawnData[];
}

export class TileSpawner implements ITileSpawner {
  private readonly availableColors: readonly TileColor[];
  private readonly random: IRandomSource;

  constructor(
    availableColors: readonly TileColor[] = ALL_TILE_COLORS,
    random: IRandomSource = new MathRandomSource()
  ) {
    this.availableColors = availableColors;
    this.random = random;
  }

  /**
   * Identifies empty spaces at the top of each column, creates random new tiles,
   * places them on the board, and returns spawn event data.
   */
  public refillEmptySlots(board: Board): SpawnData[] {
    const spawns: SpawnData[] = [];

    for (let c = 0; c < board.cols; c++) {
      for (let r = board.rows - 1; r >= 0; r--) {
        if (board.get(r, c) === null) {
          const randomColor = this.random.pick(this.availableColors);
          const newTile = board.createTile(r, c, randomColor);
          spawns.push({ tile: newTile });
        }
      }
    }

    return spawns;
  }
}
