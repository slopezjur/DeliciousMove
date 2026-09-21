import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { ShuffleEngine } from '../src/core/ShuffleEngine.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { SpecialRegistry } from '../src/core/specials/SpecialRegistry.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { SpecialType, TileColor } from '../src/core/TileTypes.ts';
import { SpecialTriggerEffect } from '../src/core/specials/ISpecialHandler.ts';
import { BonusRefillPolicy } from '../src/core/refill/RefillPolicy.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';

type Cell = [number, number];
const specials = Object.values(SpecialType).filter(s => s !== SpecialType.None && s !== SpecialType.Rock);
const patterns: { name: string; cells: Cell[]; reward?: SpecialType }[] = [
  { name: 'three', cells: [[3, 2], [3, 3], [3, 4]] },
  { name: 'four', cells: [[3, 1], [3, 2], [3, 3], [3, 4]], reward: SpecialType.StripedHorizontal },
  { name: 'five', cells: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5]], reward: SpecialType.ColorBomb },
  { name: 'T', cells: [[3, 2], [3, 3], [3, 4], [4, 3], [5, 3]], reward: SpecialType.Wrapped },
  { name: 'L', cells: [[3, 2], [3, 3], [3, 4], [4, 2], [5, 2]], reward: SpecialType.Wrapped },
  { name: 'square', cells: [[3, 2], [3, 3], [4, 2], [4, 3]], reward: SpecialType.Airplane },
];

function coloredBoard(cells: Cell[]): Board {
  const board = new Board();
  cells.forEach(([r, c]) => board.createTile(r, c, TileColor.Red));
  return board;
}

function resolver(): CascadeResolver {
  const random = new SeededRandomSource(42);
  return new CascadeResolver(undefined, undefined, new TileSpawner(undefined, random), undefined,
    new SpecialResolver(new SpecialRegistry(random)));
}

describe('consistent colored-special matching', () => {
  for (const pattern of patterns) {
    it.each(specials)(`${pattern.name} accepts %s and detonates the old special once`, special => {
      const board = coloredBoard(pattern.cells);
      const [r, c] = pattern.cells[0];
      const original = board.get(r, c)!;
      original.special = special;
      const matches = new MatchDetector().detectMatches(board, [{ row: r, col: c }]);
      expect(matches).toHaveLength(1);
      expect(matches[0].tiles).toHaveLength(pattern.cells.length);
      expect(matches[0].spawnSpecial?.type).toBe(pattern.reward);
      const step = resolver().processMatchPass(board, [{ row: r, col: c }], 1)!;
      expect(step.triggeredSpecials?.filter(effect => effect.sourceTile.id === original.id)).toHaveLength(1);
      expect(step.triggeredSpecials?.find(effect => effect.sourceTile.id === original.id)?.effectType).toBe(special);
      for (const created of step.spawnedSpecials) {
        expect(created.id).not.toBe(original.id);
        expect(step.matchedTileIds).not.toContain(created.id);
        expect(step.triggeredSpecials?.some(effect => effect.sourceTile.id === created.id)).toBe(false);
        expect(step.triggeredSpecials?.some(effect => effect.targetTile?.id === created.id)).toBe(false);
      }
    });
  }

  it('keeps rocks out of both line and square matches', () => {
    for (const pattern of patterns) {
      const board = coloredBoard(pattern.cells);
      const [r, c] = pattern.cells[0];
      const rock = board.get(r, c)!;
      rock.special = SpecialType.Rock;
      expect(new MatchDetector().detectMatches(board).flatMap(group => group.tiles.map(t => t.id))).not.toContain(rock.id);
    }
  });

  it('detonates every original when a square contains only specials', () => {
    const board = coloredBoard(patterns[5].cells);
    board.forEachTile(tile => { tile.special = SpecialType.Wrapped; });
    const originals = board.getSnapshot().tiles;
    const step = resolver().processMatchPass(board, [], 1)!;
    expect(step.spawnedSpecials).toHaveLength(1);
    for (const tile of originals) {
      const effects = step.triggeredSpecials!.filter(effect => effect.sourceTile.id === tile.id);
      expect(effects).toHaveLength(1);
      expect(effects[0].effectType).toBe(SpecialType.Wrapped);
    }
    expect(step.matchedTileIds).not.toContain(step.spawnedSpecials[0].id);
  });

  it('accepts the reported (4,4) -> (4,3) red-square swap and advertises it as a possible move', () => {
    const colors = ['ORBRYORY', 'POPGRRGB', 'OBGBRBRP', 'YRBGGYOB', 'RYRBRBPG', 'RGRRBOOP', 'YBGOPGBB', 'OBOYRYPG'];
    const board = new Board();
    colors.forEach((row, r) => [...row].forEach((color, c) => board.createTile(r, c, 'RBGYPO'.indexOf(color))));
    for (const [r, c] of [[0, 1], [0, 3], [1, 4], [1, 5], [3, 1]]) board.get(r, c)!.special = SpecialType.Rock;
    for (const [r, c] of [[5, 2], [5, 4], [5, 7], [7, 1]]) board.get(r, c)!.special = SpecialType.Airplane;
    board.get(7, 6)!.special = SpecialType.StripedVertical;
    const oldPlaneId = board.get(5, 2)!.id;
    const newPlaneId = board.get(4, 4)!.id;
    const move = { from: { row: 4, col: 4 }, to: { row: 4, col: 3 } };
    const possible = new ShuffleEngine().findPossibleMoves(board);
    expect(possible.some(p => p.from.row === 4 && p.from.col === 3 && p.to.row === 4 && p.to.col === 4)).toBe(true);
    const result = resolver().resolveSwap(board, move.from, move.to, true);
    expect(result.valid).toBe(true);
    const step = result.steps[0];
    expect(step.spawnedSpecials.some(t => t.id === newPlaneId && t.special === SpecialType.Airplane)).toBe(true);
    expect(step.triggeredSpecials?.filter(e => e.sourceTile.id === oldPlaneId)).toHaveLength(1);
    expect(step.triggeredSpecials?.some(e => e.sourceTile.id === newPlaneId)).toBe(false);
  });
});

