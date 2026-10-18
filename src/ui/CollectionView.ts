import type { ILocalization } from '../i18n/ILanguageService.ts';
import { THEMES, type ICollectionReader, type BoardTheme } from '../core/Collection.ts';
import { COMBOS } from '../core/SpecialCombinations.ts';

export class CollectionView {
  constructor(private readonly language: ILocalization, private readonly collection: ICollectionReader,
    private readonly onTheme: (theme: BoardTheme) => void) {}

  open(): void {
    const dialog = document.createElement('dialog'); dialog.className = 'feature-dialog'; dialog.setAttribute('aria-labelledby', 'recipe-title');
    const draw = () => {
      dialog.replaceChildren(); const data = this.collection.snapshot();
      const title = document.createElement('h2'); title.id = 'recipe-title'; title.textContent = this.language.t('recipeBook');
      const intro = document.createElement('p'); intro.textContent = this.language.t('recipeInfo'); dialog.append(title, intro);
      for (const recipe of [
        { name: 'recipe_bankless', detail: 'recipeBanklessInfo', done: Number(data.bankless), total: 1, reward: 'theme_mint' },
        { name: 'recipe_delivery', detail: 'recipeDeliveryInfo', done: Number(data.tripleDelivery), total: 1, reward: 'theme_cocoa' },
        { name: 'recipe_combos', detail: 'recipeCombosInfo', done: data.combos.length, total: COMBOS.length, reward: 'theme_royal' },
      ] as const) {
        const section = document.createElement('section'); section.className = 'recipe-entry';
        const heading = document.createElement('h3'); heading.textContent = this.language.t(recipe.name);
        const description = document.createElement('p'); description.textContent = this.language.t(recipe.detail);
        const progress = document.createElement('p'); progress.className = 'feature-accent';
        progress.textContent = `${this.language.t('recipeProgress', { done: recipe.done, total: recipe.total })} · ${this.language.t(recipe.reward)}`;
        section.append(heading, description, progress);
        if (recipe.name === 'recipe_combos') {
          const list = document.createElement('ul'); list.className = 'combo-checklist';
          for (const combo of COMBOS) {
            const item = document.createElement('li'); item.textContent = `${data.combos.includes(combo.id) ? '✓ ' : '○ '}${this.language.t(`combo_${combo.id}`)}`; list.append(item);
          }
          section.append(list);
        }
        dialog.append(section);
      }
      const themes = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = this.language.t('boardTheme'); themes.append(legend);
      const buttons = document.createElement('div'); buttons.className = 'feature-actions';
      for (const theme of THEMES) {
        const button = document.createElement('button'); const unlocked = this.collection.unlocked(theme);
        button.textContent = `${this.language.t(`theme_${theme}`)} · ${this.language.t(!unlocked ? 'themeLocked' : data.theme === theme ? 'themeSelected' : 'selectTheme')}`;
        button.disabled = !unlocked; button.setAttribute('aria-pressed', String(data.theme === theme));
        button.onclick = () => { this.onTheme(theme); draw(); }; buttons.append(button);
      }
      themes.append(buttons); dialog.append(themes);
      if (this.collection.status !== 'available') {
        const warning = document.createElement('p'); warning.setAttribute('role', 'status');
        warning.textContent = this.language.t(this.collection.status === 'preserved' ? 'collectionPreserved' : 'collectionUnavailable'); dialog.append(warning);
      }
      const close = document.createElement('button'); close.textContent = this.language.t('close'); close.onclick = () => dialog.close(); dialog.append(close);
    };
    draw(); document.body.append(dialog);
    const unsubscribe = this.language.subscribe(draw);
    dialog.addEventListener('close', () => { unsubscribe(); dialog.remove(); }, { once: true }); dialog.showModal();
  }
}
