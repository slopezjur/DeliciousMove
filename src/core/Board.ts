import { TileColor, SpecialType, Position, TileData } from './TileTypes.ts';
import { CellState, isBlocker, isCandy } from './BoardFeatures.ts';

export interface BoardSnapshot {
  rows: number;
  cols: number;
  nextId: number;
  tiles: TileData[];
  cells?: CellState[];
}

export class Board {
  public readonly rows: number;
  public readonly cols: number;
  private grid: (TileData | null)[][];
  private nextId: number = 1;
  private cells: CellState[][];

  constructor(rows = 8, cols = 8) {
    this.rows = rows;
    this.cols = cols;
    this.grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
    this.cells = this.defaultCells();
  }

  private defaultCells(): CellState[][] {
    return Array.from({ length: this.rows }, (_, row) => Array.from({ length: this.cols }, (_, col) =>
      ({ row, col, playable: true, jelly: 0, ice: 0, exit: false })));
  }

  public resetTerrain(): void { this.clear(); this.cells = this.defaultCells(); }
  public getCell(row: number, col: number): CellState | undefined { return this.cells[row]?.[col]; }
  public getCells(): CellState[] { return this.cells.flat().map(cell => ({ ...cell })); }
  public hasTerrain(): boolean {
    return this.cells.some(row => row.some(cell => !cell.playable || cell.jelly > 0 || cell.ice > 0 || cell.exit));
  }
  public canSwap(pos: Position): boolean {
    const tile = this.get(pos.row, pos.col);
    return !!tile && !isBlocker(tile) && tile.special !== SpecialType.Rock && this.cells[pos.row][pos.col].ice === 0;
  }
  public canActivate(pos: Position): boolean {
    const tile = this.get(pos.row, pos.col);
    return this.canSwap(pos) && !!tile && isCandy(tile) && tile.special !== SpecialType.None;
  }
  public canMatch(tile: TileData): boolean {
    return isCandy(tile) && tile.special !== SpecialType.Rock && this.cells[tile.row][tile.col].ice === 0;
  }
  public isGravityBarrier(row: number, col: number): boolean {
    const cell = this.getCell(row, col), tile = this.get(row, col);
    return !cell?.playable || cell.ice > 0 || (!!tile && isBlocker(tile));
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
    return this.cells[row]?.[col]?.playable === true;
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
    return { rows: this.rows, cols: this.cols, nextId: this.nextId, tiles,
      ...(this.hasTerrain() ? { cells: this.getCells() } : {}) };
  }

  /** The persistence boundary validates the snapshot before restoring it. */
  public restore(snapshot: BoardSnapshot): void {
    if (snapshot.rows !== this.rows || snapshot.cols !== this.cols) {
      throw new Error('Saved board dimensions do not match.');
    }
    this.resetTerrain();
    for (const cell of snapshot.cells ?? []) this.cells[cell.row][cell.col] = { ...cell };
    for (const tile of snapshot.tiles) this.set(tile.row, tile.col, { ...tile });
    this.nextId = snapshot.nextId;
  }

  public clone(): Board {
    const cloned = new Board(this.rows, this.cols);
    cloned.cells = this.cells.map(row => row.map(cell => ({ ...cell })));
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
