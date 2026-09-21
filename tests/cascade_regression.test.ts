import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { ShuffleEngine } from '../src/core/ShuffleEngine.ts';
import { ScoreCalculator } from '../src/core/ScoreCalculator.ts';
import { BoardGravitySystem } from '../src/core/BoardGravitySystem.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { SpecialRegistry, ColorBombHandler } from '../src/core/specials/SpecialRegistry.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { TileColor, SpecialType, TileData, CascadeStep } from '../src/core/TileTypes.ts';
import { AnimationQueue } from '../src/view/AnimationQueue.ts';
import { IBoardViewAnimator } from '../src/view/IBoardViewContracts.ts';

/** Resolver whose refills are seeded, so cascades are reproducible run to run. */
const makeResolver = (seed = 3) =>
  new CascadeResolver(
    new ScoreCalculator(),
    new BoardGravitySystem(),
    new TileSpawner([TileColor.Green], new SeededRandomSource(seed)),
    new MatchDetector(),
    new SpecialResolver(new SpecialRegistry(new SeededRandomSource(seed)))
  );

const fill = (board: Board, pattern: (r: number, c: number) => TileColor) => {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      board.createTile(r, c, pattern(r, c));
    }
  }
};

/** Checkerboard of two colors that can never match on its own. */
const inertFill = (board: Board) =>
  fill(board, (r, c) => ((r + c) % 2 === 0 ? TileColor.Purple : TileColor.Orange));

