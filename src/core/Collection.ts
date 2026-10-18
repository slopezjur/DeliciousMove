import { COMBOS, type ComboId } from './SpecialCombinations.ts';

export const THEMES = ['classic', 'mint', 'cocoa', 'royal'] as const;
export type BoardTheme = typeof THEMES[number];
export interface DailyResult { score: number; moves: number }
export interface CollectionData {
  version: 1;
  combos: ComboId[];
  tripleDelivery: boolean;
  bankless: boolean;
  theme: BoardTheme;
  daily: Record<string, DailyResult>;
}

export function themeUnlocked(data: Readonly<CollectionData>, theme: BoardTheme): boolean {
  return theme === 'classic' || (theme === 'mint' && data.bankless)
    || (theme === 'cocoa' && data.tripleDelivery) || (theme === 'royal' && data.combos.length === COMBOS.length);
}

export interface ICollectionReader {
  readonly status: 'available' | 'unavailable' | 'preserved';
  snapshot(): CollectionData;
  unlocked(theme: BoardTheme): boolean;
}

export interface ICollectionRecorder {
  observe(combos: readonly ComboId[], deliveredInTurn: number): void;
  completeLevel(bankless: boolean): void;
  recordDaily(key: string, result: DailyResult): void;
}

export interface ICollectionPreferences extends ICollectionReader {
  chooseTheme(theme: BoardTheme): void;
}

export interface ICollectionStore extends ICollectionPreferences, ICollectionRecorder {}
