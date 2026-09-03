/**
 * Abstraction for clipboard operations (DIP & SRP).
 * Separates presentation I/O from core domain models.
 */
export interface IClipboardService {
  copyText(text: string): Promise<boolean>;
}
