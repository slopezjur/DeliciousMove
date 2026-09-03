import { Board } from './Board.ts';
import { IMatchDetector, MatchDetector } from './MatchDetector.ts';
import { SpecialType, Position, TileData } from './TileTypes.ts';
import { IRandomSource, MathRandomSource } from './random/IRandomSource.ts';

export interface PossibleMove {
  from: Position;
  to: Position;
}

export interface ShuffleResult {
  /** False when no solvable arrangement was found within the attempt budget. */
  success: boolean;
  mapping: Map<number, Position>;
}

export interface IDeadlockResolver {
  findPossibleMoves(board: Board): PossibleMove[];
  hasPossibleMoves(board: Board): boolean;
  shuffleBoard(board: Board): ShuffleResult;
}

export class ShuffleEngine implements IDeadlockResolver {
  private readonly matchDetector: IMatchDetector;
  private readonly random: IRandomSource;
  private readonly maxShuffleAttempts: number;

  constructor(
    matchDetector: IMatchDetector = new MatchDetector(),
    random: IRandomSource = new MathRandomSource(),
    maxShuffleAttempts: number = 100
  ) {
    this.matchDetector = matchDetector;
    this.random = random;
    this.maxShuffleAttempts = maxShuffleAttempts;
  }

  /**
   * Scans the board for any 1-swap move that results in a match or special combination.
   */
  public findPossibleMoves(board: Board): PossibleMove[] {
    const moves: PossibleMove[] = [];

    // Right and down neighbours cover every adjacent pair exactly once.
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        for (const to of [
          { row: r, col: c + 1 },
          { row: r + 1, col: c },
        ]) {
          if (!board.isValidPosition(to.row, to.col)) continue;
          const from = { row: r, col: c };
          if (this.isSwapProductive(board, from, to)) {
            moves.push({ from, to });
          }
        }
      }
    }

    return moves;
  }

  public hasPossibleMoves(board: Board): boolean {
    // Any special candy on the board can be directly clicked or swapped without matching colors
    let hasSpecial = false;
    board.forEachTile((t) => {
      if (t.special !== SpecialType.None) hasSpecial = true;
    });
    if (hasSpecial) return true;

    return this.findPossibleMoves(board).length > 0;
  }

  /**
   * Shuffles current tiles on the board until at least one valid move exists and no matches
   * are pre-formed. Reports failure instead of silently returning a deadlocked board.
   */
  public shuffleBoard(board: Board): ShuffleResult {
    const tiles: TileData[] = [];
    board.forEachTile((t) => tiles.push(t));

    let success = false;
    let attempts = 0;

    while (attempts++ < this.maxShuffleAttempts) {
      this.shuffleInPlace(tiles);

      board.clear();
      let index = 0;
      for (let r = 0; r < board.rows; r++) {
        for (let c = 0; c < board.cols; c++) {
          board.set(r, c, tiles[index++]);
        }
      }

      // Ensure no matches already exist AND there is at least 1 valid move
      if (this.matchDetector.detectMatches(board).length === 0 && this.hasPossibleMoves(board)) {
        success = true;
        break;
      }
    }

    const mapping = new Map<number, Position>();
    board.forEachTile((t, r, c) => {
      mapping.set(t.id, { row: r, col: c });
    });

    return { success, mapping };
  }

  /**
   * A swap is productive if it involves at least one special candy (free drag) or forms a colour match.
   */
  private isSwapProductive(board: Board, posA: Position, posB: Position): boolean {
    const tileA = board.get(posA.row, posA.col);
    const tileB = board.get(posB.row, posB.col);
    if (!tileA || !tileB) return false;

    if (tileA.special !== SpecialType.None || tileB.special !== SpecialType.None) {
      return true;
    }

    board.swap(posA, posB);
    const matches = this.matchDetector.detectMatches(board, [posA, posB]);
    board.swap(posA, posB); // Revert

    return matches.length > 0;
  }

  private shuffleInPlace(tiles: TileData[]): void {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = this.random.nextInt(i + 1);
      const temp = tiles[i];
      tiles[i] = tiles[j];
      tiles[j] = temp;
    }
  }
}
