import type { GameDependencies } from '../Game.ts';
import { GameSession } from '../core/GameSession.ts';
import { SeededRandomSource } from '../core/random/IRandomSource.ts';
import { LanguageService } from '../i18n/LanguageService.ts';

/** Local-only feature QA uses an isolated in-memory store, never the player's checkpoint. */
export function practiceDependencies(): GameDependencies | undefined {
  const level = Number(new URLSearchParams(window.location.search).get('practiceLevel'));
  if (!Number.isInteger(level) || level < 1 || level > 100) return undefined;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  const session = new GameSession(undefined, level), language = new LanguageService(storage, navigator.language);
  const banner = document.createElement('p'); banner.className = 'practice-banner';
  document.querySelector('.run-summary')?.append(banner);
  const render = () => { banner.textContent = language.t('practiceMode', { level: session.getLevel() }); };
  session.addListener({ onLevelStarted: render }); language.subscribe(render); render();
  return { initialLevel: level, session, storage, language, random: new SeededRandomSource(20) };
}
