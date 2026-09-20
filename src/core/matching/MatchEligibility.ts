import { MatchGroup, TileData } from '../TileTypes.ts';

/** Normal swaps must change colors and form a match involving a moved candy. */
export function isProductiveColorSwap(matches: MatchGroup[], a: TileData, b: TileData): boolean {
  return (a.color !== b.color || a.kind === 'ingredient' || b.kind === 'ingredient') && matches.some(group =>
    group.tiles.some(tile => tile.id === a.id || tile.id === b.id));
}
