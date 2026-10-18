import { SpecialType } from './TileTypes.ts';

/** Canonical combinations shared by mastery tracking and prepared lessons. */
export const COMBOS = [
  { id: 'cross', first: SpecialType.StripedHorizontal, second: SpecialType.StripedVertical },
  { id: 'giantCross', first: SpecialType.StripedHorizontal, second: SpecialType.Wrapped },
  { id: 'giantWrapped', first: SpecialType.Wrapped, second: SpecialType.Wrapped },
  { id: 'color', first: SpecialType.ColorBomb, second: SpecialType.None },
  { id: 'colorStriped', first: SpecialType.ColorBomb, second: SpecialType.StripedHorizontal },
  { id: 'doubleBomb', first: SpecialType.ColorBomb, second: SpecialType.ColorBomb },
  { id: 'planes', first: SpecialType.Airplane, second: SpecialType.Airplane },
  { id: 'planeStriped', first: SpecialType.Airplane, second: SpecialType.StripedHorizontal },
  { id: 'planeWrapped', first: SpecialType.Airplane, second: SpecialType.Wrapped },
  { id: 'colorPlane', first: SpecialType.ColorBomb, second: SpecialType.Airplane },
] as const;
export type ComboId = typeof COMBOS[number]['id'];

export function comboId(a: SpecialType, b: SpecialType): ComboId | undefined {
  const normalize = (s: SpecialType) => s === SpecialType.StripedVertical ? SpecialType.StripedHorizontal : s;
  return COMBOS.find(c => (normalize(c.first) === normalize(a) && normalize(c.second) === normalize(b))
    || (normalize(c.first) === normalize(b) && normalize(c.second) === normalize(a)))?.id;
}
