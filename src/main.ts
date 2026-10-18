import { Game } from './Game.ts';
import { parseMode } from './modes/PlayMode.ts';
import { modeDependencies } from './modes/ModeDependencies.ts';
import { BrowserStorage } from './persistence/Storage.ts';
import { LanguageService } from './i18n/LanguageService.ts';

window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('game-container');
  if (container) {
    const storage = new BrowserStorage();
    const language = new LanguageService(storage, navigator.language);
    document.documentElement.lang = language.locale;
    const mode = parseMode(new URLSearchParams(window.location.search));
    if (mode === 'versionMismatch') {
      const message = document.createElement('p'); message.textContent = language.t('versionMismatch');
      const link = document.createElement('a'); link.href = '?mode=daily'; link.textContent = language.t('dailyChallenge');
      container.replaceChildren(message, link); return;
    }
    const practice = import.meta.env.DEV && mode.kind === 'campaign' ? (await import('./dev/practice.ts')).practiceDependencies() : undefined;
    const game = new Game(practice ?? { ...modeDependencies(mode), language, collectionStorage: storage });
    await game.init(container);
  }
});
