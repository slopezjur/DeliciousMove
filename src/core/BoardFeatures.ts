import { SpecialType, type Position, type TileColor, type TileData } from './TileTypes.ts';

export type BlockerKind = 'frosting' | 'crate' | 'chocolate';
export type TileKind = BlockerKind | 'ingredient';
export interface CellState extends Position {
  playable: boolean;
  jelly: number;
  ice: number;
  exit: boolean;
}
export type Objective =
  | { kind: 'score'; target: number }
  | { kind: 'color'; color: TileColor; target: number }
  | { kind: 'jelly' | 'ingredient'; target: number }
  | { kind: 'blocker'; blocker: BlockerKind | 'ice'; target: number };
export type ObjectiveEvent =
  | { kind: 'color'; color: TileColor; amount: number }
  | { kind: 'jelly' | 'ingredient'; amount: number }
  | { kind: 'blocker'; blocker: BlockerKind | 'ice'; amount: number };
export interface ObjectiveProgress { objective: Objective; current: number; }
export type BoardShape = 'rectangle' | 'notched' | 'bridge' | 'islands';
export interface LevelFeatures {
  shape: BoardShape;
  jelly: Position[];
  ice: (Position & { layers: number })[];
  blockers: (Position & { kind: BlockerKind; layers: number })[];
  ingredients: Position[];
}

export function isCandy(tile: TileData): boolean { return tile.kind === undefined; }
export function isBlocker(tile: TileData): boolean { return tile.kind !== undefined && tile.kind !== 'ingredient'; }
export function isBlastTarget(tile: TileData): boolean { return tile.kind !== 'ingredient' && tile.special !== SpecialType.Rock; }

export function eventMatches(objective: Objective, event: ObjectiveEvent): boolean {
  if (objective.kind !== event.kind) return false;
  if (objective.kind === 'color' && event.kind === 'color') return objective.color === event.color;
  if (objective.kind === 'blocker' && event.kind === 'blocker') return objective.blocker === event.blocker;
  return true;
}
