import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { LevelBoardSetup } from '../src/core/LevelFeatures.ts';
import { GameSession, GameOverReason, GameState } from '../src/core/GameSession.ts';
import type { JourneyState } from '../src/core/Journey.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { PlayerResources, RESOURCES_KEY, LIFE_REGEN_MS } from '../src/persistence/PlayerResources.ts';
import { RecordsStore } from '../src/persistence/RecordsStore.ts';
import { RunProgress } from '../src/persistence/RunProgress.ts';
import { SaveStore } from '../src/persistence/SaveStore.ts';
import { SaveCodec, SAVE_SCHEMA_VERSION, GAME_RULES_VERSION, type GameSave } from '../src/persistence/SaveCodec.ts';
import { MemoryStorage } from '../src/persistence/Storage.ts';

const journey: JourneyState = { route: 'challenge', perks: [{ id: 'crosswind', levelsLeft: 3 }, { id: 'thaw', levelsLeft: 2 }] };
function fixture(level = 1): GameSave {
  const board = new Board(), random = new SeededRandomSource(20), session = new GameSession();
  session.startLevel(level, 7, level === 1 ? undefined : journey);
  const setup = new LevelBoardSetup(); setup.configure(board, session.getLevelConfig().features);
  new BoardInitializer(random).populate(board); setup.placeObjects(board, session.getLevelConfig().features);
  return { schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION, savedAt: '2026-10-18T12:00:00.000Z',
    board: board.getSnapshot(), session: session.exportState(), random: random.getSnapshot() };
}

describe('journey compatibility boundaries', () => {
  it('migrates schema 3 / rules 5 without changing board, session, bank or random state', () => {
    const save = fixture(); save.schemaVersion = 3; save.rulesVersion = 5;
    const raw = JSON.stringify(save), migrated = new SaveCodec().decode(raw);
    expect(migrated).toEqual({ ...JSON.parse(raw), schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION });
    expect(JSON.stringify(save)).toBe(raw);
  });

  it.each([15, 20, 25, 35])('round-trips journey and authored board mechanics at level %s', level => {
    const save = fixture(level), codec = new SaveCodec();
    expect(codec.decode(codec.encode(save))).toEqual(JSON.parse(JSON.stringify(save)));
  });

  it('rejects cyclic portal gravity and invalid perk lifetimes', () => {
    const save = fixture(), cells = new Board().getCells();
    cells.find(c => c.row === 7 && c.col === 1)!.portalTo = { row: 0, col: 1 };
    save.board.cells = cells;
    expect(() => new SaveCodec().encode(save)).toThrow();
    const invalid = fixture(15); invalid.session.journey!.perks[0].levelsLeft = 99;
    expect(() => new SaveCodec().encode(invalid)).toThrow();
  });

  it('migrates old resources in memory while preserving bank, failures, clock and idempotency', () => {
    const storage = new MemoryStorage(), time = 1_000_000;
    const raw = JSON.stringify({ version: 1, lives: 4, observedAt: time, nextLifeAt: time + LIFE_REGEN_MS,
      attempt: { checkpoint: 'checkpoint', level: 7, bank: 2, failed: GameOverReason.OutOfMoves } });
    storage.setItem(RESOURCES_KEY, raw);
    const resources = new PlayerResources(storage, () => time - 1000);
    expect(resources.snapshot()).toEqual({ lives: 4, maximum: 5, secondsToNext: 1800 });
    expect(storage.getItem(RESOURCES_KEY)).toBe(raw);
    expect(resources.fail('checkpoint', 7, 10, GameOverReason.OutOfMoves)).toBe(false);
    expect(resources.beginAttempt('checkpoint', 7, 10, journey)).toBe(2);
    expect(JSON.parse(storage.getItem(RESOURCES_KEY)!).version).toBe(2);
    expect(resources.getAttempt('checkpoint')?.journey).toEqual(journey);
    expect(resources.snapshot().lives).toBe(4);
  });

  it('resumes an unfinished attempt with its selected route and perks without replaying the choice', () => {
    const storage = new MemoryStorage(), saves = new SaveStore(storage), records = new RecordsStore(storage);
    const resources = new PlayerResources(storage, () => 1_000_000);
    const save = fixture(); save.session.score = save.session.config.targetScore; save.session.globalScore = save.session.score;
    save.session.objectiveProgress = [save.session.score]; save.session.state = GameState.Victory;
    expect(saves.save(save)).toBe(true);
    const checkpoint = `${save.savedAt}:1`;
    resources.beginAttempt(checkpoint, 2, 5, journey);
    const progress = new RunProgress(saves, records, resources), session = new GameSession();
    const board = new Board(), random = new SeededRandomSource(20);
    progress.resume(session, 1, () => progress.restore(board, random, session));
    expect(session.getLevel()).toBe(2); expect(session.getSnapshot().journey).toEqual(journey);
    expect(session.getLevelConfig().moves).toBe(16); expect(session.getAccumulatedMoves()).toBe(5);
    expect(resources.snapshot().lives).toBe(5);
  });
});
