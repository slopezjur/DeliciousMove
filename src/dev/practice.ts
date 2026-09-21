import type { GameDependencies } from '../Game.ts';
import { GameSession } from '../core/GameSession.ts';
import { SeededRandomSource } from '../core/random/IRandomSource.ts';
import { LanguageService } from '../i18n/LanguageService.ts';
import { InfiniteLevelProgression } from '../core/LevelProgression.ts';
import { BoardInitializer } from '../core/BoardInitializer.ts';
import { SpecialType } from '../core/TileTypes.ts';

/** Local-only feature QA uses an isolated in-memory store, never the player's checkpoint. */
export function practiceDependencies(): GameDependencies | undefined {
  const params = new URLSearchParams(window.location.search);
  const level = Number(params.get('practiceLevel'));
  if (!Number.isInteger(level) || level < 1 || level > 100) return undefined;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  const lastChance = level === 1 && params.get('practiceLastChance') === '1';
  const progression = new InfiniteLevelProgression();
  const session = new GameSession(lastChance ? { getConfig: n => ({
    ...progression.getConfig(n), moves: 1, targetScore: 1000000,
    objectives: [{ kind: 'score', target: 1000000 }],
  }) } : progression, level);
  const language = new LanguageService(storage, navigator.language);
  const random = new SeededRandomSource(20);
  const boardInitializer: GameDependencies['boardInitializer'] = lastChance ? {
    populate(board) {
      new BoardInitializer(random).populate(board);
      board.get(0, 0)!.special = SpecialType.StripedHorizontal;
      board.get(7, 0)!.special = SpecialType.StripedVertical;
      board.get(7, 7)!.special = SpecialType.ColorBomb;
    },
  } : undefined;
  const banner = document.createElement('p'); banner.className = 'practice-banner';
  document.querySelector('.run-summary')?.append(banner);
  const render = () => { banner.textContent = language.t('practiceMode', { level: session.getLevel() }); };
  session.addListener({ onLevelStarted: render }); language.subscribe(render); render();
  return { initialLevel: level, session, storage, language, random, boardInitializer };
}
