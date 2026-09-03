import { Board } from './Board.ts';
import { SpawnData, TileColor, ALL_TILE_COLORS, SpecialType } from './TileTypes.ts';
import { IRandomSource, MathRandomSource } from './random/IRandomSource.ts';

export interface ITileSpawner {
  refillEmptySlots(board: Board, avoidMatches?: boolean): SpawnData[];
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
   * Identifies empty spaces at the top of each column, creates new tiles,
   * places them on the board, and returns spawn event data.
   */
  public refillEmptySlots(board: Board, avoidMatches = false): SpawnData[] {
    const spawns: SpawnData[] = [];
    let rocksSpawnedThisWave = 0;
    const MAX_ROCKS_PER_WAVE = 2; // Smooth gradual accumulation across turns

    for (let c = 0; c < board.cols; c++) {
      let rockInThisCol = false;
      for (let r = board.rows - 1; r >= 0; r--) {
        if (board.get(r, c) === null) {
          if (avoidMatches) {
            // In bonus overtime phase, smoothly spawn at most 2 Rocks per wave to steadily wind down the board
            const canSpawnRock = rocksSpawnedThisWave < MAX_ROCKS_PER_WAVE && !rockInThisCol;
            const isRock = canSpawnRock && this.random.next() < 0.35;

            if (isRock) {
              rocksSpawnedThisWave++;
              rockInThisCol = true;
              const newTile = board.createTile(r, c, TileColor.Red, SpecialType.Rock);
              spawns.push({ tile: newTile });
              continue;
            }

            const color = this.pickInertColor(board, r, c);
            const newTile = board.createTile(r, c, color);
            spawns.push({ tile: newTile });
          } else {
            const color = this.random.pick(this.availableColors);
            const newTile = board.createTile(r, c, color);
            spawns.push({ tile: newTile });
          }
        }
      }
    }

    return spawns;
  }

  /**
   * Selects a color that avoids forming 3-in-a-row matches and prioritizes isolating from immediate neighbors.
   */
  public pickInertColor(board: Board, r: number, c: number): TileColor {
    const forbidden = new Set<TileColor>();

    // Horizontal 3-in-a-row checks
    const left1 = board.get(r, c - 1);
    const left2 = board.get(r, c - 2);
    if (left1 && left2 && left1.color === left2.color) {
      forbidden.add(left1.color);
    }
    const right1 = board.get(r, c + 1);
    const right2 = board.get(r, c + 2);
    if (right1 && right2 && right1.color === right2.color) {
      forbidden.add(right1.color);
    }
    if (left1 && right1 && left1.color === right1.color) {
      forbidden.add(left1.color);
    }

    // Vertical 3-in-a-row checks
    const up1 = board.get(r - 1, c);
    const up2 = board.get(r - 2, c);
    if (up1 && up2 && up1.color === up2.color) {
      forbidden.add(up1.color);
    }
    const down1 = board.get(r + 1, c);
    const down2 = board.get(r + 2, c);
    if (down1 && down2 && down1.color === down2.color) {
      forbidden.add(down1.color);
    }
    if (up1 && down1 && up1.color === down1.color) {
      forbidden.add(up1.color);
    }

    const nonMatching = this.availableColors.filter((col) => !forbidden.has(col));

    // To prevent generating new combos during bonus overtime, prioritize colors that don't match immediate neighbors
    const neighborColors = new Set(
      [left1?.color, right1?.color, up1?.color, down1?.color].filter(
        (col): col is TileColor => col !== undefined
      )
    );
    const isolated = nonMatching.filter((col) => !neighborColors.has(col));

    if (isolated.length > 0) {
      return this.random.pick(isolated);
    }
    if (nonMatching.length > 0) {
      return this.random.pick(nonMatching);
    }
    return this.random.pick(this.availableColors);
  }
}
