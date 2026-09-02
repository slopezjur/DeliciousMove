import { Board } from './Board.ts';
import { TileData, SpecialType, TileColor, Position } from './TileTypes.ts';

export interface SpecialTriggerEffect {
  sourceTile: TileData;
  affectedTileIds: number[];
  effectType: SpecialType | 'combo_cross' | 'combo_color_bomb_striped' | 'combo_double_color_bomb' | 'combo_giant_cross' | 'combo_giant_wrapped';
}

export class SpecialResolver {
  /**
   * Resolves direct combo swaps between two special candies (e.g. Color Bomb + Striped, Striped + Striped).
   * Returns affected tiles and whether a special combo was executed.
   */
  public static resolveSpecialSwapCombo(
    board: Board,
    posA: Position,
    posB: Position
  ): { executed: boolean; effects: SpecialTriggerEffect[]; destroyedTileIds: Set<number> } {
    const tileA = board.get(posA.row, posA.col);
    const tileB = board.get(posB.row, posB.col);

    if (!tileA || !tileB) {
      return { executed: false, effects: [], destroyedTileIds: new Set() };
    }

    const destroyed = new Set<number>();
    const effects: SpecialTriggerEffect[] = [];

    const isStriped = (s: SpecialType) => s === SpecialType.StripedHorizontal || s === SpecialType.StripedVertical;

    // 1. Color Bomb + Color Bomb (Clear entire board)
    if (tileA.special === SpecialType.ColorBomb && tileB.special === SpecialType.ColorBomb) {
      destroyed.add(tileA.id);
      destroyed.add(tileB.id);
      board.forEachTile((t) => destroyed.add(t.id));
      effects.push({
        sourceTile: tileA,
        affectedTileIds: Array.from(destroyed),
        effectType: 'combo_double_color_bomb',
      });
      return { executed: true, effects, destroyedTileIds: destroyed };
    }

    // 2. Color Bomb + Striped
    if (
      (tileA.special === SpecialType.ColorBomb && isStriped(tileB.special)) ||
      (tileB.special === SpecialType.ColorBomb && isStriped(tileA.special))
    ) {
      const bomb = tileA.special === SpecialType.ColorBomb ? tileA : tileB;
      const striped = tileA.special === SpecialType.ColorBomb ? tileB : tileA;
      const targetColor = striped.color;

      destroyed.add(bomb.id);
      destroyed.add(striped.id);

      // Convert all target color tiles to random striped candies, then detonate
      const convertedTiles: TileData[] = [];
      board.forEachTile((t) => {
        if (t.color === targetColor && t.id !== striped.id) {
          t.special = Math.random() > 0.5 ? SpecialType.StripedHorizontal : SpecialType.StripedVertical;
          convertedTiles.push(t);
        }
      });

      // Detonate the original striped tile + converted tiles
      this.collectSpecialEffects(board, [striped, ...convertedTiles], destroyed, effects);

      effects.unshift({
        sourceTile: bomb,
        affectedTileIds: convertedTiles.map((t) => t.id),
        effectType: 'combo_color_bomb_striped',
      });
      return { executed: true, effects, destroyedTileIds: destroyed };
    }

    // 3. Color Bomb + Normal Tile
    if (tileA.special === SpecialType.ColorBomb || tileB.special === SpecialType.ColorBomb) {
      const bomb = tileA.special === SpecialType.ColorBomb ? tileA : tileB;
      const normal = tileA.special === SpecialType.ColorBomb ? tileB : tileA;
      const targetColor = normal.color;

      destroyed.add(bomb.id);
      destroyed.add(normal.id);

      const targetIds: number[] = [];
      board.forEachTile((t) => {
        if (t.color === targetColor) {
          destroyed.add(t.id);
          targetIds.push(t.id);
        }
      });

      effects.push({
        sourceTile: bomb,
        affectedTileIds: targetIds,
        effectType: SpecialType.ColorBomb,
      });

      // Also trigger any specials among the destroyed tiles
      const triggerQueue: TileData[] = [];
      board.forEachTile((t) => {
        if (targetIds.includes(t.id) && t.special !== SpecialType.None) {
          triggerQueue.push(t);
        }
      });
      if (triggerQueue.length > 0) {
        this.collectSpecialEffects(board, triggerQueue, destroyed, effects);
      }

      return { executed: true, effects, destroyedTileIds: destroyed };
    }

    // 4. Striped + Striped (Cross row + column)
    if (isStriped(tileA.special) && isStriped(tileB.special)) {
      destroyed.add(tileA.id);
      destroyed.add(tileB.id);

      const centerRow = tileB.row;
      const centerCol = tileB.col;
      const affected: number[] = [];

      for (let c = 0; c < board.cols; c++) {
        const t = board.get(centerRow, c);
        if (t) {
          destroyed.add(t.id);
          affected.push(t.id);
        }
      }
      for (let r = 0; r < board.rows; r++) {
        const t = board.get(r, centerCol);
        if (t) {
          destroyed.add(t.id);
          affected.push(t.id);
        }
      }

      effects.push({
        sourceTile: tileB,
        affectedTileIds: affected,
        effectType: 'combo_cross',
      });

      this.triggerCascadingSpecials(board, affected, destroyed, effects);
      return { executed: true, effects, destroyedTileIds: destroyed };
    }

    // 5. Striped + Wrapped (Giant 3-line cross)
    if (
      (isStriped(tileA.special) && tileB.special === SpecialType.Wrapped) ||
      (isStriped(tileB.special) && tileA.special === SpecialType.Wrapped)
    ) {
      destroyed.add(tileA.id);
      destroyed.add(tileB.id);

      const centerRow = tileB.row;
      const centerCol = tileB.col;
      const affected: number[] = [];

      // 3 rows
      for (let r = centerRow - 1; r <= centerRow + 1; r++) {
        if (r >= 0 && r < board.rows) {
          for (let c = 0; c < board.cols; c++) {
            const t = board.get(r, c);
            if (t) {
              destroyed.add(t.id);
              affected.push(t.id);
            }
          }
        }
      }

      // 3 cols
      for (let c = centerCol - 1; c <= centerCol + 1; c++) {
        if (c >= 0 && c < board.cols) {
          for (let r = 0; r < board.rows; r++) {
            const t = board.get(r, c);
            if (t) {
              destroyed.add(t.id);
              affected.push(t.id);
            }
          }
        }
      }

      effects.push({
        sourceTile: tileB,
        affectedTileIds: affected,
        effectType: 'combo_giant_cross',
      });

      this.triggerCascadingSpecials(board, affected, destroyed, effects);
      return { executed: true, effects, destroyedTileIds: destroyed };
    }

    // 6. Wrapped + Wrapped (Giant 5x5 explosion)
    if (tileA.special === SpecialType.Wrapped && tileB.special === SpecialType.Wrapped) {
      destroyed.add(tileA.id);
      destroyed.add(tileB.id);

      const centerRow = tileB.row;
      const centerCol = tileB.col;
      const affected: number[] = [];

      for (let r = centerRow - 2; r <= centerRow + 2; r++) {
        for (let c = centerCol - 2; c <= centerCol + 2; c++) {
          const t = board.get(r, c);
          if (t) {
            destroyed.add(t.id);
            affected.push(t.id);
          }
        }
      }

      effects.push({
        sourceTile: tileB,
        affectedTileIds: affected,
        effectType: 'combo_giant_wrapped',
      });

      this.triggerCascadingSpecials(board, affected, destroyed, effects);
      return { executed: true, effects, destroyedTileIds: destroyed };
    }

    return { executed: false, effects: [], destroyedTileIds: new Set() };
  }

