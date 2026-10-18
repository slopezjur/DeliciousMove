import { describe, expect, it, vi } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { GameOverReason, GameSession, GameState } from '../src/core/GameSession.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { PlayerResources } from '../src/persistence/PlayerResources.ts';
import { RecordsStore } from '../src/persistence/RecordsStore.ts';
import { RunProgress } from '../src/persistence/RunProgress.ts';
import { GameSave, GAME_RULES_VERSION, SAVE_SCHEMA_VERSION } from '../src/persistence/SaveCodec.ts';
import { ISaveStore } from '../src/persistence/SaveStore.ts';

function fixture(savedRun: GameSave | null = null, writable = true) {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } };
  const saves: ISaveStore = { status: 'none', load: () => savedRun, save: vi.fn(() => writable),
    beginNewRun: vi.fn(), suspend: vi.fn() };
  const resources = new PlayerResources(storage, () => 1000000), records = new RecordsStore(storage);
  const progress = new RunProgress(saves, records, resources, () => 1000000);
  const session = new GameSession(), board = new Board(), random = new SeededRandomSource(20);
  new BoardInitializer(random).populate(board);
  return { progress, saves, resources, records, session, board, random };
}

describe('run progress boundaries', () => {
  it.each([false, true])('records only victories and rotates the attempt only on save success (%s)', writable => {
    const env = fixture(null, writable);
    env.progress.beginAttempt(env.session);
    expect(env.progress.saveVictory(env.board, env.random, env.session)).toBe(false);
    expect(env.saves.save).not.toHaveBeenCalled();
    expect(env.records.getSnapshot().bestLevel).toBe(0);
    env.session.addPoints(env.session.getTargetScore()); env.session.completeWithVictory();
    expect(env.progress.saveVictory(env.board, env.random, env.session)).toBe(writable);
    expect(env.records.getSnapshot().bestLevel).toBe(1);
    expect(env.resources.getAttempt('new') === undefined).toBe(writable);
    if (writable) {
      env.session.advanceLevel(); env.progress.beginAttempt(env.session);
      expect(env.resources.getAttempt('1970-01-01T00:16:40.000Z:1')?.level).toBe(2);
    }
  });

  it('reconciles legacy progress and failed attempts through injected storage contracts', () => {
    const seed = fixture(); seed.session.startLevel(1, 5); seed.session.addPoints(100);
    const save: GameSave = { schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION,
      savedAt: '2026-10-18T12:00:00.000Z', board: seed.board.getSnapshot(),
      session: seed.session.exportState(), random: seed.random.getSnapshot() };
    const before = structuredClone(save), env = fixture(save);
    const key = `${save.savedAt}:1`;
    env.resources.beginAttempt(key, 1, 5);
    env.resources.spendBank(key, 1, 2);
    env.resources.fail(key, 1, 2, GameOverReason.Deadlock);
    env.session.addListener({ onLevelStarted: () => env.progress.beginAttempt(env.session),
      onMovesUpdated: () => env.progress.recordBank(env.session),
      onStateChanged: state => { if (state === GameState.GameOver) env.progress.fail(env.session, GameOverReason.Deadlock); } });
    env.progress.resume(env.session, 1, () => env.progress.restore(env.board, env.random, env.session));
    expect(env.session.getSnapshot()).toMatchObject({ score: 100, accumulatedMoves: 2 });
    expect(env.session.getState()).toBe(GameState.GameOver);
    expect(env.resources.snapshot().lives).toBe(4);
    expect(env.board.getSnapshot()).toEqual(save.board);
    expect(env.random.getSnapshot()).toEqual(save.random);
    expect(save).toEqual(before);
    expect(env.saves.save).not.toHaveBeenCalled();
  });

  it('suspends an incompatible restore before changing the board or session', () => {
    const seed = fixture();
    const save: GameSave = { schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION,
      savedAt: '2026-10-18T12:00:00.000Z', board: seed.board.getSnapshot(),
      session: seed.session.exportState(), random: seed.random.getSnapshot() };
    const env = fixture(save), incompatible = new Board(3, 3), before = env.session.exportState();
    expect(env.progress.restore(incompatible, env.random, env.session)).toBe(false);
    expect(env.saves.suspend).toHaveBeenCalledOnce();
    expect(incompatible.getSnapshot().tiles).toEqual([]);
    expect(env.session.exportState()).toEqual(before);
  });
});
