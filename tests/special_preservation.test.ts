import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { SpecialType, TileColor } from '../src/core/TileTypes.ts';
import { SpecialResolver, SpecialTriggerEffect } from '../src/core/SpecialResolver.ts';
import { SpecialRegistry, ColorBombAirplaneComboHandler, ColorBombStripedComboHandler } from '../src/core/specials/SpecialRegistry.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';

const specials = [SpecialType.StripedHorizontal, SpecialType.StripedVertical, SpecialType.Wrapped, SpecialType.ColorBomb, SpecialType.Airplane];
function board() {
  const result = new Board(5, 5);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) result.createTile(r, c, TileColor.Red);
  return result;
}

describe('incidental specials survive blasts', () => {
  it.each(specials.filter(s => s !== SpecialType.Airplane))('%s preserves every other special in its blast', sourceType => {
    for (const otherType of specials) {
      const b = board(), source = b.get(2, 2)!, other = b.get(2, 3)!;
      source.special = sourceType;
      if (sourceType === SpecialType.StripedVertical) { b.swap(other, { row: 3, col: 2 }); }
      other.special = otherType;
      const destroyed = new Set<number>(), effects: SpecialTriggerEffect[] = [];
      new SpecialResolver().detonate(b, [{ specials: [source], triggerColor: TileColor.Red }], destroyed, effects);
      expect(destroyed.has(other.id)).toBe(false);
      expect(effects.map(e => e.sourceTile.id)).toEqual([source.id]);
      expect(other.special).toBe(otherType);
    }
  });

  it.each([
    [SpecialType.StripedHorizontal, SpecialType.StripedVertical],
    [SpecialType.StripedHorizontal, SpecialType.Wrapped],
    [SpecialType.Wrapped, SpecialType.Wrapped],
    [SpecialType.ColorBomb, SpecialType.ColorBomb],
    [SpecialType.ColorBomb, SpecialType.None],
    [SpecialType.ColorBomb, SpecialType.Wrapped],
    [SpecialType.ColorBomb, SpecialType.StripedHorizontal],
  ])('combo %s + %s preserves a third special', (aType, bType) => {
    for (const otherType of specials) {
      const b = board(), a = b.get(2, 1)!, partner = b.get(2, 2)!, other = b.get(2, 3)!;
      a.special = aType; partner.special = bType; other.special = otherType;
      const result = new SpecialResolver(new SpecialRegistry(new SeededRandomSource(7))).resolveSpecialSwapCombo(b, a, partner);
      expect(result.executed).toBe(true);
      expect(result.destroyedTileIds.has(a.id)).toBe(true);
      expect(result.destroyedTileIds.has(partner.id)).toBe(true);
      expect(result.destroyedTileIds.has(other.id)).toBe(false);
      expect(other.special).toBe(otherType);
    }
  });

  it.each([SpecialType.StripedHorizontal, SpecialType.Airplane])('conversion into %s only replaces ordinary candies', partnerType => {
    const b = board(), bomb = b.get(2, 1)!, partner = b.get(2, 2)!, other = b.get(2, 3)!;
    bomb.special = SpecialType.ColorBomb; partner.special = partnerType; other.special = SpecialType.Wrapped;
    const handler = partnerType === SpecialType.Airplane ? new ColorBombAirplaneComboHandler() : new ColorBombStripedComboHandler();
    const result = handler.execute(b, bomb, partner, new Set());
    expect(other.special).toBe(SpecialType.Wrapped);
    expect(result.secondaryDetonations.some(t => t.id === other.id)).toBe(false);
  });

  it.each([SpecialType.None, SpecialType.Airplane, SpecialType.StripedHorizontal, SpecialType.Wrapped])(
    'plane + %s activates its landing special but not blast neighbors', partnerType => {
      const b = board(), plane = b.get(0, 0)!, partner = b.get(0, 1)!, target = b.get(3, 3)!;
      const neighbor = b.get(3, 4)!, takeoffNeighbor = b.get(1, 0)!;
      plane.special = SpecialType.Airplane; partner.special = partnerType;
      target.special = SpecialType.Wrapped; neighbor.special = SpecialType.ColorBomb; takeoffNeighbor.special = SpecialType.ColorBomb;
      const registry = new SpecialRegistry(new SeededRandomSource(7), {
        pick: (_board, candidates) => candidates.find(t => t.id === target.id) ?? candidates.find(t => t.special === SpecialType.None),
      });
      const resolver = new SpecialResolver(registry);
      let destroyed = new Set<number>(), effects: SpecialTriggerEffect[] = [];
      if (partnerType === SpecialType.None) resolver.detonate(b, [{ specials: [plane] }], destroyed, effects);
      else { const result = resolver.resolveSpecialSwapCombo(b, plane, partner); destroyed = result.destroyedTileIds; effects = result.effects; }
      expect(effects.some(e => e.sourceTile.id === target.id)).toBe(true);
      expect(destroyed.has(neighbor.id)).toBe(false);
      expect(destroyed.has(takeoffNeighbor.id)).toBe(false);
      expect(effects.filter(e => e.sourceTile.id === target.id)).toHaveLength(1);
    });
});
