import { COMBOS, type ComboId } from '../core/SpecialCombinations.ts';
import type { IStorage } from './Storage.ts';
import { THEMES, themeUnlocked, type BoardTheme, type CollectionData, type DailyResult, type ICollectionStore } from '../core/Collection.ts';

export { THEMES } from '../core/Collection.ts';
export type { BoardTheme, CollectionData, DailyResult } from '../core/Collection.ts';

export const COLLECTION_KEY = 'deliciousmove.collection';

/** Cosmetic mastery and local daily results outlive individual campaign runs. */
export class CollectionStore implements ICollectionStore {
  private data: CollectionData = { version: 1, combos: [], tripleDelivery: false, bankless: false, theme: 'classic', daily: {} };
  status: 'available' | 'unavailable' | 'preserved' = 'available';
  constructor(private readonly storage: IStorage) { this.refresh(); }

  snapshot(): CollectionData { this.refresh(); return structuredClone(this.data); }

  unlocked(theme: BoardTheme): boolean {
    return themeUnlocked(this.data, theme);
  }

  observe(combos: readonly ComboId[], deliveredInTurn: number): void {
    this.update(() => {
      this.data.combos = [...new Set([...this.data.combos, ...combos])];
      this.data.tripleDelivery ||= deliveredInTurn >= 3;
    });
  }

  completeLevel(bankless: boolean): void { this.update(() => { this.data.bankless ||= bankless; }); }
  chooseTheme(theme: BoardTheme): void {
    this.update(() => { if (this.unlocked(theme)) this.data.theme = theme; });
  }

  recordDaily(key: string, result: DailyResult): void {
    this.update(() => {
      const old = this.data.daily[key];
      if (!old || result.score > old.score || (result.score === old.score && result.moves < old.moves)) this.data.daily[key] = { ...result };
      const keys = Object.keys(this.data.daily).sort();
      keys.slice(0, Math.max(0, keys.length - 120)).forEach(id => { delete this.data.daily[id]; });
    });
  }

  private update(change: () => void): void {
    this.refresh();
    const before = JSON.stringify(this.data);
    change();
    const raw = JSON.stringify(this.data);
    if (raw === before) return;
    if (this.status !== 'available') return;
    try { this.storage.setItem(COLLECTION_KEY, raw); }
    catch { this.status = 'unavailable'; }
  }

  private refresh(): void {
    if (this.status !== 'available') return;
    try {
      const raw = this.storage.getItem(COLLECTION_KEY);
      if (!raw) return;
      const value = JSON.parse(raw);
      if (!this.valid(value)) { this.status = 'preserved'; return; }
      this.data = value;
      if (!this.unlocked(this.data.theme)) this.data.theme = 'classic';
    } catch (error) { this.status = error instanceof SyntaxError ? 'preserved' : 'unavailable'; }
  }

  private valid(value: unknown): value is CollectionData {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const d = value as CollectionData;
    if (d.version !== 1 || typeof d.bankless !== 'boolean' || typeof d.tripleDelivery !== 'boolean'
      || !THEMES.includes(d.theme) || !Array.isArray(d.combos) || d.combos.length > COMBOS.length
      || new Set(d.combos).size !== d.combos.length || !d.combos.every(id => COMBOS.some(c => c.id === id))
      || !d.daily || typeof d.daily !== 'object' || Array.isArray(d.daily) || Object.keys(d.daily).length > 120) return false;
    return Object.entries(d.daily).every(([key, r]) => /^\d{4}-\d{2}-\d{2}:\d+$/.test(key) && r
      && Number.isSafeInteger(r.score) && r.score >= 0 && Number.isSafeInteger(r.moves) && r.moves >= 0);
  }
}
