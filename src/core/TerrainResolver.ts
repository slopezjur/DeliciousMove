import { Board } from './Board.ts';
import { CellState, ObjectiveEvent, isBlocker, isCandy } from './BoardFeatures.ts';
import { CascadeStep, Position, SpecialType, TileData } from './TileTypes.ts';
import { IRandomSource, MathRandomSource } from './random/IRandomSource.ts';

/** Cell effects never run for rejected swaps. Damage is capped at one layer per cascade pass. */
export class TerrainResolver {
  constructor(private readonly random: IRandomSource = new MathRandomSource()) {}

  public applyHits(board: Board, destroyed: Set<number>, matched: readonly TileData[] = []): {
    objectiveEvents: ObjectiveEvent[]; updatedTiles: TileData[]; cellsAfter?: CellState[];
  } {
    const events: ObjectiveEvent[] = [], updatedTiles: TileData[] = [];
    const hadTerrain = board.hasTerrain();
    const hits = new Map<string, Position>();
    const addHit = (p: Position) => hits.set(`${p.row},${p.col}`, p);
    const jellyHits = new Set<string>();
    const cleared = new Map<number, TileData>();
    // Evolving a candy still counts its color and clears the jelly under its match.
    for (const tile of matched) if (isCandy(tile)) cleared.set(tile.id, tile);
    board.forEachTile(tile => {
      if (!destroyed.has(tile.id)) return;
      const cell = board.getCell(tile.row, tile.col)!;
      addHit(tile);
      if (tile.kind === 'ingredient' || tile.special === SpecialType.Rock || cell.ice > 0 || isBlocker(tile)) {
        destroyed.delete(tile.id);
      } else cleared.set(tile.id, { ...tile });
    });
    for (const tile of cleared.values()) {
      events.push({ kind: 'color', color: tile.color, amount: 1 });
      jellyHits.add(`${tile.row},${tile.col}`);
      addHit(tile);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addHit({ row: tile.row + dr, col: tile.col + dc });
    }
    for (const p of hits.values()) {
      const cell = board.getCell(p.row, p.col);
      if (!cell?.playable) continue;
      if (cell.ice > 0) {
        cell.ice--;
        if (cell.ice === 0) events.push({ kind: 'blocker', blocker: 'ice', amount: 1 });
      }
      const tile = board.get(p.row, p.col);
      if (tile && isBlocker(tile)) {
        tile.layers = (tile.layers ?? 1) - 1;
        if (tile.layers <= 0) {
          destroyed.add(tile.id);
          events.push({ kind: 'blocker', blocker: tile.kind as 'frosting' | 'crate' | 'chocolate', amount: 1 });
        } else updatedTiles.push({ ...tile });
      }
      if (cell.jelly > 0 && jellyHits.has(`${p.row},${p.col}`)) {
        cell.jelly--;
        events.push({ kind: 'jelly', amount: 1 });
      }
    }
    return { objectiveEvents: events, updatedTiles, cellsAfter: hadTerrain ? board.getCells() : undefined };
  }

  public spread(board: Board, steps: readonly CascadeStep[]): CascadeStep | null {
    if (steps.some(step => step.objectiveEvents?.some(event => event.kind === 'blocker' && event.blocker === 'chocolate'))) return null;
    const candidates = new Map<number, TileData>();
    board.forEachTile(tile => {
      if (tile.kind !== 'chocolate') return;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = tile.row + dr, c = tile.col + dc, neighbor = board.get(r, c), cell = board.getCell(r, c);
        if (neighbor && isCandy(neighbor) && neighbor.special === SpecialType.None && cell?.ice === 0 && !cell.exit) candidates.set(neighbor.id, neighbor);
      }
    });
    if (candidates.size === 0) return null;
    const target = this.random.pick([...candidates.values()]);
    const chocolate = board.createTile(target.row, target.col, target.color);
    chocolate.kind = 'chocolate'; chocolate.layers = 1;
    return { matchedTileIds: [target.id], spawnedSpecials: [], drops: [],
      spawns: [{ tile: { ...chocolate }, appearInPlace: true }], scoreGained: 0 };
  }
}
