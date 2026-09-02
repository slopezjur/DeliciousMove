import { describe, it, expect, beforeEach } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { ShuffleEngine } from '../src/core/ShuffleEngine.ts';
import { TileColor, SpecialType } from '../src/core/TileTypes.ts';

describe('Match-3 Core Engine', () => {
  let board: Board;

  beforeEach(() => {
    board = new Board(8, 8);
  });

  it('detects a simple 3-in-a-row horizontal match', () => {
    // Fill board with alternating dummy colors
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.createTile(r, c, (r + c) % 2 === 0 ? TileColor.Red : TileColor.Blue);
      }
    }

    // Set row 3, cols 0, 1, 2 to Green
    board.get(3, 0)!.color = TileColor.Green;
    board.get(3, 1)!.color = TileColor.Green;
    board.get(3, 2)!.color = TileColor.Green;

    const matches = MatchDetector.detectMatches(board);
    expect(matches.length).toBe(1);
    expect(matches[0].color).toBe(TileColor.Green);
    expect(matches[0].tiles.length).toBe(3);
    expect(matches[0].spawnSpecial).toBeUndefined();
  });

  it('detects a 4-in-a-row and creates a Striped candy', () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.createTile(r, c, TileColor.Blue);
      }
    }

    // Set row 0 cols 1,2,3,4 to Yellow
    board.get(0, 1)!.color = TileColor.Yellow;
    board.get(0, 2)!.color = TileColor.Yellow;
    board.get(0, 3)!.color = TileColor.Yellow;
    board.get(0, 4)!.color = TileColor.Yellow;

    const matches = MatchDetector.detectMatches(board);
    const yellowMatch = matches.find((m) => m.color === TileColor.Yellow);
    expect(yellowMatch).toBeDefined();
    expect(yellowMatch!.tiles.length).toBe(4);
    expect(yellowMatch!.spawnSpecial?.type).toBe(SpecialType.StripedHorizontal);
  });

  it('detects a 5-in-a-row and creates a Color Bomb', () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.createTile(r, c, TileColor.Blue);
      }
    }

    // Set row 2 cols 0,1,2,3,4 to Purple
    for (let c = 0; c < 5; c++) {
      board.get(2, c)!.color = TileColor.Purple;
    }

    const matches = MatchDetector.detectMatches(board);
    const purpleMatch = matches.find((m) => m.color === TileColor.Purple);
    expect(purpleMatch).toBeDefined();
    expect(purpleMatch!.spawnSpecial?.type).toBe(SpecialType.ColorBomb);
  });

  it('detects a T-shape intersection and creates a Wrapped candy', () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.createTile(r, c, (r + c) % 2 === 0 ? TileColor.Blue : TileColor.Green);
      }
    }

    // Horizontal: row 2, col 2, 3, 4 Red
    board.get(2, 2)!.color = TileColor.Red;
    board.get(2, 3)!.color = TileColor.Red;
    board.get(2, 4)!.color = TileColor.Red;

    // Vertical: row 3, 4 at col 3 Red (forming T at row 2 col 3)
    board.get(3, 3)!.color = TileColor.Red;
    board.get(4, 3)!.color = TileColor.Red;

    const matches = MatchDetector.detectMatches(board);
    const redMatch = matches.find((m) => m.color === TileColor.Red);
    expect(redMatch).toBeDefined();
    expect(redMatch!.tiles.length).toBe(5);
    expect(redMatch!.spawnSpecial?.type).toBe(SpecialType.Wrapped);
    expect(redMatch!.spawnSpecial?.position).toEqual({ row: 2, col: 3 });
  });

  it('resolves a valid swap, collapses gravity, and generates cascade steps', () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.createTile(r, c, (r + c) % 2 === 0 ? TileColor.Purple : TileColor.Orange);
      }
    }

    // Prepare a match: row 0 cols 0, 1 are Red. Col 2 is Blue. Row 1 col 2 is Red.
    board.get(0, 0)!.color = TileColor.Red;
    board.get(0, 1)!.color = TileColor.Red;
    board.get(0, 2)!.color = TileColor.Blue;
    board.get(1, 2)!.color = TileColor.Red;

    // Swapping (0, 2) and (1, 2) creates a 3-match of Red at row 0
    const result = CascadeResolver.resolveSwap(board, { row: 0, col: 2 }, { row: 1, col: 2 });
    expect(result.valid).toBe(true);
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.steps[0].scoreGained).toBeGreaterThan(0);
    expect(result.steps[0].matchedTileIds.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects an invalid swap that creates no matches', () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.createTile(r, c, (r + c) % 2 === 0 ? TileColor.Purple : TileColor.Orange);
      }
    }

    const result = CascadeResolver.resolveSwap(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(result.valid).toBe(false);
    expect(result.steps.length).toBe(0);
  });

  it('detects possible moves and resolves deadlocks with shuffle', () => {
    board.populateInitial();
    const hasMoves = ShuffleEngine.hasPossibleMoves(board);
    expect(typeof hasMoves).toBe('boolean');

    // Shuffle should always ensure valid moves exist
    ShuffleEngine.shuffleBoard(board);
    expect(ShuffleEngine.hasPossibleMoves(board)).toBe(true);
    expect(MatchDetector.detectMatches(board).length).toBe(0);
  });
});
