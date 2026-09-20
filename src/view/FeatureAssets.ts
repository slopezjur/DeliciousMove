import { GraphicsContext } from 'pixi.js';
import { TileData } from '../core/TileTypes.ts';
import { AssetFactory } from './AssetFactory.ts';

/** Shared vector assets remain crisp at phone and desktop tile sizes. */
export class FeatureAssets {
  private static cache = new Map<string, GraphicsContext>();
  static forTile(tile: TileData): GraphicsContext {
    if (!tile.kind) return AssetFactory.getCandyContext(tile.color, tile.special);
    const key = `${tile.kind}:${tile.layers ?? 1}`;
    const existing = this.cache.get(key);
    if (existing) return existing;
    const g = new GraphicsContext();
    if (tile.kind === 'ingredient') {
      g.moveTo(-17, 5).quadraticCurveTo(-12, -29, 9, -35).stroke({ color: 0x8add59, width: 5 });
      g.moveTo(18, 12).quadraticCurveTo(23, -22, 9, -35).stroke({ color: 0x8add59, width: 5 });
      g.ellipse(21, -31, 13, 6).fill(0x53bb43);
      g.circle(-17, 12, 19).fill(0xd90048).stroke({ color: 0x79092d, width: 3 });
      g.circle(19, 20, 19).fill(0xf52658).stroke({ color: 0x79092d, width: 3 });
      g.ellipse(-22, 5, 6, 4).fill(0xffb0cc);
      g.ellipse(14, 13, 6, 4).fill(0xffb0cc);
    } else if (tile.kind === 'crate') {
      g.roundRect(-38, -38, 76, 76, 8).fill(0x985221).stroke({ color: 0xefbe72, width: 5 });
      for (const y of [-20, 0, 20]) g.moveTo(-34, y).lineTo(34, y).stroke({ color: 0x522a16, width: 3 });
      g.moveTo(-29, -29).lineTo(29, 29).moveTo(29, -29).lineTo(-29, 29).stroke({ color: 0xdb9b52, width: 9 });
    } else if (tile.kind === 'frosting') {
      g.roundRect(-38, -35, 76, 73, 12).fill(0xdf79ae).stroke({ color: 0xffd9ef, width: 4 });
      g.roundRect(-34, -29, 68, 48, 16).fill(0xfff0d9);
      for (const x of [-22, 0, 22]) g.circle(x, -22, 13).fill(0xffffff);
      g.moveTo(-23, 4).lineTo(24, 4).stroke({ color: 0xf6b6d4, width: 5 });
    } else {
      g.roundRect(-38, -38, 76, 76, 9).fill(0x3e1b12).stroke({ color: 0x9d6a42, width: 4 });
      for (const x of [-31, 3]) for (const y of [-31, 3]) {
        g.roundRect(x, y, 28, 28, 5).fill(0x794329).stroke({ color: 0xb57b4f, width: 2 });
      }
    }
    if (tile.kind === 'crate' || tile.kind === 'frosting') {
      for (let i = 0; i < (tile.layers ?? 1); i++) g.circle((i - ((tile.layers ?? 1) - 1) / 2) * 15, 26, 5).fill(0xffffff).stroke({ color: 0x5b244b, width: 2 });
    }
    this.cache.set(key, g);
    return g;
  }
}