describe('overlapping match ownership', () => {
  it('covers all primitive matches exactly once across seeded boards with specials and rocks', () => {
    const random = new SeededRandomSource(20260920), detector = new MatchDetector();
    for (let iteration = 0; iteration < 100; iteration++) {
      const board = new Board();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        board.createTile(r, c, random.nextInt(3), random.pick(Object.values(SpecialType)));
      }
      const expected = new Set(detector.findRawRuns(board).flatMap(run => run.tiles.map(tile => tile.id)));
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
        const square = [board.get(r, c)!, board.get(r + 1, c)!, board.get(r, c + 1)!, board.get(r + 1, c + 1)!];
        if (square.every(t => t.special !== SpecialType.Rock && t.color === square[0].color)) {
          square.forEach(t => expected.add(t.id));
        }
      }
      const actual = detector.detectMatches(board).flatMap(group => group.tiles.map(tile => tile.id));
      expect(new Set(actual)).toEqual(expected);
      expect(actual.length).toBe(expected.size);
    }
  });

  it.each([
    ['crossing fives', [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [1, 3], [2, 3], [4, 3], [5, 3]], SpecialType.ColorBomb],
    ['five with a short arm', [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [2, 3], [4, 3]], SpecialType.ColorBomb],
    ['square with an extended row', [[3, 2], [3, 3], [3, 4], [4, 2], [4, 3]], SpecialType.Airplane],
    ['diagonally overlapping squares', [[2, 2], [2, 3], [3, 2], [3, 3], [3, 4], [4, 3], [4, 4]], SpecialType.Wrapped],
  ] as [string, Cell[], SpecialType][])(
    '%s clears every participating tile once and awards only the highest-priority complete pattern', (_, cells, reward) => {
      const board = coloredBoard(cells);
      const matches = new MatchDetector().detectMatches(board);
      const ids = matches.flatMap(group => group.tiles.map(tile => tile.id));
      expect(ids).toHaveLength(cells.length);
      expect(new Set(ids).size).toBe(ids.length);
      expect(matches.flatMap(group => group.spawnSpecial ? [group.spawnSpecial.type] : [])).toEqual([reward]);
    });
});

