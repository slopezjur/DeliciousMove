import { Board } from '../Board.ts';
import { TileData, SpecialType, TileColor, Position } from '../TileTypes.ts';
import { IRandomSource, MathRandomSource } from '../random/IRandomSource.ts';
import {
  ISpecialEffectHandler,
  ISpecialComboHandler,
  ISpecialRegistry,
  SpecialDetonationContext,
  SpecialTriggerEffect,
} from './ISpecialHandler.ts';

const isStriped = (s: SpecialType) => s === SpecialType.StripedHorizontal || s === SpecialType.StripedVertical;

/**
 * Marks a tile for destruction and, when it carries its own special, queues it for a
 * chained detonation. Shared by every effect handler (DRY).
 */
function consumeTile(tile: TileData, context: SpecialDetonationContext, affected: number[]): void {
  if (tile.special === SpecialType.Rock || context.protectedTileIds?.has(tile.id)) return;
  affected.push(tile.id);
  context.destroyedTileIds.add(tile.id);
  if (tile.special !== SpecialType.None && tile.id !== context.sourceTile.id) {
    context.triggerQueue.push(tile);
  }
}

export class StripedHorizontalHandler implements ISpecialEffectHandler {
  public readonly supportedType = SpecialType.StripedHorizontal;
  public execute(context: SpecialDetonationContext): SpecialTriggerEffect {
    const { board, sourceTile } = context;
    const affected: number[] = [];
    for (let c = 0; c < board.cols; c++) {
      const t = board.get(sourceTile.row, c);
      if (t) consumeTile(t, context, affected);
    }
    return { sourceTile, affectedTileIds: affected, effectType: SpecialType.StripedHorizontal };
  }
}

export class StripedVerticalHandler implements ISpecialEffectHandler {
  public readonly supportedType = SpecialType.StripedVertical;
  public execute(context: SpecialDetonationContext): SpecialTriggerEffect {
    const { board, sourceTile } = context;
    const affected: number[] = [];
    for (let r = 0; r < board.rows; r++) {
      const t = board.get(r, sourceTile.col);
      if (t) consumeTile(t, context, affected);
    }
    return { sourceTile, affectedTileIds: affected, effectType: SpecialType.StripedVertical };
  }
}

export class WrappedHandler implements ISpecialEffectHandler {
  public readonly supportedType = SpecialType.Wrapped;
  public execute(context: SpecialDetonationContext): SpecialTriggerEffect {
    const { board, sourceTile } = context;
    const affected: number[] = [];
    for (let r = sourceTile.row - 1; r <= sourceTile.row + 1; r++) {
      for (let c = sourceTile.col - 1; c <= sourceTile.col + 1; c++) {
        const t = board.get(r, c);
        if (t) consumeTile(t, context, affected);
      }
    }
    return { sourceTile, affectedTileIds: affected, effectType: SpecialType.Wrapped };
  }
}

export class ColorBombHandler implements ISpecialEffectHandler {
  public readonly supportedType = SpecialType.ColorBomb;

  public execute(context: SpecialDetonationContext): SpecialTriggerEffect {
    const { board, sourceTile } = context;
    const targetColor = this.resolveTargetColor(context);

    const affected: number[] = [];
    board.forEachTile((t) => {
      if (t.color === targetColor) consumeTile(t, context, affected);
    });

    return { sourceTile, affectedTileIds: affected, effectType: SpecialType.ColorBomb };
  }

  /**
   * A bomb swallowed by a match clears the color of whatever set it off. Without that
   * context (e.g. a chained blast) it falls back to the most abundant color on the board.
   */
  private resolveTargetColor(context: SpecialDetonationContext): TileColor {
    if (context.triggerColor !== undefined) return context.triggerColor;

    const colorCounts = new Map<TileColor, number>();
    context.board.forEachTile((t) => {
      if (t.special === SpecialType.Rock || context.protectedTileIds?.has(t.id)) return;
      colorCounts.set(t.color, (colorCounts.get(t.color) || 0) + 1);
    });

    let maxColor = context.sourceTile.color;
    let maxCount = -1;
    colorCounts.forEach((count, color) => {
      if (count > maxCount) {
        maxCount = count;
        maxColor = color;
      }
    });
    return maxColor;
  }
}

export class AirplaneHandler implements ISpecialEffectHandler {
  public readonly supportedType = SpecialType.Airplane;
  private readonly random: IRandomSource;

