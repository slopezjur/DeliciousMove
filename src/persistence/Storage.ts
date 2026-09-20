export interface IStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Access is lazy: blocked browser storage must not prevent game startup. */
export class BrowserStorage implements IStorage {
  public removeItem(key: string): void { window.localStorage.removeItem(key); }
  public getItem(key: string): string | null { return window.localStorage.getItem(key); }
  public setItem(key: string, value: string): void { window.localStorage.setItem(key, value); }
}
