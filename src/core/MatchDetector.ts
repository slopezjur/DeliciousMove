import { Board } from './Board.ts';
import { TileData, TileColor, Position, MatchGroup } from './TileTypes.ts';
import { MatchRuleRegistry } from './matching/MatchRuleRegistry.ts';

export interface RawRun {
  orientation: 'horizontal' | 'vertical';
  color: TileColor;
  tiles: TileData[];
}

export interface IMatchDetector {
  findRawRuns(board: Board): RawRun[];
  detectMatches(board: Board, interactionPositions?: Position[]): MatchGroup[];
}

export class MatchDetector implements IMatchDetector {
  private readonly registry: MatchRuleRegistry;

  constructor(registry: MatchRuleRegistry = new MatchRuleRegistry()) {
    this.registry = registry;
  }

  /**
   * Finds all raw horizontal and vertical runs of 3 or more matching colors.
   */
  public findRawRuns(board: Board): RawRun[] {
    return [
      ...this.scanLines(board, 'horizontal'),
      ...this.scanLines(board, 'vertical'),
    ];
  }

  /**
   * Evaluates runs into composite match groups using the MatchRuleRegistry strategy pipeline (OCP).
   * @param board The board model
   * @param interactionPositions Optional positions involved in user move (for placing special at player's target)
   */
  public detectMatches(board: Board, interactionPositions: Position[] = []): MatchGroup[] {
    const rawRuns = this.findRawRuns(board);
    if (rawRuns.length === 0) return [];

    const hRuns = rawRuns.filter((r) => r.orientation === 'horizontal');
    const vRuns = rawRuns.filter((r) => r.orientation === 'vertical');

    const matchedGroups: MatchGroup[] = [];
    const consumedH = new Set<RawRun>();
    const consumedV = new Set<RawRun>();

    for (const rule of this.registry.getRules()) {
      const matches = rule.evaluate(hRuns, vRuns, consumedH, consumedV, interactionPositions);
      matchedGroups.push(...matches);
    }

    return matchedGroups;
  }

  /**
   * Single scan routine shared by both orientations (DRY): walks each line accumulating
   * same-colored tiles and emits every run of 3 or more.
   */
  private scanLines(board: Board, orientation: 'horizontal' | 'vertical'): RawRun[] {
    const runs: RawRun[] = [];
    const isHorizontal = orientation === 'horizontal';
    const lineCount = isHorizontal ? board.rows : board.cols;
    const cellCount = isHorizontal ? board.cols : board.rows;

    for (let line = 0; line < lineCount; line++) {
      let currentRun: TileData[] = [];

      const flush = () => {
        if (currentRun.length >= 3) {
          runs.push({ orientation, color: currentRun[0].color, tiles: [...currentRun] });
        }
      };

      for (let cell = 0; cell < cellCount; cell++) {
        const tile = isHorizontal ? board.get(line, cell) : board.get(cell, line);

        if (!tile) {
          flush();
          currentRun = [];
          continue;
        }

        if (currentRun.length === 0 || currentRun[0].color === tile.color) {
          currentRun.push(tile);
        } else {
          flush();
          currentRun = [tile];
        }
      }

      flush();
    }

    return runs;
  }
}
