import { Container, Sprite, Graphics } from 'pixi.js';
import { TileData } from '../core/TileTypes.ts';
import { AssetFactory } from './AssetFactory.ts';

export class TileSprite extends Container {
  public tileData: TileData;
  public readonly sprite: Sprite;
  private selectionBorder: Graphics;
  public tileSize: number;

  constructor(tileData: TileData, tileSize: number) {
    super();
    this.tileData = tileData;
    this.tileSize = tileSize;

    // Candy sprite
    this.sprite = new Sprite(AssetFactory.getCandyTexture(tileData.color, tileData.special));
    this.sprite.anchor.set(0.5);
    this.sprite.width = tileSize * 0.88;
    this.sprite.height = tileSize * 0.88;
    this.addChild(this.sprite);

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
    this.sprite.texture = AssetFactory.getCandyTexture(this.tileData.color, this.tileData.special);
  }

  public setSelected(selected: boolean): void {
    this.selectionBorder.visible = selected;
  }

  public resize(newTileSize: number): void {
    this.tileSize = newTileSize;
    this.sprite.width = newTileSize * 0.88;
    this.sprite.height = newTileSize * 0.88;
    this.drawSelectionBorder();
  }
}
