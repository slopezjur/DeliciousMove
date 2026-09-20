import { describe, it, expect, vi } from 'vitest';
import { LanguageService, LANGUAGE_KEY } from '../src/i18n/LanguageService.ts';

describe('language selection', () => {
  it.each([
    [undefined, 'en'], ['en-US', 'en'], ['en-GB', 'en'],
    ['es', 'es'], ['es-ES', 'es'], ['es-MX', 'es'], ['ES-ar', 'es'],
    ['fr-FR', 'en'], ['', 'en'],
  ])('uses browser preference %s with English fallback', (preferred, expected) => {
    expect(new LanguageService(undefined, preferred).locale).toBe(expected);
  });

  it('lets an explicit saved choice override the browser language', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const language = new LanguageService(storage, 'es-ES');
    const changed = vi.fn(), unsubscribe = language.subscribe(changed);
    language.toggle();
    expect(language.locale).toBe('en');
    expect(values.get(LANGUAGE_KEY)).toBe('en');
    expect(new LanguageService(storage, 'es-ES').locale).toBe('en');
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    language.toggle();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid preferences and tolerates disabled storage', () => {
    expect(new LanguageService({ getItem: () => 'fr', setItem() {} }, 'es').locale).toBe('es');
    const service = new LanguageService({
      getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); },
    }, 'es');
    expect(() => service.toggle()).not.toThrow();
    expect(service.locale).toBe('en');
  });

  it('translates templates and checks keys without accepting inherited properties', () => {
    const language = new LanguageService(undefined, 'es');
    expect(language.t('nextWaiting', { level: 4 })).toBe('¡Te espera el nivel 4!');
    language.toggle();
    expect(language.t('nextWaiting', { level: 4 })).toContain('4');
    expect(language.isKey('save_saved')).toBe(true);
    expect(language.isKey('toString')).toBe(false);
  });
});