  constructor(random: IRandomSource = new MathRandomSource()) {
    this.random = random;
  }

  public execute(context: SpecialDetonationContext): SpecialTriggerEffect {
    const { board, sourceTile } = context;
    const affected: number[] = [];

    // 1. Cross blast around takeoff cell
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of deltas) {
      const neighbor = board.get(sourceTile.row + dr, sourceTile.col + dc);
      if (neighbor) consumeTile(neighbor, context, affected);
    }

    // 2. Select target tile to fly to
    const target = this.pickTarget(context);
    if (target) {
      consumeTile(target, context, affected);
    }

    return {
      sourceTile,
      affectedTileIds: affected,
      effectType: SpecialType.Airplane,
      targetTile: target ? { row: target.row, col: target.col, id: target.id } : undefined,
    };
  }

  private pickTarget({ board, sourceTile, destroyedTileIds, protectedTileIds }: SpecialDetonationContext): TileData | null {
    const candidates: TileData[] = [];
    const specialCandidates: TileData[] = [];

    board.forEachTile((t) => {
      if (t.id === sourceTile.id || destroyedTileIds.has(t.id) || protectedTileIds?.has(t.id)) return;
      if (t.special === SpecialType.Rock) return; // Rocks are unbreakable and never targeted
      if (t.special !== SpecialType.None) {
        specialCandidates.push(t);
      } else {
        candidates.push(t);
      }
    });

    // Strategy: prioritize existing specials to trigger chain reactions
    if (specialCandidates.length > 0) {
      const idx = this.random.nextInt(specialCandidates.length);
      return specialCandidates[idx];
    }

    if (candidates.length > 0) {
      const idx = this.random.nextInt(candidates.length);
      return candidates[idx];
    }

    return null;
  }
}

// Combos
export class DoubleColorBombComboHandler implements ISpecialComboHandler {
  public readonly name = 'DoubleColorBomb';
  public canHandle(a: TileData, b: TileData): boolean {
    return a.special === SpecialType.ColorBomb && b.special === SpecialType.ColorBomb;
  }
  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    destroyed.add(a.id);
    destroyed.add(b.id);
    board.forEachTile((t) => {
      if (t.special !== SpecialType.Rock) destroyed.add(t.id);
    });
    return {
      effects: [
        {
          sourceTile: a,
          affectedTileIds: Array.from(destroyed),
          effectType: 'combo_double_color_bomb' as const,
        },
      ],
      secondaryDetonations: [],
    };
  }
}

export class ColorBombStripedComboHandler implements ISpecialComboHandler {
  public readonly name = 'ColorBombStriped';
  private readonly random: IRandomSource;

  constructor(random: IRandomSource = new MathRandomSource()) {
    this.random = random;
  }

  public canHandle(a: TileData, b: TileData): boolean {
    return (
      (a.special === SpecialType.ColorBomb && isStriped(b.special)) ||
      (b.special === SpecialType.ColorBomb && isStriped(a.special))
    );
  }

  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    const bomb = a.special === SpecialType.ColorBomb ? a : b;
    const striped = a.special === SpecialType.ColorBomb ? b : a;
    const targetColor = striped.color;

    destroyed.add(bomb.id);
    destroyed.add(striped.id);

    const converted: TileData[] = [];
    board.forEachTile((t) => {
      if (t.color === targetColor && t.special !== SpecialType.Rock && t.id !== striped.id && t.id !== bomb.id) {
        t.special =
          this.random.next() > 0.5 ? SpecialType.StripedHorizontal : SpecialType.StripedVertical;
        converted.push(t);
      }
    });

    const initialEffect: SpecialTriggerEffect = {
      sourceTile: bomb,
      affectedTileIds: converted.map((t) => t.id),
      effectType: 'combo_color_bomb_striped',
    };

    return {
      effects: [initialEffect],
      secondaryDetonations: [striped, ...converted],
    };
  }
}

export class ColorBombAirplaneComboHandler implements ISpecialComboHandler {
  public readonly name = 'ColorBombAirplane';

  public canHandle(a: TileData, b: TileData): boolean {
    return (
      (a.special === SpecialType.ColorBomb && b.special === SpecialType.Airplane) ||
      (b.special === SpecialType.ColorBomb && a.special === SpecialType.Airplane)
    );
  }

  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    const bomb = a.special === SpecialType.ColorBomb ? a : b;
    const plane = a.special === SpecialType.ColorBomb ? b : a;
    const targetColor = plane.color;

