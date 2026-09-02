import { ComboEffectType, SpecialTriggerEffect } from '../../core/specials/ISpecialHandler.ts';
import { ISoundService } from '../../audio/ISoundService.ts';
import { IBoardViewAnimator } from '../IBoardViewContracts.ts';

export interface EffectPresentationContext {
  boardView: IBoardViewAnimator;
  sound: ISoundService;
  /** Local pixel position of the tile that triggered the effect. */
  position: { x: number; y: number };
}

/**
 * Renders the audiovisual response to one special detonation. Registering a presenter
 * is the only thing a new special candy needs in the view layer (OCP).
 */
export interface IEffectPresenter {
  canPresent(effectType: ComboEffectType): boolean;
  present(effect: SpecialTriggerEffect, context: EffectPresentationContext): void;
}
