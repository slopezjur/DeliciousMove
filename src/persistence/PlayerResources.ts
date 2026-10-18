import { GameOverReason } from '../core/GameSession.ts';
import { IStorage } from './Storage.ts';
import { isJourney, type JourneyState } from '../core/Journey.ts';

export const RESOURCES_KEY = 'deliciousmove.resources';
export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 30 * 60 * 1000;
export interface AttemptResources {
  journey?: JourneyState;
  checkpoint: string;
  level: number;
  bank: number;
  failed?: GameOverReason;
}
interface ResourceData {
  version: 2;
  lives: number;
  nextLifeAt: number | null;
  observedAt: number;
  attempt?: AttemptResources;
}
export interface LivesSnapshot { lives: number; maximum: number; secondsToNext: number }
export type ResourceStatus = 'available' | 'unavailable' | 'preserved';

export interface ILivesReader {
  readonly status: ResourceStatus;
  snapshot(): LivesSnapshot;
}

export interface IPlayerResources extends ILivesReader {
  getAttempt(checkpoint: string): AttemptResources | undefined;
  beginAttempt(checkpoint: string, level: number, bank: number, journey?: JourneyState): number;
  spendBank(checkpoint: string, level: number, bank: number): void;
  fail(checkpoint: string, level: number, bank: number, reason: GameOverReason): boolean;
  clearAttempt(): void;
}

/** Persistent consumables, never a mid-level board save. Failure debits are idempotent. */
export class PlayerResources implements IPlayerResources {
  private data: ResourceData;
  public status: ResourceStatus = 'available';
  constructor(private readonly storage: IStorage, private readonly now: () => number = Date.now) {
    this.data = { version: 2, lives: MAX_LIVES, nextLifeAt: null, observedAt: now() };
    this.refresh();
  }

  snapshot(): LivesSnapshot {
    this.refresh();
    return { lives: this.data.lives, maximum: MAX_LIVES,
      secondsToNext: this.data.nextLifeAt === null ? 0 : Math.max(0, Math.ceil((this.data.nextLifeAt - this.time()) / 1000)) };
  }

  getAttempt(checkpoint: string): AttemptResources | undefined {
    this.refresh();
    return this.data.attempt?.checkpoint === checkpoint ? structuredClone(this.data.attempt) : undefined;
  }

  beginAttempt(checkpoint: string, level: number, bank: number, journey?: JourneyState): number {
    this.refresh();
    const old = this.data.attempt;
    if (old?.checkpoint === checkpoint && old.level === level) bank = Math.min(bank, old.bank);
    this.data.attempt = { checkpoint, level, bank, ...(journey ? { journey: structuredClone(journey) } : {}) };
    this.persist();
    return bank;
  }

  spendBank(checkpoint: string, level: number, bank: number): void {
    this.refresh();
    const attempt = this.data.attempt;
    if (!attempt || attempt.checkpoint !== checkpoint || attempt.level !== level || bank >= attempt.bank) return;
    attempt.bank = bank;
    this.persist();
  }

  fail(checkpoint: string, level: number, bank: number, reason: GameOverReason): boolean {
    this.refresh();
    const old = this.data.attempt;
    if (old?.checkpoint === checkpoint && old.level === level && old.failed) return false;
    const same = old?.checkpoint === checkpoint && old.level === level;
    this.data.attempt = { checkpoint, level, bank: same ? Math.min(bank, old.bank) : bank, failed: reason,
      ...(same && old.journey ? { journey: structuredClone(old.journey) } : {}) };
    if (this.data.lives > 0) this.data.lives--;
    if (this.data.nextLifeAt === null) this.data.nextLifeAt = this.time() + LIFE_REGEN_MS;
    this.persist();
    return true;
  }

  clearAttempt(): void { this.refresh(); delete this.data.attempt; this.persist(); }

  private time(): number { return Math.max(this.data.observedAt, this.now()); }

  private refresh(): void {
    if (this.status === 'available') {
      try {
        const raw = this.storage.getItem(RESOURCES_KEY);
        if (raw) {
          let saved: ResourceData;
          try {
            const decoded = JSON.parse(raw);
            saved = decoded?.version === 1 ? { ...decoded, version: 2 } : decoded;
          } catch { this.status = 'preserved'; return; }
          if (!this.valid(saved)) { this.status = 'preserved'; return; }
          saved.observedAt = Math.max(saved.observedAt, this.data.observedAt);
          this.data = saved;
        }
      } catch { this.status = 'unavailable'; }
    }
    const time = this.time();
    this.data.observedAt = time;
    if (this.data.nextLifeAt !== null && time >= this.data.nextLifeAt) {
      const gained = Math.floor((time - this.data.nextLifeAt) / LIFE_REGEN_MS) + 1;
      this.data.lives = Math.min(MAX_LIVES, this.data.lives + gained);
      this.data.nextLifeAt = this.data.lives === MAX_LIVES ? null : this.data.nextLifeAt + gained * LIFE_REGEN_MS;
      this.persist();
    }
  }

  private valid(value: ResourceData): boolean {
    const natural = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
    if (!value || value.version !== 2 || !natural(value.lives) || value.lives > MAX_LIVES || !natural(value.observedAt)) return false;
    if (value.lives === MAX_LIVES ? value.nextLifeAt !== null : !natural(value.nextLifeAt)) return false;
    const a = value.attempt;
    return !a || (typeof a.checkpoint === 'string' && a.checkpoint.length < 200 && natural(a.level) && a.level > 0
      && natural(a.bank) && (a.journey === undefined || isJourney(a.journey))
      && (a.failed === undefined || Object.values(GameOverReason).includes(a.failed)));
  }

  private persist(): void {
    if (this.status !== 'available') return;
    try { this.storage.setItem(RESOURCES_KEY, JSON.stringify(this.data)); }
    catch { this.status = 'unavailable'; }
  }
}
