import type { GameOverReason } from '../core/GameSession.ts';
import type { JourneyState } from '../core/Journey.ts';
import { MAX_LIVES, type AttemptResources, type IPlayerResources } from '../persistence/PlayerResources.ts';

/** Free lives with an in-memory attempt ledger; campaign storage is never touched. */
export class FreePlayResources implements IPlayerResources {
  readonly status = 'available' as const;
  private attempt?: AttemptResources;

  snapshot() { return { lives: MAX_LIVES, maximum: MAX_LIVES, secondsToNext: 0 }; }

  getAttempt(checkpoint: string): AttemptResources | undefined {
    return this.attempt?.checkpoint === checkpoint ? structuredClone(this.attempt) : undefined;
  }

  beginAttempt(checkpoint: string, level: number, bank: number, journey?: JourneyState): number {
    if (this.sameAttempt(checkpoint, level)) bank = Math.min(bank, this.attempt!.bank);
    this.attempt = { checkpoint, level, bank, ...(journey ? { journey: structuredClone(journey) } : {}) };
    return bank;
  }

  spendBank(checkpoint: string, level: number, bank: number): void {
    if (this.sameAttempt(checkpoint, level)) this.attempt!.bank = Math.min(this.attempt!.bank, bank);
  }

  fail(checkpoint: string, level: number, bank: number, failed: GameOverReason): boolean {
    const old = this.sameAttempt(checkpoint, level) ? this.attempt : undefined;
    if (old?.failed) return false;
    this.attempt = { checkpoint, level, bank: old ? Math.min(old.bank, bank) : bank, failed,
      ...(old?.journey ? { journey: structuredClone(old.journey) } : {}) };
    return true;
  }

  clearAttempt(): void { this.attempt = undefined; }

  private sameAttempt(checkpoint: string, level: number): boolean {
    return this.attempt?.checkpoint === checkpoint && this.attempt.level === level;
  }
}