    destroyed.add(bomb.id);
    destroyed.add(plane.id);

    const converted: TileData[] = [];
    board.forEachTile((t) => {
      if (t.color === targetColor && t.special !== SpecialType.Rock && t.id !== plane.id && t.id !== bomb.id) {
        t.special = SpecialType.Airplane;
        converted.push(t);
      }
    });

    return {
      effects: [
        {
          sourceTile: bomb,
          affectedTileIds: converted.map((t) => t.id),
          effectType: 'combo_color_bomb_airplane' as const,
        },
      ],
      secondaryDetonations: [plane, ...converted],
    };
  }
}

export class ColorBombNormalComboHandler implements ISpecialComboHandler {
  public readonly name = 'ColorBombNormal';
  public canHandle(a: TileData, b: TileData): boolean {
    return a.special === SpecialType.ColorBomb || b.special === SpecialType.ColorBomb;
  }
  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    const bomb = a.special === SpecialType.ColorBomb ? a : b;
    const normal = a.special === SpecialType.ColorBomb ? b : a;
    const targetColor = normal.color;

    destroyed.add(bomb.id);
    destroyed.add(normal.id);

    const affected: number[] = [];
    const secondary: TileData[] = [];
    board.forEachTile((t) => {
      if (t.color === targetColor && t.special !== SpecialType.Rock && t.id !== bomb.id) {
        destroyed.add(t.id);
        affected.push(t.id);
        if (t.special !== SpecialType.None) secondary.push(t);
      }
    });

    return {
      effects: [{ sourceTile: bomb, affectedTileIds: affected, effectType: SpecialType.ColorBomb }],
      secondaryDetonations: secondary,
    };
  }
}

export class DoubleAirplaneComboHandler implements ISpecialComboHandler {
  public readonly name = 'DoubleAirplane';
  private readonly random: IRandomSource;

  constructor(random: IRandomSource = new MathRandomSource()) {
    this.random = random;
  }

  public canHandle(a: TileData, b: TileData): boolean {
    return a.special === SpecialType.Airplane && b.special === SpecialType.Airplane;
  }

  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    destroyed.add(a.id);
    destroyed.add(b.id);
    const affected: number[] = [a.id, b.id];
    const secondary: TileData[] = [];

    // Cross blast around both
    for (const source of [a, b]) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = board.get(source.row + dr, source.col + dc);
        if (n && n.special !== SpecialType.Rock && !destroyed.has(n.id)) {
          destroyed.add(n.id);
          affected.push(n.id);
          if (n.special !== SpecialType.None) secondary.push(n);
        }
      }
    }

    // Pick 3 distinct targets across the board
    const candidates: TileData[] = [];
    board.forEachTile((t) => {
      if (t.special !== SpecialType.Rock && !destroyed.has(t.id)) candidates.push(t);
    });

    const targets: (Position & { id: number })[] = [];
    for (let i = 0; i < 3 && candidates.length > 0; i++) {
      const idx = this.random.nextInt(candidates.length);
      const target = candidates.splice(idx, 1)[0];
      destroyed.add(target.id);
      affected.push(target.id);
      if (target.special !== SpecialType.None) secondary.push(target);
      targets.push({ row: target.row, col: target.col, id: target.id });
    }

    return {
      effects: [
        {
          sourceTile: b,
          affectedTileIds: affected,
          effectType: 'combo_airplane_airplane' as const,
          targetTile: targets[0],
          secondaryTargets: targets.slice(1),
        },
      ],
      secondaryDetonations: secondary,
    };
  }
}

export class AirplaneStripedComboHandler implements ISpecialComboHandler {
  public readonly name = 'AirplaneStriped';
  private readonly random: IRandomSource;

  constructor(random: IRandomSource = new MathRandomSource()) {
    this.random = random;
  }

  public canHandle(a: TileData, b: TileData): boolean {
    return (
      (a.special === SpecialType.Airplane && isStriped(b.special)) ||
      (b.special === SpecialType.Airplane && isStriped(a.special))
    );
  }

  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    const plane = a.special === SpecialType.Airplane ? a : b;
    const striped = a.special === SpecialType.Airplane ? b : a;

    destroyed.add(plane.id);
    destroyed.add(striped.id);
    const affected: number[] = [plane.id, striped.id];
    const secondary: TileData[] = [];

    const candidates: TileData[] = [];
    board.forEachTile((t) => {
      if (t.special !== SpecialType.Rock && !destroyed.has(t.id)) candidates.push(t);
    });

