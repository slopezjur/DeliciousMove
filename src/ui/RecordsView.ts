import { LanguageService } from '../i18n/LanguageService.ts';
import { RecordsStore } from '../persistence/RecordsStore.ts';

export class RecordsView {
  constructor(private readonly records: RecordsStore, private readonly language: LanguageService) {
    language.subscribe(() => this.render());
  }

  render(): void {
    if (typeof document === 'undefined') return;
    const snapshot = this.records.getSnapshot();
    for (const [id, value] of [['best-level-value', snapshot.bestLevel], ['best-score-value', snapshot.bestScore]] as const) {
      const element = document.getElementById(id);
      if (element) element.textContent = value.toLocaleString(this.language.locale);
    }
    const warning = document.getElementById('records-status');
    if (warning) {
      warning.classList.toggle('hidden', this.records.status === 'available');
      warning.textContent = this.records.status === 'available' ? '' : this.language.t(
        this.records.status === 'unavailable' ? 'recordsUnavailable' : 'recordsPreserved');
    }
  }
}
