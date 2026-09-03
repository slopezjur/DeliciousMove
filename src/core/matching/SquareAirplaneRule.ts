import { MatchGroup, SpecialType, TileData } from '../TileTypes.ts';
import { IMatchRule, MatchEvaluationContext } from './IMatchRule.ts';
import { chooseSpawnPos } from './MatchRuleRegistry.ts';

export class SquareAirplaneRule implements IMatchRule {
  public readonly priority = 250;

  public evaluate(ctx: MatchEvaluationContext): MatchGroup[] {
    const { board, hRuns, vRuns, consumedH, consumedV, interactionPositions, consumedTileIds } = ctx;
    if (!board) return [];
    const matches: MatchGroup[] = [];

    for (let r = 0; r < board.rows - 1; r++) {
      for (let c = 0; c < board.cols - 1; c++) {
        const t0 = board.get(r, c);
        const t1 = board.get(r, c + 1);
        const t2 = board.get(r + 1, c);
        const t3 = board.get(r + 1, c + 1);

        if (!t0 || !t1 || !t2 || !t3) continue;

        // Check if any tile is already consumed or already a special candy
        if (
          consumedTileIds.has(t0.id) ||
          consumedTileIds.has(t1.id) ||
          consumedTileIds.has(t2.id) ||
          consumedTileIds.has(t3.id) ||
          t0.special !== SpecialType.None ||
          t1.special !== SpecialType.None ||
          t2.special !== SpecialType.None ||
          t3.special !== SpecialType.None
        ) {
          continue;
        }

        // Check 2x2 color identity
        if (t0.color === t1.color && t0.color === t2.color && t0.color === t3.color) {
          const squareTiles: TileData[] = [t0, t1, t2, t3];
          squareTiles.forEach((t) => consumedTileIds.add(t.id));

          // Consume runs that overlap these square tiles
          const squareIds = new Set(squareTiles.map((t) => t.id));
          for (const h of hRuns) {
            if (h.tiles.every((t) => squareIds.has(t.id))) consumedH.add(h);
          }
          for (const v of vRuns) {
            if (v.tiles.every((t) => squareIds.has(t.id))) consumedV.add(v);
          }

          const spawnPos = chooseSpawnPos(squareTiles, interactionPositions, { row: r, col: c });

          matches.push({
            tiles: squareTiles,
            color: t0.color,
            spawnSpecial: {
              type: SpecialType.Airplane,
              position: spawnPos,
              color: t0.color,
            },
          });
        }
      }
    }

    return matches;
  }
}