    let target: TileData | undefined;
    if (candidates.length > 0) {
      target = candidates[this.random.nextInt(candidates.length)];
    }

    if (target) {
      // Cross laser beam at target!
      for (let c = 0; c < board.cols; c++) {
        const t = board.get(target.row, c);
        if (t && t.special !== SpecialType.Rock && !destroyed.has(t.id)) {
          destroyed.add(t.id);
          affected.push(t.id);
          if (t.special !== SpecialType.None) secondary.push(t);
        }
      }
      for (let r = 0; r < board.rows; r++) {
        const t = board.get(r, target.col);
        if (t && t.special !== SpecialType.Rock && !destroyed.has(t.id)) {
          destroyed.add(t.id);
          affected.push(t.id);
          if (t.special !== SpecialType.None) secondary.push(t);
        }
      }
    }

    return {
      effects: [
        {
          sourceTile: plane,
          affectedTileIds: affected,
          effectType: 'combo_airplane_striped' as const,
          targetTile: target ? { row: target.row, col: target.col, id: target.id } : undefined,
        },
      ],
      secondaryDetonations: secondary,
    };
  }
}

export class AirplaneWrappedComboHandler implements ISpecialComboHandler {
  public readonly name = 'AirplaneWrapped';
  private readonly random: IRandomSource;

  constructor(random: IRandomSource = new MathRandomSource()) {
    this.random = random;
  }

  public canHandle(a: TileData, b: TileData): boolean {
    return (
      (a.special === SpecialType.Airplane && b.special === SpecialType.Wrapped) ||
      (b.special === SpecialType.Airplane && a.special === SpecialType.Wrapped)
    );
  }

  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    const plane = a.special === SpecialType.Airplane ? a : b;
    const wrapped = a.special === SpecialType.Airplane ? b : a;

    destroyed.add(plane.id);
    destroyed.add(wrapped.id);
    const affected: number[] = [plane.id, wrapped.id];
    const secondary: TileData[] = [];

    const candidates: TileData[] = [];
    board.forEachTile((t) => {
      if (t.special !== SpecialType.Rock && !destroyed.has(t.id)) candidates.push(t);
    });

    let target: TileData | undefined;
    if (candidates.length > 0) {
      target = candidates[this.random.nextInt(candidates.length)];
    }

    if (target) {
      // 3x3 blast at target!
      for (let r = target.row - 1; r <= target.row + 1; r++) {
        for (let c = target.col - 1; c <= target.col + 1; c++) {
          const t = board.get(r, c);
          if (t && t.special !== SpecialType.Rock && !destroyed.has(t.id)) {
            destroyed.add(t.id);
            affected.push(t.id);
            if (t.special !== SpecialType.None) secondary.push(t);
          }
        }
      }
    }

    return {
      effects: [
        {
          sourceTile: plane,
          affectedTileIds: affected,
          effectType: 'combo_airplane_wrapped' as const,
          targetTile: target ? { row: target.row, col: target.col, id: target.id } : undefined,
        },
      ],
      secondaryDetonations: secondary,
    };
  }
}

function destroyAndCollect(
  board: Board,
  r: number,
  c: number,
  destroyed: Set<number>,
  affected: number[],
  secondary: TileData[],
  excludeA: number,
  excludeB: number
): void {
  const t = board.get(r, c);
  if (!t || t.special === SpecialType.Rock || destroyed.has(t.id)) return;
  destroyed.add(t.id);
  affected.push(t.id);
  if (t.special !== SpecialType.None && t.id !== excludeA && t.id !== excludeB) {
    secondary.push(t);
  }
}

export class GiantCrossComboHandler implements ISpecialComboHandler {
  public readonly name = 'GiantCross';
  public canHandle(a: TileData, b: TileData): boolean {
    return (
      (isStriped(a.special) && b.special === SpecialType.Wrapped) ||
      (isStriped(b.special) && a.special === SpecialType.Wrapped)
    );
  }
  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    destroyed.add(a.id);
    destroyed.add(b.id);
    const affected: number[] = [a.id, b.id];
    const secondary: TileData[] = [];

    const center = b;
    for (let c = 0; c < board.cols; c++) {
      for (let dr = -1; dr <= 1; dr++) {
        destroyAndCollect(board, center.row + dr, c, destroyed, affected, secondary, a.id, b.id);
      }
    }
    for (let r = 0; r < board.rows; r++) {
      for (let dc = -1; dc <= 1; dc++) {
        destroyAndCollect(board, r, center.col + dc, destroyed, affected, secondary, a.id, b.id);
      }
    }

