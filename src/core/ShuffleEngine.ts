import { Board } from './Board.ts';
import { MatchDetector } from './MatchDetector.ts';
import { SpecialType, Position } from './TileTypes.ts';

export interface PossibleMove {
  from: Position;
  to: Position;
}

export class ShuffleEngine {
  /**
   * Scans the board for any 1-swap move that results in a match or special combination.
   */
  public static findPossibleMoves(board: Board): PossibleMove[] {
    const moves: PossibleMove[] = [];

    const testSwap = (posA: Position, posB: Position): boolean => {
      const tileA = board.get(posA.row, posA.col);
      const tileB = board.get(posB.row, posB.col);
      if (!tileA || !tileB) return false;

      // Special combos are always valid moves
      if (
        tileA.special === SpecialType.ColorBomb ||
        tileB.special === SpecialType.ColorBomb ||
        (tileA.special !== SpecialType.None && tileB.special !== SpecialType.None)
      ) {
        return true;
      }

      // Check if swap produces a match
      board.swap(posA, posB);
      const matches = MatchDetector.detectMatches(board, [posA, posB]);
      board.swap(posA, posB); // Revert

      return matches.length > 0;
    };

    // Check all horizontal swaps
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols - 1; c++) {
        const from = { row: r, col: c };
        const to = { row: r, col: c + 1 };
        if (testSwap(from, to)) {
          moves.push({ from, to });
        }
      }
    }

    // Check all vertical swaps
    for (let r = 0; r < board.rows - 1; r++) {
      for (let c = 0; c < board.cols; c++) {
        const from = { row: r, col: c };
        const to = { row: r + 1, col: c };
        if (testSwap(from, to)) {
          moves.push({ from, to });
        }
      }
    }

    return moves;
  }

  public static hasPossibleMoves(board: Board): boolean {
    return this.findPossibleMoves(board).length > 0;
  }

  /**
   * Shuffles current tiles on the board until at least one valid move exists and no matches are pre-formed.
   * Returns mapping of tile ID to new { row, col } positions.
   */
  public static shuffleBoard(board: Board): Map<number, Position> {
    const tiles: any[] = [];
    board.forEachTile((t) => tiles.push(t));

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts++ < maxAttempts) {
      // Fisher-Yates shuffle
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = tiles[i];
        tiles[i] = tiles[j];
        tiles[j] = temp;
      }

      // Assign to grid
      board.clear();
      let index = 0;
      for (let r = 0; r < board.rows; r++) {
        for (let c = 0; c < board.cols; c++) {
          board.set(r, c, tiles[index++]);
        }
      }

      // Ensure no matches already exist AND there is at least 1 valid move
      const currentMatches = MatchDetector.detectMatches(board);
      if (currentMatches.length === 0 && this.hasPossibleMoves(board)) {
        break;
      }
    }

    const mapping = new Map<number, Position>();
    board.forEachTile((t, r, c) => {
      mapping.set(t.id, { row: r, col: c });
    });
    return mapping;
  }
}
