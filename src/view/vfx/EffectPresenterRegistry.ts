import { SpecialType } from '../../core/TileTypes.ts';
import { ComboEffectType, SpecialTriggerEffect } from '../../core/specials/ISpecialHandler.ts';
import { EffectPresentationContext, IEffectPresenter } from './IEffectPresenter.ts';

export class StripedBeamPresenter implements IEffectPresenter {
  public canPresent(effectType: ComboEffectType): boolean {
    return (
      effectType === SpecialType.StripedHorizontal || effectType === SpecialType.StripedVertical
    );
  }

  public present(effect: SpecialTriggerEffect, ctx: EffectPresentationContext): void {
    const isHorizontal = effect.effectType === SpecialType.StripedHorizontal;
    const length = isHorizontal
      ? ctx.boardView.boardPixelWidth
      : ctx.boardView.boardPixelHeight;

    ctx.boardView.vfx.createLaserBeam(ctx.position.x, ctx.position.y, length, isHorizontal);
    ctx.sound.playSpecialLaser();
  }
}

export class WrappedShockwavePresenter implements IEffectPresenter {
  public canPresent(effectType: ComboEffectType): boolean {
    return effectType === SpecialType.Wrapped || effectType === 'combo_giant_wrapped';
  }

  public present(effect: SpecialTriggerEffect, ctx: EffectPresentationContext): void {
    const spread = effect.effectType === 'combo_giant_wrapped' ? 4 : 2.5;
    ctx.boardView.vfx.createShockwave(ctx.position.x, ctx.position.y, ctx.boardView.tileSize * spread);
    ctx.sound.playBombExplosion();
  }
}

export class CrossBeamPresenter implements IEffectPresenter {
  public canPresent(effectType: ComboEffectType): boolean {
    return effectType === 'combo_cross' || effectType === 'combo_giant_cross';
  }

  public present(_effect: SpecialTriggerEffect, ctx: EffectPresentationContext): void {
    ctx.boardView.vfx.createLaserBeam(
      ctx.position.x,
      ctx.position.y,
      ctx.boardView.boardPixelWidth,
      true
    );
    ctx.boardView.vfx.createLaserBeam(
      ctx.position.x,
      ctx.position.y,
      ctx.boardView.boardPixelHeight,
      false
    );
    ctx.boardView.screenShake(10);
    ctx.sound.playBombExplosion();
  }
}

export class ColorBombPresenter implements IEffectPresenter {
  public canPresent(effectType: ComboEffectType): boolean {
    return (
      effectType === SpecialType.ColorBomb ||
      effectType === 'combo_color_bomb_striped' ||
      effectType === 'combo_double_color_bomb'
    );
  }

  public present(effect: SpecialTriggerEffect, ctx: EffectPresentationContext): void {
    const intensity = effect.effectType === 'combo_double_color_bomb' ? 18 : 12;
    ctx.boardView.screenShake(intensity);
    ctx.boardView.vfx.createShockwave(
      ctx.position.x,
      ctx.position.y,
      ctx.boardView.tileSize * 3
    );
    ctx.sound.playBombExplosion();
  }
}

export class EffectPresenterRegistry {
  private presenters: IEffectPresenter[] = [];

  constructor(presenters?: IEffectPresenter[]) {
    this.presenters = presenters ?? [
      new StripedBeamPresenter(),
      new WrappedShockwavePresenter(),
      new CrossBeamPresenter(),
      new ColorBombPresenter(),
    ];
  }

  public register(presenter: IEffectPresenter): void {
    this.presenters.push(presenter);
  }

  /** Plays the first presenter that claims the effect; unknown effects are silently skipped. */
  public present(effect: SpecialTriggerEffect, context: EffectPresentationContext): void {
    this.presenters.find((p) => p.canPresent(effect.effectType))?.present(effect, context);
  }
}
