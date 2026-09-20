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

export interface SpecialDetonationOptions {
  protectedTileIds?: ReadonlySet<number>;
  alreadyTriggeredTileIds?: ReadonlySet<number>;
}

export interface ISpecialResolver {
  resolveSpecialSwapCombo(board: Board, posA: Position, posB: Position): SpecialComboResult;
  detonate(
    board: Board,
    batches: SpecialDetonationBatch[],
    destroyedTileIds: Set<number>,
    effects: SpecialTriggerEffect[],
    options?: SpecialDetonationOptions
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

    if (!tileA || !tileB || tileA.special === SpecialType.Rock || tileB.special === SpecialType.Rock) {
      return { executed: false, effects: [], destroyedTileIds: new Set() };
    }

    const handler = this.registry.findComboHandler(tileA, tileB);
    if (!handler) {
      return { executed: false, effects: [], destroyedTileIds: new Set() };
    }

    const destroyedTileIds = new Set<number>();
    const { effects, secondaryDetonations } = handler.execute(board, tileA, tileB, destroyedTileIds);

    if (secondaryDetonations.length > 0) {
      // Conversion combos explicitly detonate their striped/airplane partner;
      // other combo participants have already fired as part of the combo.
      const secondaryIds = new Set(secondaryDetonations.map(tile => tile.id));
      const alreadyTriggeredTileIds = new Set([tileA.id, tileB.id].filter(id => !secondaryIds.has(id)));
      this.detonate(board, [{ specials: secondaryDetonations }], destroyedTileIds, effects, { alreadyTriggeredTileIds });
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
    effects: SpecialTriggerEffect[],
    options: SpecialDetonationOptions = {}
  ): void {
    const queue: { tile: TileData; triggerColor?: TileColor }[] = [];
    for (const batch of batches) {
      for (const tile of batch.specials) {
        queue.push({ tile, triggerColor: batch.triggerColor });
      }
    }

    const processedIds = new Set(options.alreadyTriggeredTileIds);

    while (queue.length > 0) {
      const { tile, triggerColor } = queue.shift()!;
      if (tile.special === SpecialType.Rock || tile.special === SpecialType.None) continue;
      // An all-special match may replace one old special with a new one at the
      // same ID. Its copied original still fires, while the new board tile cannot.
      if (options.protectedTileIds?.has(tile.id) && board.get(tile.row, tile.col) === tile) continue;
      if (processedIds.has(tile.id)) continue;
      processedIds.add(tile.id);
      destroyedTileIds.add(tile.id);

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
          protectedTileIds: options.protectedTileIds,
        })
      );

      // Specials uncovered by this blast detonate without inheriting a trigger color.
      for (const uncovered of chained) {
        queue.push({ tile: uncovered });
      }
    }
  }
}
