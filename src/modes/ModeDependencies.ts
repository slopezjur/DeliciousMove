import type { GameDependencies } from '../Game.ts';
import { BoardInitializer } from '../core/BoardInitializer.ts';
import { GameSession } from '../core/GameSession.ts';
import { SeededRandomSource } from '../core/random/IRandomSource.ts';
import { MemoryStorage } from '../persistence/Storage.ts';
import { FreePlayResources } from './FreePlayResources.ts';
import { populateLesson } from './Laboratory.ts';
import { modeConfig, type PlayMode } from './PlayMode.ts';

/** Composition belongs at the application entry point, separate from mode definitions. */
export function modeDependencies(mode: PlayMode): GameDependencies {
  if (mode.kind === 'campaign') return { mode };
  const random = new SeededRandomSource(mode.seed);
  const config = modeConfig(mode);
  return { mode, storage: new MemoryStorage(), resources: new FreePlayResources(), random,
    session: new GameSession({ getConfig: () => structuredClone(config) }, 1, { unlimitedMoves: mode.kind === 'lab' }),
    ...(mode.kind === 'lab' ? { idleHintController: { start() {}, stop() {}, resetTimer() {} } } : {}),
    boardInitializer: { populate(board) {
      random.restore({ algorithm: 'mulberry32', state: mode.seed });
      if (mode.kind === 'lab') populateLesson(board, random, mode.lesson);
      else new BoardInitializer(random).populate(board);
    } } };
}
