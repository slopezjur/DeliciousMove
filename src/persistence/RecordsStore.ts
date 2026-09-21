import { GameState, SessionSaveState } from '../core/GameSession.ts';
import { IStorage } from './Storage.ts';

export const RECORDS_KEY = 'deliciousmove.records';
export interface PersonalRecords { bestLevel: number; bestScore: number }
export type RecordsStatus = 'available' | 'unavailable' | 'preserved';

export interface IRecordsReader {
  readonly status: RecordsStatus;
  getSnapshot(): PersonalRecords;
}

/** Separate lifetime records from the replaceable run checkpoint. Never writes mid-level. */
export class RecordsStore implements IRecordsReader {
  private records: PersonalRecords = { bestLevel: 0, bestScore: 0 };
  public status: RecordsStatus = 'available';

  constructor(private readonly storage: IStorage) { this.read(); }

  getSnapshot(): PersonalRecords { return { ...this.records }; }

  recordCompletedLevel(session: SessionSaveState): void {
    if (session.state !== GameState.Victory) return;
    if (![session.config.level, session.globalScore].every(n => Number.isSafeInteger(n) && n >= 0)) return;
    // Merge again so a stale tab cannot replace a newer, higher record.
    this.read();
    const next = { bestLevel: Math.max(this.records.bestLevel, session.config.level),
      bestScore: Math.max(this.records.bestScore, session.globalScore) };
    if (next.bestLevel === this.records.bestLevel && next.bestScore === this.records.bestScore) return;
    this.records = next;
    if (this.status !== 'available') return;
    try { this.storage.setItem(RECORDS_KEY, JSON.stringify({ version: 1, ...next })); }
    catch { this.status = 'unavailable'; }
  }

  private read(): void {
    try {
      const raw = this.storage.getItem(RECORDS_KEY);
      if (!raw) return;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { this.status = 'preserved'; return; }
      if (!parsed || parsed.version !== 1
        || ![parsed.bestLevel, parsed.bestScore].every(n => Number.isSafeInteger(n) && n >= 0)) {
        this.status = 'preserved'; return;
      }
      this.records.bestLevel = Math.max(this.records.bestLevel, parsed.bestLevel);
      this.records.bestScore = Math.max(this.records.bestScore, parsed.bestScore);
    } catch { this.status = 'unavailable'; }
  }
}
