import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { Board } from '../core/Board.ts';
import { Position, TileData, SpecialType } from '../core/TileTypes.ts';
import { TileSprite } from './TileSprite.ts';
import { AssetFactory } from './AssetFactory.ts';
import { VFXManager, IVFXManager } from './VFXManager.ts';
import { IBoardView } from './IBoardViewContracts.ts';

export class BoardView extends Container implements IBoardView {
  public readonly board: Board;
  private bgContainer: Container;
  private tilesContainer: Container;
  public readonly vfxContainer: Container;
  public readonly vfx: IVFXManager;

  public tileSize: number = 64;
  public boardPixelWidth: number = 0;
  public boardPixelHeight: number = 0;

  private tileSprites: Map<number, TileSprite> = new Map();
  private cellSprites: Graphics[][] = [];
  private frameGraphics: Graphics;
  private tilesMask: Graphics;

  constructor(board: Board) {
    super();
    this.board = board;

    this.frameGraphics = new Graphics();
    this.bgContainer = new Container();
    this.tilesContainer = new Container();
    this.tilesContainer.sortableChildren = true;
    this.vfxContainer = new Container();
    this.tilesMask = new Graphics();

    this.addChild(this.frameGraphics);
    this.addChild(this.bgContainer);
    this.addChild(this.tilesContainer);
    this.addChild(this.tilesMask);
    this.addChild(this.vfxContainer);

    this.tilesContainer.mask = this.tilesMask;

    this.vfx = new VFXManager(this.vfxContainer);

    this.createGridBackground();
  }

  private createGridBackground(): void {
    this.bgContainer.removeChildren();
    this.cellSprites = [];

    for (let r = 0; r < this.board.rows; r++) {
      const row: Graphics[] = [];
      for (let c = 0; c < this.board.cols; c++) {
        const isAlt = (r + c) % 2 === 1;
        const cell = new Graphics(AssetFactory.getCellBgContext(isAlt));
        cell.scale.set(this.tileSize / 96);
        this.bgContainer.addChild(cell);
        row.push(cell);
      }
      this.cellSprites.push(row);
    }
  }