describe('Cascade regressions', () => {
  let board: Board;

  beforeEach(() => {
    board = new Board(8, 8);
  });

  describe('spawned specials survive their own pass (B1)', () => {
    it('does not destroy a new striped candy swept by a chained special in the same step', () => {
      inertFill(board);

      // Row 4 forms a 4-in-a-row of Red once (4,4) drops in, spawning a striped candy.
      board.get(4, 1)!.color = TileColor.Red;
      board.get(4, 2)!.color = TileColor.Red;
      board.get(4, 3)!.color = TileColor.Red;
      board.get(3, 4)!.color = TileColor.Red;

      // A horizontal striped candy sits inside that same run: when consumed it sweeps
      // row 4, the very row the new special is created in.
      board.get(4, 2)!.special = SpecialType.StripedHorizontal;

      // Drive a single pass so the assertion sees the board before later cascades.
      board.swap({ row: 3, col: 4 }, { row: 4, col: 4 });
      const step = makeResolver().processMatchPass(
        board,
        [
          { row: 3, col: 4 },
          { row: 4, col: 4 },
        ],
        1
      )!;
      expect(step).not.toBeNull();
      expect(step.spawnedSpecials.length).toBe(1);
      const spawned = step.spawnedSpecials[0];

      // The special must neither be reported destroyed nor referenced by any VFX payload.
      expect(step.matchedTileIds).not.toContain(spawned.id);
      for (const effect of step.triggeredSpecials ?? []) {
        expect(effect.affectedTileIds).not.toContain(spawned.id);
      }

      // And it must still be a live tile on the board.
      let found: TileData | null = null;
      board.forEachTile((t) => {
        if (t.id === spawned.id) found = t;
      });
      expect(found).not.toBeNull();
    });

    it('never reports a tile as both spawned and destroyed', () => {
      inertFill(board);
      board.get(2, 1)!.color = TileColor.Red;
      board.get(2, 2)!.color = TileColor.Red;
      board.get(2, 3)!.color = TileColor.Red;
      board.get(1, 4)!.color = TileColor.Red;

      const result = makeResolver().resolveSwap(board, { row: 1, col: 4 }, { row: 2, col: 4 });
      for (const step of result.steps) {
        const destroyed = new Set(step.matchedTileIds);
        for (const special of step.spawnedSpecials) {
          expect(destroyed.has(special.id)).toBe(false);
        }
      }
    });
  });

  describe('special combos resolve at the destination cell (B2)', () => {
    it('centres a striped + striped cross on the cell the player dropped into', () => {
      inertFill(board);

      const a = board.get(0, 0)!;
      const b = board.get(0, 1)!;
      a.special = SpecialType.StripedHorizontal;
      b.special = SpecialType.StripedVertical;

      // Dragging (0,0) onto (0,1) means the cross is centred on column 1.
      const result = makeResolver().resolveSwap(board, { row: 0, col: 0 }, { row: 0, col: 1 });
      expect(result.valid).toBe(true);

      const effect = result.steps[0].triggeredSpecials?.find((e) => e.effectType === 'combo_cross');
      expect(effect).toBeDefined();
      expect(effect!.sourceTile.col).toBe(1);
      expect(effect!.sourceTile.row).toBe(0);
    });

    it('leaves the board untouched when a swap is rejected', () => {
      inertFill(board);
      const before: number[] = [];
      board.forEachTile((t) => before.push(t.id));

      const result = makeResolver().resolveSwap(board, { row: 0, col: 0 }, { row: 0, col: 1 });
      expect(result.valid).toBe(false);

      const after: number[] = [];
      board.forEachTile((t) => after.push(t.id));
      expect(after).toEqual(before);
    });
  });

  describe('color bomb caught in a match clears the trigger color (B5)', () => {
    it('wipes the matched color rather than the most abundant one', () => {
      // Blue dominates the board, but a Red match swallows the bomb.
      fill(board, () => TileColor.Blue);
      for (let c = 0; c < board.cols; c++) board.get(7, c)!.color = TileColor.Green;

      board.get(3, 0)!.color = TileColor.Red;
      board.get(3, 1)!.color = TileColor.Red;
      board.get(3, 2)!.color = TileColor.Red;
      board.get(3, 2)!.special = SpecialType.ColorBomb;
      board.get(5, 5)!.color = TileColor.Red;

      const destroyed = new Set<number>();
      const effects: any[] = [];
      const bomb = board.get(3, 2)!;

      new SpecialResolver(new SpecialRegistry(new SeededRandomSource(1))).detonate(
        board,
        [{ specials: [bomb], triggerColor: TileColor.Red }],
        destroyed,
        effects
      );

      // The isolated Red tile far from the match must be destroyed; Blue must survive.
      expect(destroyed.has(board.get(5, 5)!.id)).toBe(true);
      expect(destroyed.has(board.get(0, 0)!.id)).toBe(false);
    });

    it('falls back to the most abundant color for an untriggered blast', () => {
      fill(board, () => TileColor.Blue);
      board.get(0, 0)!.color = TileColor.Red;
      const bomb = board.get(4, 4)!;
      bomb.special = SpecialType.ColorBomb;

      const destroyed = new Set<number>();
      const effect = new ColorBombHandler().execute({
        board,
        sourceTile: bomb,
        destroyedTileIds: destroyed,
        triggerQueue: [],
      });

      expect(effect.affectedTileIds.length).toBe(board.rows * board.cols - 1);
      expect(destroyed.has(board.get(0, 0)!.id)).toBe(false);
    });
  });

  describe('a match never silently swallows an existing special (B8)', () => {
    it('evolves a plain tile so the special already in the run still detonates', () => {
      inertFill(board);

      board.get(6, 1)!.color = TileColor.Red;
      board.get(6, 2)!.color = TileColor.Red;
      board.get(6, 3)!.color = TileColor.Red;
      board.get(5, 4)!.color = TileColor.Red;

      // The interaction cell itself already carries a wrapped candy.
      const existing = board.get(5, 4)!;
      existing.special = SpecialType.Wrapped;
      const existingId = existing.id;

      const result = makeResolver().resolveSwap(board, { row: 5, col: 4 }, { row: 6, col: 4 });
      expect(result.valid).toBe(true);

      const step = result.steps[0];
      // The new special landed on a different, plain tile...
      expect(step.spawnedSpecials.length).toBe(1);
      expect(step.spawnedSpecials[0].id).not.toBe(existingId);
      // ...and the pre-existing wrapped candy actually went off.
      const wrappedBlast = step.triggeredSpecials?.find(
        (e) => e.effectType === SpecialType.Wrapped && e.sourceTile.id === existingId
      );
      expect(wrappedBlast).toBeDefined();
    });
  });

  describe('shuffle reports solvability (B4)', () => {
    it('reports failure instead of returning a deadlocked board', () => {
      // A single-color board can never be scrambled into a solvable state.
      fill(board, () => TileColor.Blue);
      // Remove all matches by shrinking to a board that cannot produce a move.
      const flat = new Board(1, 2);
      flat.createTile(0, 0, TileColor.Blue);
      flat.createTile(0, 1, TileColor.Red);

      const engine = new ShuffleEngine(new MatchDetector(), new SeededRandomSource(4), 10);
      const { success } = engine.shuffleBoard(flat);

      expect(success).toBe(false);
      expect(engine.hasPossibleMoves(flat)).toBe(false);
    });

    it('reports success and a full position mapping for a solvable board', () => {
      // A full 6-color board is scrambleable into a match-free, solvable arrangement.
      new BoardInitializer(new SeededRandomSource(21)).populate(board);

      const engine = new ShuffleEngine(new MatchDetector(), new SeededRandomSource(8));
      const { success, mapping } = engine.shuffleBoard(board);

      expect(success).toBe(true);
      expect(mapping.size).toBe(board.rows * board.cols);
      expect(engine.hasPossibleMoves(board)).toBe(true);
    });
  });

  describe('cascade termination', () => {
    it('terminates on a board that refills into endless matches', () => {
      inertFill(board);
      board.get(0, 1)!.color = TileColor.Red;
      board.get(0, 2)!.color = TileColor.Red;
      board.get(1, 3)!.color = TileColor.Red;
      board.get(0, 3)!.color = TileColor.Blue;

      // Every refilled tile is Green, so cascades keep firing until the guard stops them.
      const result = makeResolver().resolveSwap(board, { row: 0, col: 3 }, { row: 1, col: 3 });
      expect(result.valid).toBe(true);
      expect(result.steps.length).toBeLessThanOrEqual(26);
      expect(result.steps.every((s) => s.scoreGained > 0)).toBe(true);
    });

    it('preserves pre-gravity spawnPosition for special evolutions', () => {
      inertFill(board);
      board.get(2, 0)!.color = TileColor.Red;
      board.get(2, 1)!.color = TileColor.Red;
      board.get(2, 2)!.color = TileColor.Red;
      board.get(1, 3)!.color = TileColor.Red;
      board.get(2, 3)!.color = TileColor.Blue;

      // Swap (1, 3) and (2, 3) to form a horizontal 4-in-a-row at row 2
      const result = makeResolver().resolveSwap(board, { row: 1, col: 3 }, { row: 2, col: 3 });
      expect(result.valid).toBe(true);
      const step1 = result.steps[0];
      expect(step1.evolutions).toBeDefined();
      expect(step1.evolutions!.length).toBe(1);
      const evo = step1.evolutions![0];
      expect(evo.spawnPosition).toBeDefined();
      expect(evo.spawnPosition!.row).toBe(2);
    });

    it('ensures constant fall velocity maintains monotonic spatial separation in multi-hole columns', () => {
      inertFill(board);
      // Create holes at row 3 and row 6 in col 7
      board.set(3, 7, null);
      board.set(6, 7, null);

      const drops = new BoardGravitySystem().applyGravity(board);
      expect(drops.length).toBeGreaterThan(0);

      // Verify for every pair of dropping tiles in the column, the lower tile has a final row > upper tile
      const colDrops = drops.filter((d) => d.col === 7);
      for (let i = 0; i < colDrops.length; i++) {
        for (let j = i + 1; j < colDrops.length; j++) {
          const a = colDrops[i];
          const b = colDrops[j];
          if (a.fromRow > b.fromRow) {
            expect(a.toRow).toBeGreaterThan(b.toRow);
          } else if (a.fromRow < b.fromRow) {
            expect(a.toRow).toBeLessThan(b.toRow);
          }
        }
      }
    });

    it('performs full syncSpritesWithBoard reconciliation once upon cascade completion to avoid premature state leakage', async () => {
      const syncMock = vi.fn();
      const removeMock = vi.fn();
      const fakeBoardView: IBoardViewAnimator = {
        tileSize: 64,
        boardPixelWidth: 512,
        boardPixelHeight: 512,
        vfx: { createFloatingText: vi.fn(), screenShake: vi.fn(), createParticleBurst: vi.fn() } as any,
        gridToLocal: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        getTileSprite: vi.fn().mockReturnValue(undefined),
        addTileSprite: vi.fn().mockReturnValue({ x: 0, y: 0, scale: { set: vi.fn() } } as any),
        removeTileSprite: removeMock,
        getTileSpritesMap: vi.fn().mockReturnValue(new Map()),
        screenShake: vi.fn(),
        syncSpritesWithBoard: syncMock,
      };

      const queue = new AnimationQueue(fakeBoardView);
      const dummyStep: CascadeStep = {
        matchedTileIds: [99],
        spawnedSpecials: [],
        drops: [],
        spawns: [],
        scoreGained: 100,
      };

      // 3-step cascade
      await queue.playCascadeSteps([dummyStep, { ...dummyStep, scoreGained: 200 }, { ...dummyStep, scoreGained: 300 }], () => {});

      // Intermediate steps must remove matched tiles directly without leaking future board state
      expect(removeMock).toHaveBeenCalledWith(99);
      // Final reconciliation against domain board must execute exactly once when all cascades finish
      expect(syncMock).toHaveBeenCalledTimes(1);
    });
  });
});
