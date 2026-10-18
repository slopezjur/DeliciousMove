import type { IStripePerk } from '../Journey.ts';
import { SpecialType } from '../TileTypes.ts';
import type { ISpecialEffectHandler, SpecialDetonationContext, SpecialTriggerEffect } from './ISpecialHandler.ts';

/** Extra lines use the ordinary handler, including rock and special protection. */
export class PerkStripeHandler implements ISpecialEffectHandler {
  readonly supportedType: SpecialType;
  constructor(private readonly base: ISpecialEffectHandler, private readonly perks: IStripePerk) {
    this.supportedType = base.supportedType;
  }

  execute(context: SpecialDetonationContext): SpecialTriggerEffect {
    const effect = this.base.execute(context);
    if (!this.perks.consumeStripe(context.board)) return effect;
    const horizontal = this.supportedType === SpecialType.StripedHorizontal;
    const source = context.sourceTile;
    const row = horizontal ? (source.row + 1 < context.board.rows ? source.row + 1 : source.row - 1) : source.row;
    const col = horizontal ? source.col : (source.col + 1 < context.board.cols ? source.col + 1 : source.col - 1);
    const extra = this.base.execute({ ...context, sourceTile: { ...source, row, col } });
    return { ...effect, extraEffects: [extra] };
  }
}