  /**
   * @param offsetY Pixels reserved above the board (e.g. the HUD), so the board is
   *                centred once inside the remaining area rather than shifted afterwards.
   */
  public updateLayout(availableWidth: number, availableHeight: number, offsetY: number = 0): void {
    const isMobile = availableWidth <= 560;
    const margin = isMobile ? 12 : 24;
    const framePadding = isMobile ? 10 : 16;

    const safeW = availableWidth;
    const safeH = availableHeight;

    // Available space for inner grid
    const maxGridW = safeW - (margin + framePadding) * 2;
    const maxGridH = safeH - (margin + framePadding) * 2;
    const maxTarget = Math.max(180, Math.min(maxGridW, maxGridH));

    // Clamp desktop tile size to avoid disproportionate stretching on ultra-wide screens
    const maxDesktopTile = 84;
    const computedTile = Math.floor(maxTarget / Math.max(this.board.rows, this.board.cols));
    this.tileSize = Math.max(28, Math.min(maxDesktopTile, computedTile));

    this.boardPixelWidth = this.tileSize * this.board.cols;
    this.boardPixelHeight = this.tileSize * this.board.rows;

    // Dead-center the board horizontally and vertically in available space
    this.x = Math.floor((safeW - this.boardPixelWidth) / 2);
    this.y = offsetY + Math.floor((safeH - this.boardPixelHeight) / 2);

    // Clip tiles to board boundaries so offscreen spawns never peek outside
    this.tilesMask.clear();
    this.tilesMask.rect(0, 0, this.boardPixelWidth, this.boardPixelHeight);
    this.tilesMask.fill({ color: 0xffffff });

    // Draw ornate game frame behind cells
    this.drawFancyFrame(framePadding);

    // Update background cells
    for (let r = 0; r < this.board.rows; r++) {
      for (let c = 0; c < this.board.cols; c++) {
        const cell = this.cellSprites[r][c];
        const pos = this.gridToLocal(r, c);
        cell.x = pos.x;
        cell.y = pos.y;
        cell.scale.set(this.tileSize / 96);
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

  private drawFancyFrame(padding: number): void {
    this.frameGraphics.clear();

    const w = this.boardPixelWidth;
    const h = this.boardPixelHeight;

    // 1. Soft Outer Drop Shadow
    this.frameGraphics.roundRect(-padding - 6, -padding - 2, w + (padding + 6) * 2, h + (padding + 6) * 2, 24);
    this.frameGraphics.fill({ color: 0x000000, alpha: 0.45 });

    // 2. Outer Bevel Frame (Deep Royal Mahogany / Purple-Gold)
    this.frameGraphics.roundRect(-padding, -padding, w + padding * 2, h + padding * 2, 20);
    this.frameGraphics.fill({ color: 0x240f3b, alpha: 0.96 });
    this.frameGraphics.stroke({ color: 0xffd700, width: 3, alpha: 0.75 });

    // 3. Inner Highlight Trim
    this.frameGraphics.roundRect(-padding + 3, -padding + 3, w + (padding - 3) * 2, h + (padding - 3) * 2, 16);
    this.frameGraphics.stroke({ color: 0xffe57f, width: 1, alpha: 0.25 });

    // 4. Recessed Velvet Tile Bed (Playfield background behind cells)
    this.frameGraphics.roundRect(-2, -2, w + 4, h + 4, 10);
    this.frameGraphics.fill({ color: 0x120622, alpha: 0.98 });
    this.frameGraphics.stroke({ color: 0x080210, width: 2, alpha: 0.9 });

    // 5. Four Ornate Golden Corner Rivets / Gems
    const cornerOffsets = [
      { x: -padding + 7, y: -padding + 7 },
      { x: w + padding - 7, y: -padding + 7 },
      { x: -padding + 7, y: h + padding - 7 },
      { x: w + padding - 7, y: h + padding - 7 },
    ];

    for (const pt of cornerOffsets) {
      this.frameGraphics.circle(pt.x, pt.y, 5);
      this.frameGraphics.fill({ color: 0xffd700 });
      this.frameGraphics.stroke({ color: 0x5d4037, width: 1.5 });
      this.frameGraphics.circle(pt.x - 1, pt.y - 1, 1.5);
      this.frameGraphics.fill({ color: 0xffffff, alpha: 0.9 });
    }
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
      sprite.zIndex = r;
      this.tilesContainer.addChild(sprite);
      this.tileSprites.set(tile.id, sprite);
    });
  }

  public getTileSprite(id: number): TileSprite | undefined {
    return this.tileSprites.get(id);
  }

  public addTileSprite(tile: TileData): TileSprite {
    const existing = this.tileSprites.get(tile.id);
    if (existing) {
      this.tilesContainer.removeChild(existing);
      this.tileSprites.delete(tile.id);
      existing.destroy();
    }
    const sprite = new TileSprite(tile, this.tileSize);
    sprite.zIndex = tile.row;
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

  public screenShake(intensity: number = 12): void {
    this.vfx.screenShake(this, intensity);
  }

  public setTileSelected(pos: Position, selected: boolean): void {
    const tile = this.board.get(pos.row, pos.col);
    if (tile) {
      const sprite = this.tileSprites.get(tile.id);
      sprite?.setSelected(selected);
    }
  }

  public isSpecialTile(pos: Position): boolean {
    const tile = this.board.get(pos.row, pos.col);
    return tile !== null && tile.special !== SpecialType.None && tile.special !== SpecialType.Rock;
  }

  public isRock(pos: Position): boolean {
    const tile = this.board.get(pos.row, pos.col);
    return tile !== null && tile.special === SpecialType.Rock;
  }

  public isValidPosition(pos: Position): boolean {
    return this.board.isValidPosition(pos.row, pos.col);
  }

  public isAdjacent(posA: Position, posB: Position): boolean {
    return this.board.isAdjacent(posA, posB);
  }

  public syncSpritesWithBoard(): void {
    const activeIds = new Set<number>();
    this.board.forEachTile((tile, r, c) => {
      activeIds.add(tile.id);
      const sprite = this.tileSprites.get(tile.id);
      const expected = this.gridToLocal(r, c);
      if (sprite) {
        gsap.killTweensOf(sprite);
        gsap.killTweensOf(sprite.scale);
        sprite.x = expected.x;
        sprite.y = expected.y;
        sprite.scale.set(1, 1);
        sprite.alpha = 1;
        sprite.visible = true;
        sprite.zIndex = r;
        sprite.tileData = tile;
        sprite.updateTexture();
      } else {
        const newSprite = this.addTileSprite(tile);
        newSprite.x = expected.x;
        newSprite.y = expected.y;
        newSprite.zIndex = r;
      }
    });

    const staleIds: number[] = [];
    this.tileSprites.forEach((_, id) => {
      if (!activeIds.has(id)) staleIds.push(id);
    });
    staleIds.forEach((id) => this.removeTileSprite(id));
  }
}
