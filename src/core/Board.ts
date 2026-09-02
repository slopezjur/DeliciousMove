import { TileColor, SpecialType, Position, TileData, ALL_TILE_COLORS } from './TileTypes.ts';

export class Board {
  public readonly rows: number;
  public readonly cols: number;
  private grid: (TileData | null)[][];
  private nextId: number = 1;

  constructor(rows = 8, cols = 8) {
    this.rows = rows;
    this.cols = cols;
    this.grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  }

  public getNextId(): number {
    return this.nextId++;
  }

  public get(row: number, col: number): TileData | null {
    if (!this.isValidPosition(row, col)) return null;
    return this.grid[row][col];
  }

  public set(row: number, col: number, tile: TileData | null): void {
    if (!this.isValidPosition(row, col)) return;
    this.grid[row][col] = tile;
    if (tile) {
      tile.row = row;
      tile.col = col;
    }
  }

  public isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  public isAdjacent(a: Position, b: Position): boolean {
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }

  public swap(a: Position, b: Position): void {
    const tileA = this.get(a.row, a.col);
    const tileB = this.get(b.row, b.col);
    this.set(a.row, a.col, tileB);
    this.set(b.row, b.col, tileA);
  }

  public createTile(row: number, col: number, color: TileColor, special: SpecialType = SpecialType.None): TileData {
    const tile: TileData = {
      id: this.getNextId(),
      row,
      col,
      color,
      special,
    };
    this.set(row, col, tile);
    return tile;
  }

  public populateInitial(seedColors?: TileColor[][]): void {
    if (seedColors) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.createTile(r, c, seedColors[r][c]);
        }
      }
      return;
    }

    // Generate without initial 3-matches
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const excludedColors = new Set<TileColor>();

        // Check horizontal 2-in-a-row to the left
        if (c >= 2) {
          const left1 = this.get(r, c - 1);
          const left2 = this.get(r, c - 2);
          if (left1 && left2 && left1.color === left2.color) {
            excludedColors.add(left1.color);
          }
        }

        // Check vertical 2-in-a-row above
        if (r >= 2) {
          const up1 = this.get(r - 1, c);
          const up2 = this.get(r - 2, c);
          if (up1 && up2 && up1.color === up2.color) {
            excludedColors.add(up1.color);
          }
        }

        const available = ALL_TILE_COLORS.filter((color) => !excludedColors.has(color));
        const chosenColor = available[Math.floor(Math.random() * available.length)];
        this.createTile(r, c, chosenColor);
      }
    }
  }

  public clone(): Board {
    const cloned = new Board(this.rows, this.cols);
    cloned.nextId = this.nextId;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.get(r, c);
        if (t) {
          cloned.grid[r][c] = { ...t };
        }
      }
    }
    return cloned;
  }

  public clear(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = null;
      }
    }
  }

  public forEachTile(cb: (tile: TileData, row: number, col: number) => void): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.grid[r][c];
        if (tile) cb(tile, r, c);
      }
    }
  }
}
