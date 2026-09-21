import { SpecialType } from '../../core/TileTypes.ts';
import { ComboEffectType, SpecialTriggerEffect } from '../../core/specials/ISpecialHandler.ts';
import { EffectPresentationContext, IEffectPresenter, IEffectPresenterRegistry } from './IEffectPresenter.ts';

export class StripedBeamPresenter implements IEffectPresenter {
  public canPresent(effectType: ComboEffectType): boolean {
    return (
      effectType === SpecialType.StripedHorizontal || effectType === SpecialType.StripedVertical
    );
  }

  public async present(effect: SpecialTriggerEffect, ctx: EffectPresentationContext): Promise<void> {
    const isHorizontal = effect.effectType === SpecialType.StripedHorizontal;
    const length = isHorizontal
      ? ctx.boardView.boardPixelWidth
      : ctx.boardView.boardPixelHeight;

    ctx.sound.playSpecialLaser();
    await ctx.boardView.vfx.createLaserBeam(
      isHorizontal ? ctx.boardView.boardPixelWidth / 2 : ctx.position.x,
      isHorizontal ? ctx.position.y : ctx.boardView.boardPixelHeight / 2, length, isHorizontal);
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

  public async present(effect: SpecialTriggerEffect, ctx: EffectPresentationContext): Promise<void> {
    const isGiant = effect.effectType === 'combo_giant_cross';
    const offsets = isGiant ? [-ctx.boardView.tileSize, 0, ctx.boardView.tileSize] : [0];
    const beams: (void | Promise<void>)[] = [];

    for (const offset of offsets) {
      beams.push(ctx.boardView.vfx.createLaserBeam(
        ctx.boardView.boardPixelWidth / 2,
        ctx.position.y + offset,
        ctx.boardView.boardPixelWidth,
        true
      ));
      beams.push(ctx.boardView.vfx.createLaserBeam(
        ctx.position.x + offset,
        ctx.boardView.boardPixelHeight / 2,
        ctx.boardView.boardPixelHeight,
        false
      ));
    }
    ctx.boardView.screenShake(isGiant ? 14 : 10);
    ctx.sound.playBombExplosion();
    await Promise.all(beams);
  }
}

export class ColorBombPresenter implements IEffectPresenter {
  public canPresent(effectType: ComboEffectType): boolean {
    return (
      effectType === SpecialType.ColorBomb ||
      effectType === 'combo_color_bomb_striped' ||
      effectType === 'combo_color_bomb_airplane' ||
      effectType === 'combo_double_color_bomb'
    );
  }

  public async present(effect: SpecialTriggerEffect, ctx: EffectPresentationContext): Promise<void> {
    const targets = effect.affectedTileIds.flatMap(id => {
      const sprite = ctx.boardView.getTileSprite(id);
      return sprite ? [{ x: sprite.x, y: sprite.y }] : [];
    });
    await ctx.boardView.vfx.createColorBombCharge?.(ctx.position.x, ctx.position.y, targets);
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

import { AirplaneFlightPresenter } from './AirplaneFlightPresenter.ts';

export class EffectPresenterRegistry implements IEffectPresenterRegistry {
  private presenters: IEffectPresenter[] = [];

  constructor(presenters?: IEffectPresenter[]) {
    this.presenters = presenters ?? [
      new StripedBeamPresenter(),
      new WrappedShockwavePresenter(),
      new CrossBeamPresenter(),
      new ColorBombPresenter(),
      new AirplaneFlightPresenter(),
    ];
  }

  public register(presenter: IEffectPresenter): void {
    this.presenters.push(presenter);
  }

  /** Plays the first presenter that claims the effect; unknown effects are silently skipped. */
  public async present(effect: SpecialTriggerEffect, context: EffectPresentationContext): Promise<void> {
    const presenter = this.presenters.find((p) => p.canPresent(effect.effectType));
    if (presenter) {
      await presenter.present(effect, context);
    }
  }
}
