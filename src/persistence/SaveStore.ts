import { GameState } from '../core/GameSession.ts';
import { IStorage } from './Storage.ts';
import { GameSave, ISaveCodec, SaveCodec, SaveError } from './SaveCodec.ts';

export const SAVE_KEY = 'deliciousmove.save';
export const BACKUP_KEY = 'deliciousmove.save.backup';
export type SaveStatus = 'none' | 'saved' | 'unavailable' | 'invalid' | 'newer' | 'incompatible' | 'recovered';

export class SaveStore {
  public status: SaveStatus = 'none';
  private blocked = false;

  constructor(private readonly storage: IStorage, private readonly codec: ISaveCodec = new SaveCodec()) {}

  public load(): GameSave | null {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return null;
      try {
        const save = this.codec.decode(raw);
        this.status = 'saved';
        return save;
      } catch (error) {
        this.blocked = true;
        this.status = error instanceof SaveError ? error.kind : 'invalid';
        if (this.status === 'invalid') {
          const backup = this.storage.getItem(BACKUP_KEY);
          if (backup) {
            try {
              const recovered = this.codec.decode(backup);
              this.status = 'recovered';
              return recovered;
            } catch { /* Retain the unreadable original and backup. */ }
          }
        }
        return null;
      }
    } catch {
      this.blocked = true;
      this.status = 'unavailable';
      return null;
    }
  }

  public save(save: GameSave): boolean {
    if (this.blocked || save.session.state !== GameState.Victory) return false;
    try {
      const raw = this.codec.encode(save);
      const previous = this.storage.getItem(SAVE_KEY);
      if (previous) {
        // Never rotate an invalid/unsupported save into the known-good backup.
        this.codec.decode(previous);
        this.storage.setItem(BACKUP_KEY, previous);
      }
      this.storage.setItem(SAVE_KEY, raw);
      this.status = 'saved';
      return true;
    } catch (error) {
      this.status = error instanceof SaveError ? error.kind : 'unavailable';
      this.blocked = true;
      return false;
    }
  }

  /** Called only for an explicit New Game action; preserve displaced data before replacing it. */
  public beginNewRun(): void {
    try {
      const previous = this.storage.getItem(SAVE_KEY);
      if (previous) {
        const prefix = SAVE_KEY + '.recovery.' + Date.now();
        let key = prefix, suffix = 0;
        while (this.storage.getItem(key) !== null) key = prefix + '.' + ++suffix;
        this.storage.setItem(key, previous);
      }
      this.storage.removeItem(SAVE_KEY);
      this.blocked = false;
      this.status = 'none';
    } catch {
      this.blocked = true;
      this.status = 'unavailable';
    }
  }

  public suspend(): void {
    this.blocked = true;
    this.status = 'incompatible';
  }
}
