import { Board } from './Board.ts';
import { TileData, Position, SpecialType, TileColor } from './TileTypes.ts';
import { SpecialRegistry } from './specials/SpecialRegistry.ts';
import type { SpecialTriggerEffect, ISpecialRegistry } from './specials/ISpecialHandler.ts';

export type { SpecialTriggerEffect };

export interface SpecialComboResult {
  executed: boolean;
  effects: SpecialTriggerEffect[];
  destroyedTileIds: Set<number>;
}

/**
 * A set of specials set off by the same event. The trigger color tells a color bomb
 * which color to wipe; chained blasts inherit no color.
 */
export interface SpecialDetonationBatch {
  specials: TileData[];
  triggerColor?: TileColor;
}

export interface ISpecialResolver {
  resolveSpecialSwapCombo(board: Board, posA: Position, posB: Position): SpecialComboResult;
  detonate(
    board: Board,
    batches: SpecialDetonationBatch[],
    destroyedTileIds: Set<number>,
    effects: SpecialTriggerEffect[]
  ): void;
}

export class SpecialResolver implements ISpecialResolver {
  private readonly registry: ISpecialRegistry;

  constructor(registry: ISpecialRegistry = new SpecialRegistry()) {
    this.registry = registry;
  }

  /**
   * Resolves direct combo swaps between two special candies using the registered Strategy handlers.
   * Expects the swap to have already been applied to the board, so effects are centred on the
   * destination cell the player actually dropped onto.
   */
  public resolveSpecialSwapCombo(board: Board, posA: Position, posB: Position): SpecialComboResult {
    const tileA = board.get(posA.row, posA.col);
    const tileB = board.get(posB.row, posB.col);

    if (!tileA || !tileB) {
      return { executed: false, effects: [], destroyedTileIds: new Set() };
    }

    const handler = this.registry.findComboHandler(tileA, tileB);
    if (!handler) {
      return { executed: false, effects: [], destroyedTileIds: new Set() };
    }

    const destroyedTileIds = new Set<number>();
    const { effects, secondaryDetonations } = handler.execute(board, tileA, tileB, destroyedTileIds);

    if (secondaryDetonations.length > 0) {
      this.detonate(board, [{ specials: secondaryDetonations }], destroyedTileIds, effects);
    }

    return { executed: true, effects, destroyedTileIds };
  }

  /**
   * Explodes special candies caught inside matches or cascading explosions using Strategy
   * handlers, chaining blast-uncovered specials breadth-first. A single shared queue across
   * all batches guarantees every special detonates exactly once.
   */
  public detonate(
    board: Board,
    batches: SpecialDetonationBatch[],
    destroyedTileIds: Set<number>,
    effects: SpecialTriggerEffect[]
  ): void {
    const queue: { tile: TileData; triggerColor?: TileColor }[] = [];
    for (const batch of batches) {
      for (const tile of batch.specials) {
        queue.push({ tile, triggerColor: batch.triggerColor });
      }
    }

    const processedIds = new Set<number>();

    while (queue.length > 0) {
      const { tile, triggerColor } = queue.shift()!;
      if (processedIds.has(tile.id)) continue;
      processedIds.add(tile.id);
      destroyedTileIds.add(tile.id);

      if (tile.special === SpecialType.None) continue;

      const handler = this.registry.getEffectHandler(tile.special);
      if (!handler) continue;

      const chained: TileData[] = [];
      effects.push(
        handler.execute({
          board,
          sourceTile: tile,
          destroyedTileIds,
          triggerQueue: chained,
          triggerColor,
        })
      );

      // Specials uncovered by this blast detonate without inheriting a trigger color.
      for (const uncovered of chained) {
        queue.push({ tile: uncovered });
      }
    }
  }
}
