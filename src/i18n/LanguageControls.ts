import { LanguageService } from './LanguageService.ts';

/** Updates static DOM copy and exposes a language switch without touching game state. */
export class LanguageControls {
  constructor(private readonly language: LanguageService, onLayoutChanged: () => void) {
    this.render();
    language.subscribe(() => { this.render(); onLayoutChanged(); });
    document.getElementById('language-select')?.addEventListener('change', event => {
      const value = (event.target as HTMLSelectElement).value;
      if (value === 'en' || value === 'es') language.setLocale(value);
    });
    window.addEventListener('keydown', (event) => {
      const target = event.target;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey
        || (target instanceof HTMLElement && (target.isContentEditable
          || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))) return;
      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        language.toggle();
      }
    });
  }

  private render(): void {
    document.documentElement.lang = this.language.locale;
    for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = element.dataset.i18n!;
      if (this.language.isKey(key)) element.textContent = this.language.t(key);
    }
    for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
      const key = element.dataset.i18nTitle!;
      if (this.language.isKey(key)) element.title = this.language.t(key);
    }
    const selector = document.getElementById('language-select') as HTMLSelectElement | null;
    for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
      const key = element.dataset.i18nAriaLabel!;
      if (this.language.isKey(key)) element.setAttribute('aria-label', this.language.t(key));
    }
    if (selector) selector.value = this.language.locale;
  }
}
