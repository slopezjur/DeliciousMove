import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { ScoreCalculator } from '../src/core/ScoreCalculator.ts';
import { Position, SpecialType, TileColor } from '../src/core/TileTypes.ts';

const fillBoard = () => {
  const board = new Board(7, 7);
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      board.createTile(row, col, ((row + col) % 5 + 1) as TileColor);
    }
  }
  return board;
};

const noRefill = { refillEmptySlots: () => [] };
const noGravity = { applyGravity: () => [] };
const detector = new MatchDetector();

describe('Swipe-directed striped candies', () => {
  const directions: { name: string; from: Position; expected: SpecialType }[] = [
    { name: 'down', from: { row: 2, col: 3 }, expected: SpecialType.StripedVertical },
    { name: 'up', from: { row: 4, col: 3 }, expected: SpecialType.StripedVertical },
    { name: 'right', from: { row: 3, col: 2 }, expected: SpecialType.StripedHorizontal },
    { name: 'left', from: { row: 3, col: 4 }, expected: SpecialType.StripedHorizontal },
  ];

  it.each(directions)('uses the $name swap axis even when the match is perpendicular', ({ from, expected }) => {
    const board = fillBoard();
    const to = { row: 3, col: 3 };
    const verticalSwipe = from.col === to.col;
    for (const offset of [1, 2, 4]) {
      board.get(verticalSwipe ? 3 : offset, verticalSwipe ? offset : 3)!.color = TileColor.Red;
    }
    board.get(from.row, from.col)!.color = TileColor.Red;
    expect(detector.detectMatches(board)).toEqual([]);

    const resolver = new CascadeResolver(new ScoreCalculator(), noGravity, noRefill);
    const result = resolver.resolveSwap(board, from, to);
    expect(result.valid).toBe(true);
    expect(result.steps[0].spawnedSpecials).toHaveLength(1);
    const special = result.steps[0].spawnedSpecials[0];
    expect(special.special).toBe(expected);

    // Fire the resulting candy on a full board and verify the actual line it clears.
    const blastBoard = fillBoard();
    const source = blastBoard.createTile(3, 3, TileColor.Red, special.special);
    const destroyed = new Set<number>();
    new SpecialResolver().detonate(blastBoard, [{ specials: [source] }], destroyed, []);
    const expectedIds: number[] = [];
    blastBoard.forEachTile((tile) => {
      if (verticalSwipe ? tile.col === 3 : tile.row === 3) expectedIds.push(tile.id);
    });
    expect([...destroyed].sort()).toEqual(expectedIds.sort());
  });

  it.each(['horizontal', 'vertical'] as const)('uses the %s run for matches without a player swap', (axis) => {
    const board = fillBoard();
    for (let i = 1; i <= 4; i++) {
      board.get(axis === 'horizontal' ? 3 : i, axis === 'horizontal' ? i : 3)!.color = TileColor.Red;
    }
    const special = detector.detectMatches(board).find((m) => m.color === TileColor.Red)?.spawnSpecial;
    expect(special?.type).toBe(axis === 'horizontal' ? SpecialType.StripedHorizontal : SpecialType.StripedVertical);
  });

  it('does not carry a vertical swipe into a later horizontal cascade', () => {
    const board = fillBoard();
    board.get(3, 2)!.color = TileColor.Red;
    board.get(3, 4)!.color = TileColor.Red;
    board.get(2, 3)!.color = TileColor.Red;
    for (let col = 1; col <= 4; col++) board.set(5, col, null);
    let wave = 0;
    const resolver = new CascadeResolver(new ScoreCalculator(), noGravity, {
      refillEmptySlots: () => {
        if (wave++ > 0) return [];
        return [1, 2, 3, 4].map((col) => ({
          tile: board.createTile(5, col, TileColor.Red),
        }));
      },
    });
    const result = resolver.resolveSwap(board, { row: 2, col: 3 }, { row: 3, col: 3 });
    expect(result.valid).toBe(true);
    expect(result.steps[0].spawnedSpecials).toHaveLength(0);
    expect(result.steps[1].spawnedSpecials[0].special).toBe(SpecialType.StripedHorizontal);
  });

  it('does not apply an unrelated swap axis to an existing match', () => {
    const board = fillBoard();
    for (let col = 1; col <= 4; col++) board.get(5, col)!.color = TileColor.Red;
    const match = detector.detectMatches(board, [{ row: 0, col: 0 }, { row: 1, col: 0 }]);
    expect(match.find((m) => m.color === TileColor.Red)?.spawnSpecial?.type).toBe(SpecialType.StripedHorizontal);
  });
});