  /**
   * Explodes single special candies that are caught inside normal matches or secondary explosions.
   */
  public static collectSpecialEffects(
    board: Board,
    specialsToDetonate: TileData[],
    destroyedTileIds: Set<number>,
    effects: SpecialTriggerEffect[]
  ): void {
    const queue = [...specialsToDetonate];
    const processedIds = new Set<number>();

    while (queue.length > 0) {
      const tile = queue.shift()!;
      if (processedIds.has(tile.id)) continue;
      processedIds.add(tile.id);
      destroyedTileIds.add(tile.id);

      const affected: number[] = [];

      switch (tile.special) {
        case SpecialType.StripedHorizontal: {
          for (let c = 0; c < board.cols; c++) {
            const t = board.get(tile.row, c);
            if (t) {
              affected.push(t.id);
              destroyedTileIds.add(t.id);
              if (t.special !== SpecialType.None && !processedIds.has(t.id)) {
                queue.push(t);
              }
            }
          }
          effects.push({
            sourceTile: tile,
            affectedTileIds: affected,
            effectType: SpecialType.StripedHorizontal,
          });
          break;
        }

        case SpecialType.StripedVertical: {
          for (let r = 0; r < board.rows; r++) {
            const t = board.get(r, tile.col);
            if (t) {
              affected.push(t.id);
              destroyedTileIds.add(t.id);
              if (t.special !== SpecialType.None && !processedIds.has(t.id)) {
                queue.push(t);
              }
            }
          }
          effects.push({
            sourceTile: tile,
            affectedTileIds: affected,
            effectType: SpecialType.StripedVertical,
          });
          break;
        }

        case SpecialType.Wrapped: {
          for (let r = tile.row - 1; r <= tile.row + 1; r++) {
            for (let c = tile.col - 1; c <= tile.col + 1; c++) {
              const t = board.get(r, c);
              if (t) {
                affected.push(t.id);
                destroyedTileIds.add(t.id);
                if (t.special !== SpecialType.None && !processedIds.has(t.id)) {
                  queue.push(t);
                }
              }
            }
          }
          effects.push({
            sourceTile: tile,
            affectedTileIds: affected,
            effectType: SpecialType.Wrapped,
          });
          break;
        }

        case SpecialType.ColorBomb: {
          // Color bomb triggered indirectly selects the most abundant color on board
          const colorCounts = new Map<TileColor, number>();
          board.forEachTile((t) => {
            colorCounts.set(t.color, (colorCounts.get(t.color) || 0) + 1);
          });
          let maxColor = TileColor.Red;
          let maxCount = -1;
          colorCounts.forEach((count, color) => {
            if (count > maxCount) {
              maxCount = count;
              maxColor = color;
            }
          });

          board.forEachTile((t) => {
            if (t.color === maxColor) {
              affected.push(t.id);
              destroyedTileIds.add(t.id);
              if (t.special !== SpecialType.None && !processedIds.has(t.id)) {
                queue.push(t);
              }
            }
          });

          effects.push({
            sourceTile: tile,
            affectedTileIds: affected,
            effectType: SpecialType.ColorBomb,
          });
          break;
        }
      }
    }
  }

  private static triggerCascadingSpecials(
    board: Board,
    affectedIds: number[],
    destroyed: Set<number>,
    effects: SpecialTriggerEffect[]
  ): void {
    const specials: TileData[] = [];
    board.forEachTile((t) => {
      if (affectedIds.includes(t.id) && t.special !== SpecialType.None) {
        specials.push(t);
      }
    });
    if (specials.length > 0) {
      this.collectSpecialEffects(board, specials, destroyed, effects);
    }
  }
}
