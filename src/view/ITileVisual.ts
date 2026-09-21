import { TileData } from '../core/TileTypes.ts';

/** Mutable presentation state needed by animations, without a Pixi container dependency. */
export interface ITileVisual {
  tileData: TileData;
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  zIndex: number;
  rotation: number;
  scale: { x: number; y: number; set(x: number, y?: number): unknown };
  graphic: { tint: number };
  updateTexture(): void;
}
