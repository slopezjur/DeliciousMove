import type { Locale, MessageKey } from './LanguageService.ts';

/** Read-only messages for consumers that never change language preferences. */
export interface ITranslator {
  readonly locale: Locale;
  t(key: MessageKey, params?: Record<string, string | number>): string;
}

export interface ILocalization extends ITranslator {
  subscribe(listener: () => void): () => void;
}

export interface ILanguageService extends ILocalization {
  toggle(): void;
  setLocale(locale: Locale): void;
  isKey(value: string): value is MessageKey;
}
