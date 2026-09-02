import { Container, Sprite } from 'pixi.js';
import { Board } from '../core/Board.ts';
import { Position, TileData } from '../core/TileTypes.ts';
import { TileSprite } from './TileSprite.ts';
import { AssetFactory } from './AssetFactory.ts';
import { VFXManager } from './VFXManager.ts';

export class BoardView extends Container {
  public readonly board: Board;
  private bgContainer: Container;
  private tilesContainer: Container;
  public readonly vfxContainer: Container;
  public readonly vfx: VFXManager;

  public tileSize: number = 64;
  public boardPixelWidth: number = 0;
  public boardPixelHeight: number = 0;

  private tileSprites: Map<number, TileSprite> = new Map();
  private cellSprites: Sprite[][] = [];

  constructor(board: Board) {
    super();
    this.board = board;

    this.bgContainer = new Container();
    this.tilesContainer = new Container();
    this.vfxContainer = new Container();

    this.addChild(this.bgContainer);
    this.addChild(this.tilesContainer);
    this.addChild(this.vfxContainer);

    this.vfx = new VFXManager(this.vfxContainer);

    this.createGridBackground();
  }

  private createGridBackground(): void {
    this.bgContainer.removeChildren();
    this.cellSprites = [];

    for (let r = 0; r < this.board.rows; r++) {
      const row: Sprite[] = [];
      for (let c = 0; c < this.board.cols; c++) {
        const isAlt = (r + c) % 2 === 1;
        const cell = new Sprite(AssetFactory.getCellBgTexture(isAlt));
        cell.anchor.set(0.5);
        this.bgContainer.addChild(cell);
        row.push(cell);
      }
      this.cellSprites.push(row);
    }
  }

  public updateLayout(availableWidth: number, availableHeight: number): void {
    // Determine maximum square size that fits with margin
    const margin = 20;
    const maxW = availableWidth - margin * 2;
    const maxH = availableHeight - margin * 2;
    const targetSize = Math.min(maxW, maxH);

    this.tileSize = Math.floor(targetSize / Math.max(this.board.rows, this.board.cols));
    this.boardPixelWidth = this.tileSize * this.board.cols;
    this.boardPixelHeight = this.tileSize * this.board.rows;

    // Center board in viewport
    this.x = Math.floor((availableWidth - this.boardPixelWidth) / 2);
    this.y = Math.floor((availableHeight - this.boardPixelHeight) / 2);

    // Update background cells
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const cell = this.cellSprites[r][c];
        const pos = this.gridToLocal(r, c);
        cell.x = pos.x;
        cell.y = pos.y;
        cell.width = this.tileSize;
        cell.height = this.tileSize;
      }
    }

    // Update existing tile sprites
    this.tileSprites.forEach((sprite) => {
      sprite.resize(this.tileSize);
      const pos = this.gridToLocal(sprite.tileData.row, sprite.tileData.col);
      sprite.x = pos.x;
      sprite.y = pos.y;
    });
  }

  public gridToLocal(row: number, col: number): { x: number; y: number } {
    return {
      x: col * this.tileSize + this.tileSize / 2,
      y: row * this.tileSize + this.tileSize / 2,
    };
  }

  public localToGrid(localX: number, localY: number): Position | null {
    const col = Math.floor(localX / this.tileSize);
    const row = Math.floor(localY / this.tileSize);
    if (this.board.isValidPosition(row, col)) {
      return { row, col };
    }
    return null;
  }

  public initFromBoard(): void {
    this.tileSprites.forEach((s) => {
      this.tilesContainer.removeChild(s);
      s.destroy();
    });
    this.tileSprites.clear();

    this.board.forEachTile((tile, r, c) => {
      const sprite = new TileSprite(tile, this.tileSize);
      const pos = this.gridToLocal(r, c);
      sprite.x = pos.x;
      sprite.y = pos.y;
      this.tilesContainer.addChild(sprite);
      this.tileSprites.set(tile.id, sprite);
    });
  }

  public getTileSprite(id: number): TileSprite | undefined {
    return this.tileSprites.get(id);
  }

  public addTileSprite(tile: TileData): TileSprite {
    const sprite = new TileSprite(tile, this.tileSize);
    this.tilesContainer.addChild(sprite);
    this.tileSprites.set(tile.id, sprite);
    return sprite;
  }

  public removeTileSprite(id: number): void {
    const sprite = this.tileSprites.get(id);
    if (sprite) {
      this.tilesContainer.removeChild(sprite);
      this.tileSprites.delete(id);
      sprite.destroy();
    }
  }

  public getTileSpritesMap(): Map<number, TileSprite> {
    return this.tileSprites;
  }
}
