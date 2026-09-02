import { Board } from '../Board.ts';
import { TileData, SpecialType, TileColor } from '../TileTypes.ts';

export type ComboEffectType =
  | SpecialType
  | 'combo_cross'
  | 'combo_color_bomb_striped'
  | 'combo_double_color_bomb'
  | 'combo_giant_cross'
  | 'combo_giant_wrapped';

export interface SpecialTriggerEffect {
  sourceTile: TileData;
  affectedTileIds: number[];
  effectType: ComboEffectType;
}

/**
 * Everything a special needs to detonate. Passed as a context object so new handlers
 * can consume extra information without changing every existing handler signature (OCP).
 */
export interface SpecialDetonationContext {
  board: Board;
  sourceTile: TileData;
  /** Accumulated destruction set for the current cascade step. */
  destroyedTileIds: Set<number>;
  /** Specials uncovered by this blast, to be detonated in turn. */
  triggerQueue: TileData[];
  /** Color of the match or blast that set this special off, when known. */
  triggerColor?: TileColor;
}

export interface ISpecialEffectHandler {
  readonly supportedType: SpecialType;
  execute(context: SpecialDetonationContext): SpecialTriggerEffect;
}

export interface ISpecialComboHandler {
  readonly name: string;
  canHandle(tileA: TileData, tileB: TileData): boolean;
  execute(
    board: Board,
    tileA: TileData,
    tileB: TileData,
    destroyedTileIds: Set<number>
  ): { effects: SpecialTriggerEffect[]; secondaryDetonations: TileData[] };
}
