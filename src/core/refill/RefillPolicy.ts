import { Board } from '../Board.ts';
import { TileColor, SpecialType } from '../TileTypes.ts';
import { IRandomSource } from '../random/IRandomSource.ts';

export interface RefillTile {
  color: TileColor;
  special?: SpecialType;
}

/** A new wave owns its counters, so shared policies cannot leak state between refills. */
export interface IRefillWave {
  nextTile(board: Board, row: number, col: number): RefillTile;
}

export interface IRefillPolicy {
  beginWave(): IRefillWave;
}

export class RandomRefillPolicy implements IRefillPolicy {
  constructor(
    private readonly availableColors: readonly TileColor[],
    private readonly random: IRandomSource
  ) {}

  public beginWave(): IRefillWave {
    return { nextTile: () => ({ color: this.random.pick(this.availableColors) }) };
  }
}

export interface BonusRefillTuning {
  maxRocksPerWave: number;
  rockChance: number;
}

export class BonusRefillPolicy implements IRefillPolicy {
  constructor(
    private readonly availableColors: readonly TileColor[],
    private readonly random: IRandomSource,
    private readonly tuning: BonusRefillTuning = { maxRocksPerWave: 2, rockChance: 0.35 }
  ) {}

  public beginWave(): IRefillWave {
    let rocksSpawned = 0;
    const rockColumns = new Set<number>();
    return {
      nextTile: (board, row, col) => {
        if (rocksSpawned < this.tuning.maxRocksPerWave && !rockColumns.has(col)
          && this.random.next() < this.tuning.rockChance) {
          rocksSpawned++;
          rockColumns.add(col);
          return { color: TileColor.Red, special: SpecialType.Rock };
        }
        return { color: this.pickInertColor(board, row, col) };
      },
    };
  }

  /**
   * Avoids line and square matches when possible, then prefers isolated colors.
   */
  private pickInertColor(board: Board, r: number, c: number): TileColor {
    const forbidden = new Set<TileColor>();
    const candyAt = (row: number, col: number) => {
      const tile = board.get(row, col);
      return tile?.special === SpecialType.Rock ? null : tile;
    };

    // Horizontal 3-in-a-row checks
    const left1 = candyAt(r, c - 1);
    const left2 = candyAt(r, c - 2);
    if (left1 && left2 && left1.color === left2.color) {
      forbidden.add(left1.color);
    }
    const right1 = candyAt(r, c + 1);
    const right2 = candyAt(r, c + 2);
    if (right1 && right2 && right1.color === right2.color) {
      forbidden.add(right1.color);
    }
    if (left1 && right1 && left1.color === right1.color) {
      forbidden.add(left1.color);
    }

    // Vertical 3-in-a-row checks
    const up1 = candyAt(r - 1, c);
    const up2 = candyAt(r - 2, c);
    if (up1 && up2 && up1.color === up2.color) {
      forbidden.add(up1.color);
    }
    const down1 = candyAt(r + 1, c);
    const down2 = candyAt(r + 2, c);
    if (down1 && down2 && down1.color === down2.color) {
      forbidden.add(down1.color);
    }
    if (up1 && down1 && up1.color === down1.color) {
      forbidden.add(up1.color);
    }

    for (const dr of [-1, 1]) {
      for (const dc of [-1, 1]) {
        const vertical = candyAt(r + dr, c);
        const horizontal = candyAt(r, c + dc);
        const diagonal = candyAt(r + dr, c + dc);
        if (vertical && horizontal && diagonal
          && vertical.color === horizontal.color && vertical.color === diagonal.color) {
          forbidden.add(vertical.color);
        }
      }
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
