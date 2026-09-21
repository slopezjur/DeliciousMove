import { ComboEffectType, SpecialTriggerEffect } from '../../core/specials/ISpecialHandler.ts';
import { ISoundService } from '../../audio/ISoundService.ts';
import { IBoardViewAnimator } from '../IBoardViewContracts.ts';

export interface EffectPresentationContext {
  boardView: Pick<IBoardViewAnimator,
    'tileSize' | 'boardPixelWidth' | 'boardPixelHeight' | 'vfx' | 'getTileSprite' | 'gridToLocal' | 'screenShake'>;
  sound: Pick<ISoundService, 'playSpecialLaser' | 'playBombExplosion' | 'playAirplaneFly'>;
  /** Local pixel position of the tile that triggered the effect. */
  position: { x: number; y: number };
}

/**
 * Renders the audiovisual response to one special detonation. Registering a presenter
 * is the only thing a new special candy needs in the view layer (OCP).
 */
export interface IEffectPresenter {
  canPresent(effectType: ComboEffectType): boolean;
  present(effect: SpecialTriggerEffect, context: EffectPresentationContext): Promise<void> | void;
}

export interface IEffectPresenterRegistry {
  register(presenter: IEffectPresenter): void;
  present(effect: SpecialTriggerEffect, context: EffectPresentationContext): Promise<void>;
}
