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
  sourceTileIds: number[];
}

export interface CascadeStep {
  matchedTileIds: number[];
  spawnedSpecials: TileData[];
  evolutions?: SpecialEvolution[];
  triggeredSpecials?: {
    sourceTile: TileData;
    affectedTileIds: number[];
    effectType: SpecialType | 'combo_cross' | 'combo_color_bomb_striped' | 'combo_double_color_bomb' | 'combo_giant_cross' | 'combo_giant_wrapped';
  }[];
  drops: DropMovement[];
  spawns: SpawnData[];
  scoreGained: number;
}

export interface SwapResult {
  valid: boolean;
  steps: CascadeStep[];
}
