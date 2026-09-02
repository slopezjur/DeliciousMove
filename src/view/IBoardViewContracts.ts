import { Board } from '../core/Board.ts';
import { Position, TileData } from '../core/TileTypes.ts';
import { TileSprite } from './TileSprite.ts';
import { VFXManager } from './VFXManager.ts';

/**
 * The pointer event surface of the display object, kept separate so a coordinate mapper
 * is not forced to expose renderer internals (ISP).
 */
export interface IPointerEventSource {
  eventMode?: any;
  on(event: string, fn: (...args: any[]) => void, context?: any): any;
  toLocal(point: { x: number; y: number }): { x: number; y: number };
}

/**
 * Coordinate mapping and selection contract required by input controllers (ISP).
 * Hides all low-level Sprite display objects from input handlers.
 */
export interface IBoardCoordinateMapper {
  readonly board: Board;
  gridToLocal(row: number, col: number): { x: number; y: number };
  localToGrid(localX: number, localY: number): Position | null;
  setTileSelected(pos: Position, selected: boolean): void;
}

/** What InputController actually needs: coordinates plus a pointer event stream. */
export type IBoardInputSurface = IBoardCoordinateMapper & IPointerEventSource;

/**
 * Animation contract required by animation sequence managers (ISP).
 */
export interface IBoardViewAnimator {
  readonly board: Board;
  readonly tileSize: number;
  readonly boardPixelWidth: number;
  readonly boardPixelHeight: number;
  readonly vfx: VFXManager;
  gridToLocal(row: number, col: number): { x: number; y: number };
  getTileSprite(id: number): TileSprite | undefined;
  addTileSprite(tile: TileData): TileSprite;
  removeTileSprite(id: number): void;
  getTileSpritesMap(): Map<number, TileSprite>;
  screenShake(intensity?: number): void;
}
