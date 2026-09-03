import { SpecialType } from '../../core/TileTypes.ts';
import { ComboEffectType, SpecialTriggerEffect } from '../../core/specials/ISpecialHandler.ts';
import { EffectPresentationContext, IEffectPresenter } from './IEffectPresenter.ts';

export class AirplaneFlightPresenter implements IEffectPresenter {
  public canPresent(effectType: ComboEffectType): boolean {
    return (
      effectType === SpecialType.Airplane ||
      effectType === 'combo_airplane_airplane' ||
      effectType === 'combo_airplane_striped' ||
      effectType === 'combo_airplane_wrapped' ||
      effectType === 'combo_color_bomb_airplane'
    );
  }

  public async present(effect: SpecialTriggerEffect, ctx: EffectPresentationContext): Promise<void> {
    // 1. Hide stationary board tile so it morphs cleanly into the airborne projectile
    const sourceSprite = ctx.boardView.getTileSprite(effect.sourceTile.id);
    if (sourceSprite) {
      sourceSprite.visible = false;
    }

    // Also hide any launching partner special tiles in combos immediately so they don't linger as ghost sprites
    if (effect.affectedTileIds && effect.effectType.startsWith('combo_')) {
      for (const id of effect.affectedTileIds) {
        const sprite = ctx.boardView.getTileSprite(id);
        if (
          sprite &&
          Math.abs(sprite.x - ctx.position.x) < ctx.boardView.tileSize * 1.5 &&
          Math.abs(sprite.y - ctx.position.y) < ctx.boardView.tileSize * 1.5
        ) {
          sprite.visible = false;
        }
      }
    }

    // 2. Takeoff shockwave and fly sound
    ctx.boardView.vfx.createShockwave(ctx.position.x, ctx.position.y, ctx.boardView.tileSize * 1.5);
    ctx.sound.playAirplaneFly?.();

    // 2. Fly airplanes to target(s) via IVFXManager (SRP & LSP)
    const targets = [];
    if (effect.targetTile) targets.push(effect.targetTile);
    if (effect.secondaryTargets) targets.push(...effect.secondaryTargets);

    const flights: Promise<void>[] = [];
    for (const target of targets) {
      const targetPos = ctx.boardView.gridToLocal(target.row, target.col);
      flights.push(
        ctx.boardView.vfx.launchAirplane(
          ctx.position.x,
          ctx.position.y,
          targetPos.x,
          targetPos.y,
          () => this.triggerImpact(effect.effectType, targetPos, ctx)
        )
      );
    }

    await Promise.all(flights);
  }

  private triggerImpact(
    effectType: ComboEffectType,
    target: { x: number; y: number },
    ctx: EffectPresentationContext
  ): void {
    if (effectType === 'combo_airplane_striped') {
      ctx.boardView.vfx.createLaserBeam(target.x, target.y, ctx.boardView.boardPixelWidth, true);
      ctx.boardView.vfx.createLaserBeam(target.x, target.y, ctx.boardView.boardPixelHeight, false);
      ctx.sound.playSpecialLaser();
    } else if (effectType === 'combo_airplane_wrapped') {
      ctx.boardView.vfx.createShockwave(target.x, target.y, ctx.boardView.tileSize * 3);
      ctx.boardView.screenShake(10);
      ctx.sound.playBombExplosion();
    } else {
      ctx.boardView.vfx.createShockwave(target.x, target.y, ctx.boardView.tileSize * 1.8);
      ctx.boardView.vfx.createParticleBurst(target.x, target.y, 0x00e5ff as any);
      ctx.sound.playBombExplosion();
    }
  }
}
