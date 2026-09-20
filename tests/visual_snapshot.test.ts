import { describe, it, expect, vi } from 'vitest';
import gsap from 'gsap';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { ScoreCalculator } from '../src/core/ScoreCalculator.ts';
import { BoardGravitySystem } from '../src/core/BoardGravitySystem.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { SpecialRegistry } from '../src/core/specials/SpecialRegistry.ts';
import { ShuffleEngine } from '../src/core/ShuffleEngine.ts';
import { ALL_TILE_COLORS } from '../src/core/TileTypes.ts';
import { BoardView } from '../src/view/BoardView.ts';
import { AnimationQueue } from '../src/view/AnimationQueue.ts';

function setup(seed = 20) {
  const board = new Board(), random = new SeededRandomSource(seed);
  new BoardInitializer(random).populate(board);
  const detector = new MatchDetector();
  const resolver = new CascadeResolver(new ScoreCalculator(), new BoardGravitySystem(),
    new TileSpawner(ALL_TILE_COLORS, random), detector, new SpecialResolver(new SpecialRegistry(random)));
  const move = new ShuffleEngine(detector, random).findPossibleMoves(board)[0];
  return { board, random, resolver, move };
}

describe('cascade visual snapshots', () => {
  it('keeps every intermediate destination unique in the seed-20 overlap regression', () => {
    const { board, resolver, move } = setup();
    expect(move).toEqual({ from: { row: 0, col: 3 }, to: { row: 1, col: 3 } });
    const positions = new Map(board.getSnapshot().tiles.map(tile => [tile.id, { row: tile.row, col: tile.col }]));
    const fromId = board.get(move.from.row, move.from.col)!.id;
    const toId = board.get(move.to.row, move.to.col)!.id;
    positions.set(fromId, move.to); positions.set(toId, move.from);
    const result = resolver.resolveSwap(board, move.from, move.to);
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
    for (const step of result.steps) {
      step.matchedTileIds.forEach(id => positions.delete(id));
      step.drops.forEach(drop => positions.set(drop.id, { row: drop.toRow, col: drop.col }));
      step.spawns.forEach(({ tile }) => positions.set(tile.id, { row: tile.row, col: tile.col }));
      expect(positions.size).toBe(64);
      expect(new Set([...positions.values()].map(p => p.row + ',' + p.col)).size).toBe(64);
    }
    const snapshots = structuredClone(result.steps);
    board.forEachTile(tile => { tile.row = 99; tile.color = 5; });
    expect(result.steps).toEqual(snapshots);
  });

  it('replays deterministically after restoring board identity and RNG', () => {
    const { board, random, resolver, move } = setup();
    const savedBoard = board.getSnapshot(), savedRandom = random.getSnapshot();
    const expected = resolver.resolveSwap(board, move.from, move.to);
    const expectedBoard = board.getSnapshot();
    board.restore(savedBoard); random.restore(savedRandom);
    expect(resolver.resolveSwap(board, move.from, move.to)).toEqual(expected);
    expect(board.getSnapshot()).toEqual(expectedBoard);
  });

  it('isolates sprite data on construction and final reconciliation', () => {
    const { board } = setup(), view = new BoardView(board);
    view.initFromBoard();
    const tile = board.get(0, 0)!;
    try {
      const sprite = view.getTileSprite(tile.id)!;
      expect(sprite.tileData).not.toBe(tile);
      sprite.tileData.row = 7;
      expect(tile.row).toBe(0);
      view.syncSpritesWithBoard();
      expect(sprite.tileData).toEqual(tile);
      expect(sprite.tileData).not.toBe(tile);
      sprite.tileData.col = 7;
      expect(tile.col).toBe(0);
    } finally { view.destroy({ children: true }); }
  });

  it('plays multiple cascades without modifying the resolved domain board or event payloads', async () => {
    const { board, resolver, move } = setup(), view = new BoardView(board);
    view.initFromBoard();
    vi.spyOn(view.vfx, 'createParticleBurst').mockImplementation(() => {});
    const queue = new AnimationQueue(view);
    const speed = gsap.globalTimeline.timeScale();
    gsap.globalTimeline.timeScale(20);
    try {
      const before = board.getSnapshot();
      await queue.animateSwap(board.get(move.from.row, move.from.col)!.id,
        board.get(move.to.row, move.to.col)!.id, move.from, move.to);
      expect(board.getSnapshot()).toEqual(before);
      const result = resolver.resolveSwap(board, move.from, move.to);
      const finalBoard = board.getSnapshot(), events = structuredClone(result.steps);
      await queue.playCascadeSteps(result.steps, () => {
        expect(board.getSnapshot()).toEqual(finalBoard);
      });
      expect(board.getSnapshot()).toEqual(finalBoard);
      expect(result.steps).toEqual(events);
      const cells = new Set<string>();
      board.forEachTile(tile => {
        const sprite = view.getTileSprite(tile.id)!;
        const expected = view.gridToLocal(tile.row, tile.col);
        expect({ x: sprite.x, y: sprite.y }).toEqual(expected);
        expect(sprite.tileData).toEqual(tile);
        expect(sprite.tileData).not.toBe(tile);
        cells.add(sprite.x + ',' + sprite.y);
      });
      expect(cells.size).toBe(64);
    } finally {
      gsap.globalTimeline.timeScale(speed);
      view.destroy({ children: true });
    }
  });
});