    return {
      effects: [{ sourceTile: center, affectedTileIds: affected, effectType: 'combo_giant_cross' as const }],
      secondaryDetonations: secondary,
    };
  }
}

export class CrossStripedComboHandler implements ISpecialComboHandler {
  public readonly name = 'CrossStriped';
  public canHandle(a: TileData, b: TileData): boolean {
    return isStriped(a.special) && isStriped(b.special);
  }
  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    destroyed.add(a.id);
    destroyed.add(b.id);
    const affected: number[] = [a.id, b.id];
    const secondary: TileData[] = [];

    for (let c = 0; c < board.cols; c++) {
      destroyAndCollect(board, b.row, c, destroyed, affected, secondary, a.id, b.id);
    }
    for (let r = 0; r < board.rows; r++) {
      destroyAndCollect(board, r, b.col, destroyed, affected, secondary, a.id, b.id);
    }

    return {
      effects: [{ sourceTile: b, affectedTileIds: affected, effectType: 'combo_cross' as const }],
      secondaryDetonations: secondary,
    };
  }
}

export class GiantWrappedComboHandler implements ISpecialComboHandler {
  public readonly name = 'GiantWrapped';
  public canHandle(a: TileData, b: TileData): boolean {
    return a.special === SpecialType.Wrapped && b.special === SpecialType.Wrapped;
  }
  public execute(board: Board, a: TileData, b: TileData, destroyed: Set<number>) {
    destroyed.add(a.id);
    destroyed.add(b.id);
    const affected: number[] = [a.id, b.id];
    const secondary: TileData[] = [];

    for (let r = b.row - 2; r <= b.row + 2; r++) {
      for (let c = b.col - 2; c <= b.col + 2; c++) {
        destroyAndCollect(board, r, c, destroyed, affected, secondary, a.id, b.id);
      }
    }

    return {
      effects: [{ sourceTile: b, affectedTileIds: affected, effectType: 'combo_giant_wrapped' as const }],
      secondaryDetonations: secondary,
    };
  }
}

export class SpecialRegistry implements ISpecialRegistry {
  private effectHandlers = new Map<SpecialType, ISpecialEffectHandler>();
  private comboHandlers: { handler: ISpecialComboHandler; priority: number }[] = [];

  constructor(random: IRandomSource = new MathRandomSource()) {
    this.registerDefaultHandlers(random);
  }

  public registerEffectHandler(handler: ISpecialEffectHandler): void {
    this.effectHandlers.set(handler.supportedType, handler);
  }

  public registerComboHandler(handler: ISpecialComboHandler, priority = 0): void {
    this.comboHandlers.push({ handler, priority });
    this.comboHandlers.sort((a, b) => a.priority - b.priority);
  }

  public getEffectHandler(type: SpecialType): ISpecialEffectHandler | undefined {
    return this.effectHandlers.get(type);
  }

  public findComboHandler(a: TileData, b: TileData): ISpecialComboHandler | undefined {
    return this.comboHandlers.find(({ handler }) => handler.canHandle(a, b))?.handler;
  }

  private registerDefaultHandlers(random: IRandomSource): void {
    this.registerEffectHandler(new StripedHorizontalHandler());
    this.registerEffectHandler(new StripedVerticalHandler());
    this.registerEffectHandler(new WrappedHandler());
    this.registerEffectHandler(new ColorBombHandler());
    this.registerEffectHandler(new AirplaneHandler(random));

    // Priority ordering for combo matchers: most specific pairing first.
    this.registerComboHandler(new DoubleColorBombComboHandler());
    this.registerComboHandler(new ColorBombStripedComboHandler(random));
    this.registerComboHandler(new ColorBombAirplaneComboHandler());
    this.registerComboHandler(new DoubleAirplaneComboHandler(random));
    this.registerComboHandler(new AirplaneStripedComboHandler(random));
    this.registerComboHandler(new AirplaneWrappedComboHandler(random));
    this.registerComboHandler(new GiantCrossComboHandler());
    this.registerComboHandler(new GiantWrappedComboHandler());
    this.registerComboHandler(new CrossStripedComboHandler());
    this.registerComboHandler(new ColorBombNormalComboHandler(), 1000);
  }
}
