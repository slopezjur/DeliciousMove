export enum TileColor {
  Red = 0,
  Blue = 1,
  Green = 2,
  Yellow = 3,
  Purple = 4,
  Orange = 5,
}

export const ALL_TILE_COLORS: readonly TileColor[] = [
  TileColor.Red,
  TileColor.Blue,
  TileColor.Green,
  TileColor.Yellow,
  TileColor.Purple,
  TileColor.Orange,
];

export enum SpecialType {
  None = 'none',
  StripedHorizontal = 'striped_h',
  StripedVertical = 'striped_v',
  Wrapped = 'wrapped',
  ColorBomb = 'color_bomb',
  Airplane = 'airplane',
  Rock = 'rock',
}

export interface Position {
  row: number;
  col: number;
}

export interface TileData {
  id: number;
  row: number;
  col: number;
  color: TileColor;
  special: SpecialType;
}

export interface MatchGroup {
  tiles: TileData[];
  color: TileColor;
  spawnSpecial?: {
    type: SpecialType;
    position: Position;
    color: TileColor;
  };
}

export interface DropMovement {
  id: number;
  fromRow: number;
  toRow: number;
  col: number;
}

export interface SpawnData {
  tile: TileData;
}

export interface SpecialEvolution {
  specialTile: TileData;
  spawnPosition?: Position;
  sourceTileIds: number[];
}

import { SpecialTriggerEffect } from './specials/ISpecialHandler.ts';

export interface CascadeStep {
  matchedTileIds: number[];
  spawnedSpecials: TileData[];
  evolutions?: SpecialEvolution[];
  triggeredSpecials?: SpecialTriggerEffect[];
  drops: DropMovement[];
  spawns: SpawnData[];
  scoreGained: number;
}

export interface SwapResult {
  valid: boolean;
  steps: CascadeStep[];
}
