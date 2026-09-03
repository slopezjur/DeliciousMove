import { IClipboardService } from './IClipboardService.ts';

export class BrowserClipboardService implements IClipboardService {
  public async copyText(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
