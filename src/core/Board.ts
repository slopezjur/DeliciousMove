import { TileColor, SpecialType, Position, TileData } from './TileTypes.ts';

export interface BoardSnapshot {
  rows: number;
  cols: number;
  nextId: number;
  tiles: TileData[];
}

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

  public getSnapshot(): BoardSnapshot {
    const tiles: TileData[] = [];
    this.forEachTile((tile, row, col) => tiles.push({ ...tile, row, col }));
    return { rows: this.rows, cols: this.cols, nextId: this.nextId, tiles };
  }

  /** The persistence boundary validates the snapshot before restoring it. */
  public restore(snapshot: BoardSnapshot): void {
    if (snapshot.rows !== this.rows || snapshot.cols !== this.cols) {
      throw new Error('Saved board dimensions do not match.');
    }
    this.clear();
    for (const tile of snapshot.tiles) this.set(tile.row, tile.col, { ...tile });
    this.nextId = snapshot.nextId;
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
