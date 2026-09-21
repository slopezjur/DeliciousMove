import { Board } from './Board.ts';
import { CascadeStep, TileData } from './TileTypes.ts';

/** A bounded, row-major snapshot of usable specials, identified independently of position. */
export class LastChanceQueue {
  private readonly ids: number[] = [];
  private readonly consumed = new Set<number>();

  constructor(board: Board) {
    board.forEachTile(tile => {
      if (board.canActivate(tile)) this.ids.push(tile.id);
    });
  }

  next(board: Board): TileData | undefined {
    while (this.ids.length > 0) {
      const id = this.ids.shift()!;
      if (this.consumed.has(id)) continue;
      let current: TileData | undefined;
      board.forEachTile(tile => { if (tile.id === id) current = tile; });
      if (current && board.canActivate(current)) return { ...current };
    }
    return undefined;
  }

  record(steps: readonly CascadeStep[]): void {
    for (const step of steps) {
      // A triggered candy can evolve into a new special with the same ID. Do not fire it twice.
      for (const effect of step.triggeredSpecials ?? []) this.consumed.add(effect.sourceTile.id);
      for (const tile of step.spawnedSpecials) this.consumed.add(tile.id);
    }
  }
}
