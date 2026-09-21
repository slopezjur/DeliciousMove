import { SpawnData } from '../core/TileTypes.ts';

export const CELL_FALL_TIME = 0.08;
export interface SpawnMotion { spawn: SpawnData; startRow: number; delay: number; duration: number }

/** Release bottom-first at one-cell intervals, without crossing internal barriers. */
export function planSpawnMotions(spawns: SpawnData[]): SpawnMotion[] {
  const groups = new Map<string, SpawnData[]>();
  for (const spawn of spawns) {
    const key = `${spawn.tile.col}:${spawn.segmentTop ?? 0}:${!!spawn.appearInPlace}`;
    const group = groups.get(key) ?? [];
    group.push(spawn);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(group => {
    group.sort((a, b) => b.tile.row - a.tile.row);
    return group.map((spawn, index) => {
      const internal = (spawn.segmentTop ?? 0) > 0;
      const startRow = spawn.appearInPlace ? spawn.tile.row : internal ? spawn.segmentTop! : spawn.tile.row - group.length;
      return { spawn, startRow, delay: internal && !spawn.appearInPlace ? (index + 1) * CELL_FALL_TIME : 0,
        duration: Math.max(0.08, (spawn.tile.row - startRow) * CELL_FALL_TIME) };
    });
  });
}
