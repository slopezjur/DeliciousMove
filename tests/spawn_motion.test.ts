import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { planSpawnMotions, CELL_FALL_TIME } from '../src/view/SpawnMotion.ts';
import { TileColor } from '../src/core/TileTypes.ts';

describe('segment-aware refills', () => {
  it('falls from above the board even when it has jelly or exits', () => {
    const board = new Board(8, 2); board.getCell(3, 0)!.jelly = 1; board.getCell(7, 0)!.exit = true;
    const spawns = new TileSpawner().refillEmptySlots(board);
    const motions = planSpawnMotions(spawns);
    expect(motions).toHaveLength(16);
    for (const motion of motions) {
      expect(motion.startRow).toBe(motion.spawn.tile.row - 8);
      expect(motion.duration).toBe(8 * CELL_FALL_TIME);
      expect(motion.delay).toBe(0);
      expect(motion.spawn.appearInPlace).toBeUndefined();
    }
  });
  it('releases internal spawns bottom-first, one tile apart, without crossing the barrier', () => {
    const board = new Board(8, 1); board.getCell(2, 0)!.playable = false;
    const motions = planSpawnMotions(new TileSpawner().refillEmptySlots(board));
    const internal = motions.filter(m => m.spawn.tile.row > 2);
    expect(internal.map(m => m.spawn.tile.row)).toEqual([7, 6, 5, 4, 3]);
    internal.forEach((motion, i) => {
      expect(motion.startRow).toBe(3);
      expect(motion.delay).toBe((i + 1) * CELL_FALL_TIME);
      expect(motion.duration).toBeCloseTo(Math.max(1, motion.spawn.tile.row - 3) * CELL_FALL_TIME);
    });
    expect(motions.filter(m => m.spawn.tile.row < 2).every(m => m.startRow < 0)).toBe(true);
  });
  it('keeps chocolate growth stationary and does not include it in waterfall spacing', () => {
    const b = new Board(3, 1), growth = b.createTile(2, 0, TileColor.Red), falling = b.createTile(0, 0, TileColor.Blue);
    const motions = planSpawnMotions([{ tile: growth, appearInPlace: true }, { tile: falling }]);
    expect(motions.find(m => m.spawn.tile.id === growth.id)?.startRow).toBe(2);
    expect(motions.find(m => m.spawn.tile.id === falling.id)?.startRow).toBe(-1);
  });
});
