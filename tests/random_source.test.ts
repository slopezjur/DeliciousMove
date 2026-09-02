import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { ShuffleEngine } from '../src/core/ShuffleEngine.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { MathRandomSource, SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { ALL_TILE_COLORS, TileColor } from '../src/core/TileTypes.ts';

const colorsOf = (board: Board): TileColor[] => {
  const colors: TileColor[] = [];
  board.forEachTile((t) => colors.push(t.color));
  return colors;
};

describe('IRandomSource (DIP / deterministic core)', () => {
  it('replays an identical stream for an identical seed', () => {
    const a = new SeededRandomSource(1234);
    const b = new SeededRandomSource(1234);
    const c = new SeededRandomSource(9999);

    const drawA = Array.from({ length: 20 }, () => a.next());
    const drawB = Array.from({ length: 20 }, () => b.next());
    const drawC = Array.from({ length: 20 }, () => c.next());

    expect(drawA).toEqual(drawB);
    expect(drawA).not.toEqual(drawC);
  });

  it('keeps next() inside [0, 1) and nextInt() inside [0, max)', () => {
    const random = new SeededRandomSource(5);
    for (let i = 0; i < 500; i++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(random.nextInt(6)).toBeLessThan(6);
    }
    expect(random.nextInt(0)).toBe(0);
  });

  it('produces the same board twice for the same seed and a different one otherwise', () => {
    const build = (seed: number) => {
      const board = new Board(8, 8);
      new BoardInitializer(new SeededRandomSource(seed)).populate(board);
      return colorsOf(board);
    };

    expect(build(2026)).toEqual(build(2026));
    expect(build(2026)).not.toEqual(build(2027));
  });

  it('never generates a board that already contains a match', () => {
    const detector = new MatchDetector();
    for (let seed = 1; seed <= 25; seed++) {
      const board = new Board(8, 8);
      new BoardInitializer(new SeededRandomSource(seed)).populate(board);
      expect(detector.detectMatches(board).length).toBe(0);
    }
  });

  it('makes TileSpawner refills reproducible', () => {
    const refill = (seed: number) => {
      const board = new Board(4, 4);
      new TileSpawner(ALL_TILE_COLORS, new SeededRandomSource(seed)).refillEmptySlots(board);
      return colorsOf(board);
    };

    expect(refill(77)).toEqual(refill(77));
    expect(refill(77)).not.toEqual(refill(78));
  });

  it('makes ShuffleEngine scrambles reproducible', () => {
    const scramble = (seed: number) => {
      const board = new Board(8, 8);
      new BoardInitializer(new SeededRandomSource(1)).populate(board);
      const engine = new ShuffleEngine(new MatchDetector(), new SeededRandomSource(seed));
      const { success } = engine.shuffleBoard(board);
      expect(success).toBe(true);
      return colorsOf(board);
    };

    expect(scramble(11)).toEqual(scramble(11));
    expect(scramble(11)).not.toEqual(scramble(12));
  });

  it('exposes MathRandomSource as the production default', () => {
    const random = new MathRandomSource();
    expect(random.next()).toBeGreaterThanOrEqual(0);
    expect(random.next()).toBeLessThan(1);
    expect(ALL_TILE_COLORS).toContain(random.pick(ALL_TILE_COLORS));
  });
});
