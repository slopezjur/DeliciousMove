import type { Position, TileData } from '../TileTypes.ts';

export function chooseSpawnPos(
  tiles: TileData[], interactionPositions: Position[], fallback: Position
): Position {
  for (const pos of interactionPositions) {
    if (tiles.some(tile => tile.row === pos.row && tile.col === pos.col)) return { ...pos };
  }
  return fallback;
}
