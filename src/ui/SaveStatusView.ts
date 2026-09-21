import { LanguageService } from '../i18n/LanguageService.ts';
import { SaveStatus } from '../persistence/SaveStore.ts';

/** Presents checkpoint status without reading or mutating persistence. */
export class SaveStatusView {
  private status: SaveStatus = 'none';

  constructor(private readonly language: LanguageService) {
    language.subscribe(() => this.render(this.status));
  }

  render(status: SaveStatus): void {
    this.status = status;
    if (typeof document === 'undefined') return;
    const element = document.getElementById('save-status');
    const detail = this.language.t(`save_${status}`);
    const warning = status !== 'none' && status !== 'saved';
    const detailElement = document.getElementById('save-detail');
    if (detailElement) detailElement.textContent = detail;
    if (element) {
      element.textContent = warning ? detail : '';
      element.hidden = !warning;
      element.title = detail;
      element.dataset.warning = String(warning);
    }
  }
}
