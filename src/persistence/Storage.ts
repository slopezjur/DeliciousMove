export interface IStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements IStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

/** Access is lazy: blocked browser storage must not prevent game startup. */
export class BrowserStorage implements IStorage {
  public removeItem(key: string): void { window.localStorage.removeItem(key); }
  public getItem(key: string): string | null { return window.localStorage.getItem(key); }
  public setItem(key: string, value: string): void { window.localStorage.setItem(key, value); }
}
