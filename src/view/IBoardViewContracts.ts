import { FederatedPointerEvent, ContainerChild } from 'pixi.js';
import { Board } from '../core/Board.ts';
import { Position, TileData } from '../core/TileTypes.ts';
import { TileSprite } from './TileSprite.ts';
import { IVFXManager } from './VFXManager.ts';

export type PointerEventHandler = (event: FederatedPointerEvent) => void;

/**
 * The pointer event surface of the display object, kept separate so a coordinate mapper
 * is not forced to expose renderer internals (ISP).
 */
export interface IPointerEventSource {
  eventMode?: 'none' | 'passive' | 'auto' | 'static' | 'dynamic';
  on(event: string, fn: PointerEventHandler, context?: unknown): unknown;
  toLocal(point: { x: number; y: number }): { x: number; y: number };
}

/**
 * Coordinate mapping and selection contract required by input controllers (ISP).
 * Encapsulates spatial querying so input handlers never inspect internal board models directly (LoD).
 */
export interface IBoardCoordinateMapper {
  gridToLocal(row: number, col: number): { x: number; y: number };
  localToGrid(localX: number, localY: number): Position | null;
  setTileSelected(pos: Position, selected: boolean): void;
  isSpecialTile(pos: Position): boolean;
  isRock(pos: Position): boolean;
  isValidPosition(pos: Position): boolean;
  isAdjacent(posA: Position, posB: Position): boolean;
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
  readonly vfx: IVFXManager;
  gridToLocal(row: number, col: number): { x: number; y: number };
  getTileSprite(id: number): TileSprite | undefined;
  addTileSprite(tile: TileData): TileSprite;
  removeTileSprite(id: number): void;
  getTileSpritesMap(): Map<number, TileSprite>;
  screenShake(intensity?: number): void;
  syncSpritesWithBoard(): void;
}

/**
 * Full board presentation abstraction (DIP).
 * Allows composition roots and managers to depend on view contracts rather than Pixi concrete classes.
 */
export interface IBoardView extends IBoardInputSurface, IBoardViewAnimator {
  readonly displayObject: ContainerChild;
  initFromBoard(): void;
  updateLayout(availableWidth: number, availableHeight: number, offsetY?: number): void;
}