describe('rock immunity and one-shot special effects', () => {
  it.each(specials.flatMap(a => specials.map(b => [a, b] as const)))(
    '%s + %s preserves rocks and emits each special source at most once', (aType, bType) => {
      const board = new Board(5, 5);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) board.createTile(r, c, TileColor.Red, SpecialType.Rock);
      const a = board.createTile(2, 2, TileColor.Red, aType);
      const b = board.createTile(2, 3, TileColor.Red, bType);
      board.createTile(3, 3, TileColor.Blue, SpecialType.Wrapped);
      board.createTile(4, 3, TileColor.Red);
      const before = board.getSnapshot();
      const result = new SpecialResolver(new SpecialRegistry(new SeededRandomSource(42)))
        .resolveSpecialSwapCombo(board, a, b);
      expect(result.executed).toBe(true);
      const sourceIds = result.effects.map(effect => effect.sourceTile.id);
      expect(new Set(sourceIds).size).toBe(sourceIds.length);
      for (const tile of before.tiles.filter(t => t.special === SpecialType.Rock)) {
        expect(board.get(tile.row, tile.col)).toEqual(tile);
        expect(result.destroyedTileIds.has(tile.id)).toBe(false);
      }
    });

  it('does not fire a third special hit by a combo cross', () => {
    const board = coloredBoard([[2, 2], [2, 3], [2, 4]]);
    board.get(2, 2)!.special = SpecialType.StripedHorizontal;
    board.get(2, 3)!.special = SpecialType.StripedVertical;
    board.get(2, 4)!.special = SpecialType.StripedHorizontal;
    const result = new SpecialResolver().resolveSpecialSwapCombo(board, { row: 2, col: 2 }, { row: 2, col: 3 });
    expect(result.effects.map(effect => effect.effectType)).toEqual(['combo_cross']);
    expect(result.destroyedTileIds.has(board.get(2, 4)!.id)).toBe(false);
  });

  it.each(specials)('direct %s blasts never destroy or target rocks', special => {
    const board = new Board(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) board.createTile(r, c, TileColor.Red, SpecialType.Rock);
    const source = board.createTile(1, 1, TileColor.Red, special);
    const destroyed = new Set<number>(), effects: SpecialTriggerEffect[] = [];
    new SpecialResolver().detonate(board, [{ specials: [source] }], destroyed, effects);
    expect([...destroyed]).toEqual([source.id]);
    expect(effects.every(effect => effect.affectedTileIds.every(id => id === source.id))).toBe(true);
    expect(effects.every(effect => effect.targetTile === undefined)).toBe(true);
  });

  it.each([SpecialType.None, SpecialType.StripedHorizontal, SpecialType.StripedVertical, SpecialType.Airplane, SpecialType.Wrapped])(
    'color bomb + %s never converts or destroys red rocks', partnerType => {
      const board = new Board(5, 5);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) board.createTile(r, c, TileColor.Red, SpecialType.Rock);
      const bomb = board.createTile(2, 2, TileColor.Blue, SpecialType.ColorBomb);
      const partner = board.createTile(2, 3, TileColor.Red, partnerType);
      board.createTile(1, 2, TileColor.Red);
      const rocks = board.getSnapshot().tiles.filter(t => t.special === SpecialType.Rock);
      const result = new SpecialResolver(new SpecialRegistry(new SeededRandomSource(42)))
        .resolveSpecialSwapCombo(board, bomb, partner);
      expect(result.executed).toBe(true);
      for (const rock of rocks) {
        expect(board.get(rock.row, rock.col)).toEqual(rock);
        expect(result.destroyedTileIds.has(rock.id)).toBe(false);
        expect(result.effects.some(effect => effect.affectedTileIds.includes(rock.id))).toBe(false);
      }
    });

  it('ignores rock placeholder colors when selecting a color-bomb target', () => {
    const board = new Board(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) board.createTile(r, c, TileColor.Red, SpecialType.Rock);
    const bomb = board.createTile(0, 0, TileColor.Purple, SpecialType.ColorBomb);
    const blue = board.createTile(1, 0, TileColor.Blue);
    const otherBlue = board.createTile(1, 1, TileColor.Blue);
    const destroyed = new Set<number>(), effects: SpecialTriggerEffect[] = [];
    new SpecialResolver().detonate(board, [{ specials: [bomb] }], destroyed, effects);
    expect(destroyed.has(blue.id)).toBe(true);
    expect(destroyed.has(otherBlue.id)).toBe(true);
  });

  it('does not detonate a color-bomb combo source again if its own color matches the partner', () => {
    const board = coloredBoard([[2, 1], [2, 2], [2, 3]]);
    const bomb = board.get(2, 1)!;
    bomb.special = SpecialType.ColorBomb;
    const result = new SpecialResolver().resolveSpecialSwapCombo(board, bomb, board.get(2, 2)!);
    expect(result.effects.filter(effect => effect.sourceTile.id === bomb.id)).toHaveLength(1);
  });
});

