import { MatchGroup, SpecialType, TileData } from '../TileTypes.ts';
import { IMatchRule, MatchEvaluationContext } from './IMatchRule.ts';
import { chooseSpawnPos } from './MatchRuleRegistry.ts';

export class SquareAirplaneRule implements IMatchRule {
  public readonly priority = 250;

  public evaluate(ctx: MatchEvaluationContext): MatchGroup[] {
    const { board, interactionPositions, consumedTileIds } = ctx;
    if (!board) return [];
    const matches: MatchGroup[] = [];

    for (let r = 0; r < board.rows - 1; r++) {
      for (let c = 0; c < board.cols - 1; c++) {
        const t0 = board.get(r, c);
        const t1 = board.get(r, c + 1);
        const t2 = board.get(r + 1, c);
        const t3 = board.get(r + 1, c + 1);

        if (!t0 || !t1 || !t2 || !t3) continue;

        // Colored specials match like ordinary candies; rocks never participate.
        const squareTiles: TileData[] = [t0, t1, t2, t3];
        if (squareTiles.some(tile => !board.canMatch(tile))) continue;

        // Check 2x2 color identity
        if (t0.color === t1.color && t0.color === t2.color && t0.color === t3.color) {
          const available = squareTiles.filter(tile => !consumedTileIds.has(tile.id));
          if (available.length === 0) continue;
          available.forEach(tile => consumedTileIds.add(tile.id));

          const spawnPos = chooseSpawnPos(squareTiles, interactionPositions, { row: r, col: c });

          matches.push({
            tiles: available,
            color: t0.color,
            // Overlapping shapes still clear their remaining tiles, but cannot reuse
            // already claimed tiles to earn another special.
            spawnSpecial: available.length === 4 ? {
              type: SpecialType.Airplane,
              position: spawnPos,
              color: t0.color,
            } : undefined,
          });
        }
      }
    }

    return matches;
  }
}
