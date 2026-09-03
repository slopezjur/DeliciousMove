import { MatchGroup, Position, SpecialType, TileData } from '../TileTypes.ts';
import { IMatchRule, MatchEvaluationContext } from './IMatchRule.ts';
import { SquareAirplaneRule } from './SquareAirplaneRule.ts';

export function chooseSpawnPos(
  tiles: TileData[],
  interactionPositions: Position[],
  fallback: Position
): Position {
  for (const pos of interactionPositions) {
    if (tiles.some((t) => t.row === pos.row && t.col === pos.col)) {
      return { row: pos.row, col: pos.col };
    }
  }
  return fallback;
}

export class ColorBombRule implements IMatchRule {
  public readonly priority = 100;

  public evaluate(ctx: MatchEvaluationContext): MatchGroup[] {
    const { hRuns, vRuns, consumedH, consumedV, interactionPositions, consumedTileIds } = ctx;
    const matches: MatchGroup[] = [];

    for (const h of hRuns) {
      if (!consumedH.has(h) && h.tiles.length >= 5) {
        consumedH.add(h);
        h.tiles.forEach((t) => consumedTileIds.add(t.id));
        const centerTile = h.tiles[Math.floor(h.tiles.length / 2)];
        const spawnPos = chooseSpawnPos(h.tiles, interactionPositions, { row: centerTile.row, col: centerTile.col });
        matches.push({
          tiles: h.tiles,
          color: h.color,
          spawnSpecial: {
            type: SpecialType.ColorBomb,
            position: spawnPos,
            color: h.color,
          },
        });
      }
    }

    for (const v of vRuns) {
      if (!consumedV.has(v) && v.tiles.length >= 5) {
        consumedV.add(v);
        v.tiles.forEach((t) => consumedTileIds.add(t.id));
        const centerTile = v.tiles[Math.floor(v.tiles.length / 2)];
        const spawnPos = chooseSpawnPos(v.tiles, interactionPositions, { row: centerTile.row, col: centerTile.col });
        matches.push({
          tiles: v.tiles,
          color: v.color,
          spawnSpecial: {
            type: SpecialType.ColorBomb,
            position: spawnPos,
            color: v.color,
          },
        });
      }
    }

    return matches;
  }
}

export class IntersectionWrappedRule implements IMatchRule {
  public readonly priority = 200;

  public evaluate(ctx: MatchEvaluationContext): MatchGroup[] {
    const { hRuns, vRuns, consumedH, consumedV, interactionPositions, consumedTileIds } = ctx;
    const matches: MatchGroup[] = [];

    for (const h of hRuns) {
      if (consumedH.has(h)) continue;
      for (const v of vRuns) {
        if (consumedV.has(v)) continue;

        if (h.color === v.color) {
          const intersection = h.tiles.find((ht) => v.tiles.some((vt) => vt.id === ht.id));
          if (intersection) {
            consumedH.add(h);
            consumedV.add(v);

            const combinedTileMap = new Map<number, TileData>();
            h.tiles.forEach((t) => {
              combinedTileMap.set(t.id, t);
              consumedTileIds.add(t.id);
            });
            v.tiles.forEach((t) => {
              combinedTileMap.set(t.id, t);
              consumedTileIds.add(t.id);
            });
            const uniqueTiles = Array.from(combinedTileMap.values());

            const spawnPos = chooseSpawnPos(uniqueTiles, interactionPositions, {
              row: intersection.row,
              col: intersection.col,
            });

            matches.push({
              tiles: uniqueTiles,
              color: h.color,
              spawnSpecial: {
                type: SpecialType.Wrapped,
                position: spawnPos,
                color: h.color,
              },
            });
            break;
          }
        }
      }
    }

    return matches;
  }
}

export class StripedRule implements IMatchRule {
  public readonly priority = 300;

  public evaluate(ctx: MatchEvaluationContext): MatchGroup[] {
    const { hRuns, vRuns, consumedH, consumedV, interactionPositions, consumedTileIds } = ctx;
    const matches: MatchGroup[] = [];

    for (const h of hRuns) {
      if (!consumedH.has(h) && h.tiles.length === 4 && !h.tiles.some((t) => consumedTileIds.has(t.id))) {
        consumedH.add(h);
        h.tiles.forEach((t) => consumedTileIds.add(t.id));
        const centerTile = h.tiles[1];
        const spawnPos = chooseSpawnPos(h.tiles, interactionPositions, { row: centerTile.row, col: centerTile.col });
        matches.push({
          tiles: h.tiles,
          color: h.color,
          spawnSpecial: {
            type: SpecialType.StripedHorizontal,
            position: spawnPos,
            color: h.color,
          },
        });
      }
    }

    for (const v of vRuns) {
      if (!consumedV.has(v) && v.tiles.length === 4 && !v.tiles.some((t) => consumedTileIds.has(t.id))) {
        consumedV.add(v);
        v.tiles.forEach((t) => consumedTileIds.add(t.id));
        const centerTile = v.tiles[1];
        const spawnPos = chooseSpawnPos(v.tiles, interactionPositions, { row: centerTile.row, col: centerTile.col });
        matches.push({
          tiles: v.tiles,
          color: v.color,
          spawnSpecial: {
            type: SpecialType.StripedVertical,
            position: spawnPos,
            color: v.color,
          },
        });
      }
    }

    return matches;
  }
}

export class NormalMatchRule implements IMatchRule {
  public readonly priority = 400;

  public evaluate(ctx: MatchEvaluationContext): MatchGroup[] {
    const { hRuns, vRuns, consumedH, consumedV, consumedTileIds } = ctx;
    const matches: MatchGroup[] = [];

    for (const h of hRuns) {
      if (!consumedH.has(h)) {
        const available = h.tiles.filter((t) => !consumedTileIds.has(t.id));
        if (available.length >= 3) {
          consumedH.add(h);
          available.forEach((t) => consumedTileIds.add(t.id));
          matches.push({
            tiles: available,
            color: h.color,
          });
        }
      }
    }

    for (const v of vRuns) {
      if (!consumedV.has(v)) {
        const available = v.tiles.filter((t) => !consumedTileIds.has(t.id));
        if (available.length >= 3) {
          consumedV.add(v);
          available.forEach((t) => consumedTileIds.add(t.id));
          matches.push({
            tiles: available,
            color: v.color,
          });
        }
      }
    }

    return matches;
  }
}

export class MatchRuleRegistry {
  private rules: IMatchRule[] = [];

  constructor() {
    this.registerDefaultRules();
  }

  public registerRule(rule: IMatchRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  public getRules(): readonly IMatchRule[] {
    return this.rules;
  }

  private registerDefaultRules(): void {
    this.registerRule(new ColorBombRule());
    this.registerRule(new IntersectionWrappedRule());
    this.registerRule(new SquareAirplaneRule());
    this.registerRule(new StripedRule());
    this.registerRule(new NormalMatchRule());
  }
}
