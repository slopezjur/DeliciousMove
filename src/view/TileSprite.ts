import { Container, Graphics } from 'pixi.js';
import { TileData } from '../core/TileTypes.ts';
import { FeatureAssets } from './FeatureAssets.ts';

export class TileSprite extends Container {
  public tileData: TileData;
  public readonly graphic: Graphics;
  private selectionBorder: Graphics;
  public tileSize: number;

  constructor(tileData: TileData, tileSize: number) {
    super();
    this.tileData = { ...tileData };
    this.tileSize = tileSize;

    // Candy vector graphic using shared GraphicsContext
    this.graphic = new Graphics(FeatureAssets.forTile(tileData));
    const scale = (tileSize * 0.88) / 88;
    this.graphic.scale.set(scale);
    this.addChild(this.graphic);

    // Selection border / glow
    this.selectionBorder = new Graphics();
    this.drawSelectionBorder();
    this.selectionBorder.visible = false;
    this.addChild(this.selectionBorder);
  }

  private drawSelectionBorder(): void {
    this.selectionBorder.clear();
    this.selectionBorder.roundRect(
      -this.tileSize * 0.46,
      -this.tileSize * 0.46,
      this.tileSize * 0.92,
      this.tileSize * 0.92,
      14
    );
    this.selectionBorder.stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
  }

  public updateTexture(): void {
    this.graphic.context = FeatureAssets.forTile(this.tileData);
  }

  public setSelected(selected: boolean): void {
    this.selectionBorder.visible = selected;
  }

  public resize(newTileSize: number): void {
    this.tileSize = newTileSize;
    const scale = (newTileSize * 0.88) / 88;
    this.graphic.scale.set(scale);
    this.drawSelectionBorder();
  }
}