describe('move and refill eligibility', () => {
  it('keeps suggested swaps and actual acceptance consistent across seeded boards', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const random = new SeededRandomSource(seed), board = new Board();
      new BoardInitializer(random).populate(board);
      board.get(1, 1)!.special = SpecialType.Rock;
      board.get(2, 2)!.special = SpecialType.Airplane;
      board.get(3, 3)!.special = SpecialType.ColorBomb;
      const possible = new ShuffleEngine().findPossibleMoves(board);
      const keys = new Set(possible.map(({ from, to }) => [from.row, from.col, to.row, to.col].join(',')));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        for (const to of [{ row: r + 1, col: c }, { row: r, col: c + 1 }]) {
          if (!board.isValidPosition(to.row, to.col)) continue;
          const trial = board.clone();
          const engine = new CascadeResolver(undefined, { applyGravity: () => [] }, { refillEmptySlots: () => [] }, undefined,
            new SpecialResolver(new SpecialRegistry(new SeededRandomSource(seed))));
          const accepted = engine.resolveSwap(trial, { row: r, col: c }, to).valid;
          expect(accepted).toBe(keys.has([r, c, to.row, to.col].join(',')));
          if (!accepted) expect(trial.getSnapshot()).toEqual(board.getSnapshot());
        }
      }
    }
  });

  it.each([false, true])('ignores unrelated existing matches (same-color swap: %s)', sameColor => {
    const board = new Board();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board.createTile(r, c, (r + c) % 2 ? TileColor.Purple : TileColor.Orange);
    for (let c = 0; c < 3; c++) board.get(7, c)!.color = TileColor.Red;
    const from = sameColor ? { row: 7, col: 0 } : { row: 0, col: 0 };
    const to = sameColor ? { row: 7, col: 1 } : { row: 0, col: 1 };
    const before = board.getSnapshot();
    expect(new ShuffleEngine().findPossibleMoves(board)).not.toContainEqual({ from, to });
    expect(resolver().resolveSwap(board, from, to).valid).toBe(false);
    expect(board.getSnapshot()).toEqual(before);
  });

  it('does not treat rock placeholders as red candies when refilling bonus cells', () => {
    const board = new Board(5, 5);
    board.createTile(2, 0, TileColor.Red, SpecialType.Rock);
    board.createTile(2, 1, TileColor.Red, SpecialType.Rock);
    board.createTile(1, 2, TileColor.Blue);
    const policy = new BonusRefillPolicy([TileColor.Red, TileColor.Blue], new SeededRandomSource(42), { maxRocksPerWave: 0, rockChance: 0 });
    expect(policy.beginWave().nextTile(board, 2, 2).color).toBe(TileColor.Red);
  });

  it('avoids closing a square containing a special when isolation is impossible', () => {
    const board = new Board(5, 5);
    board.createTile(1, 1, TileColor.Red, SpecialType.Airplane);
    board.createTile(1, 2, TileColor.Red);
    board.createTile(2, 1, TileColor.Red);
    board.createTile(3, 2, TileColor.Blue);
    const policy = new BonusRefillPolicy([TileColor.Red, TileColor.Blue], new SeededRandomSource(42), { maxRocksPerWave: 0, rockChance: 0 });
    expect(policy.beginWave().nextTile(board, 2, 2).color).toBe(TileColor.Blue);
  });
});
