import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { GameSession, GameState, GameOverReason } from '../src/core/GameSession.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { SaveCodec, GameSave, SaveError, SAVE_SCHEMA_VERSION, GAME_RULES_VERSION } from '../src/persistence/SaveCodec.ts';
import { SaveStore, SAVE_KEY, BACKUP_KEY } from '../src/persistence/SaveStore.ts';
import { IStorage } from '../src/persistence/Storage.ts';

class MemoryStorage implements IStorage {
  removeItem(key: string): void { this.data.delete(key); }
  data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

function fixture(): GameSave {
  const board = new Board(8, 8), random = new SeededRandomSource(20);
  new BoardInitializer(random).populate(board);
  const session = new GameSession();
  session.startLevel(2, 17);
  session.onMoveInitiated();
  session.addPoints(1200);
  session.onTurnCompleted();
  // These baseline persistence tests exercise the original score-only contract.
  const state = session.exportState();
  delete state.config.objectives;
  delete state.config.features;
  delete state.objectiveProgress;
  return {
    schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION, savedAt: '2026-09-20T12:00:00.000Z',
    board: board.getSnapshot(), session: state, random: random.getSnapshot(),
  };
}

describe('versioned saves', () => {
  it('migrates pre-finale rules without changing the saved board, counters, or completion state', () => {
    const original = fixture(); original.rulesVersion = 4;
    const migrated = new SaveCodec().decode(JSON.stringify(original));
    expect(migrated).toEqual({ ...JSON.parse(JSON.stringify(original)), rulesVersion: 5 });
    expect(original.rulesVersion).toBe(4);
  });
  it('allows a codec substitute without requiring migration internals', () => {
    const storage = new MemoryStorage(), save = fixture();
    save.session.state = GameState.Victory;
    const decoded: string[] = [];
    const store = new SaveStore(storage, {
      encode: () => 'encoded checkpoint',
      decode: raw => { decoded.push(raw); return save; },
    });
    expect(store.save(save)).toBe(true);
    expect(store.load()).toBe(save);
    expect(decoded).toEqual(['encoded checkpoint']);
    expect(storage.getItem(SAVE_KEY)).toBe('encoded checkpoint');
  });
  it.each([[30, 17, 13, 17], [10, 17, 0, 10], [0, 17, 0, 0]])(
    'migrates legacy total %i and initial bank %i without adding moves', (total, bank, baseLeft, bankLeft) => {
      const legacy = fixture(); legacy.schemaVersion = 2; legacy.rulesVersion = 3;
      delete legacy.session.levelMovesLeft;
      legacy.session.movesLeft = total; legacy.session.accumulatedMoves = bank;
      if (!total) { legacy.session.state = GameState.GameOver; legacy.session.reason = GameOverReason.OutOfMoves; }
      const migrated = new SaveCodec().decode(JSON.stringify(legacy));
      expect(migrated.session).toMatchObject({ movesLeft: total, levelMovesLeft: baseLeft, accumulatedMoves: bankLeft });
      expect(migrated.board).toEqual(legacy.board);
      expect(migrated.session.config).toEqual(legacy.session.config);
      expect(migrated.random).toEqual(legacy.random);
    });
  it('round-trips the board, IDs, session and the exact random sequence without aliasing', () => {
    const original = fixture(), codec = new SaveCodec();
    const saved = codec.decode(codec.encode(original));
    expect(saved).toEqual(JSON.parse(JSON.stringify(original)));
    const board = new Board(8, 8), session = new GameSession(), random = new SeededRandomSource();
    board.restore(saved.board); session.restore(saved.session); random.restore(saved.random);
    expect(board.getSnapshot()).toEqual(original.board);
    expect(session.exportState()).toEqual({ ...original.session, objectiveProgress: [original.session.score] });
    const expectedRandom = new SeededRandomSource();
    expectedRandom.restore(original.random);
    expect(Array.from({ length: 30 }, () => random.next())).toEqual(
      Array.from({ length: 30 }, () => expectedRandom.next()));
    const replacement = board.createTile(0, 0, 0);
    expect(replacement.id).toBe(original.board.nextId);
    saved.board.tiles[1].color = 5;
    saved.session.config.level = 99;
    expect(board.getSnapshot().tiles[1]).toEqual(original.board.tiles[1]);
    expect(session.getLevel()).toBe(2);
  });

  it.each([GameState.Ready, GameState.Victory, GameState.GameOver] as const)(
    'restores %s without starting a new level', (state) => {
      const saved = fixture();
      saved.session.state = state;
      if (state !== GameState.GameOver) {
        saved.session.score = saved.session.config.targetScore;
        saved.session.globalScore = saved.session.score;
      } else {
        saved.session.movesLeft = 0;
        saved.session.levelMovesLeft = 0;
        saved.session.accumulatedMoves = 0;
        saved.session.reason = GameOverReason.OutOfMoves;
      }
      const session = new GameSession();
      let started = false;
      session.addListener({ onLevelStarted: () => { started = true; } });
      session.restore(new SaveCodec().decode(JSON.stringify(saved)).session);
      expect(session.getState()).toBe(state);
      expect(started).toBe(false);
      expect(session.isTargetReached()).toBe(state !== GameState.GameOver);
    });

  it('refuses to snapshot an unfinished turn', () => {
    const session = new GameSession();
    session.onMoveInitiated();
    expect(() => session.exportState()).toThrow('unfinished turn');
  });

  it('runs schema and rules migrations sequentially on independent data', () => {
    const original = fixture();
    original.schemaVersion = 1; original.rulesVersion = 1;
    const calls: string[] = [];
    const codec = new SaveCodec(
      new Map([
        [1, (s) => { calls.push('schema1'); return { ...s, schemaVersion: 2 }; }],
        [2, (s) => { calls.push('schema2'); return { ...s, schemaVersion: 3 }; }],
      ]),
      new Map([[1, (s) => { calls.push('rules1'); return { ...s, rulesVersion: 2 }; }]]),
      3, 2
    );
    const migrated = codec.decode(JSON.stringify(original));
    expect(calls).toEqual(['schema1', 'schema2', 'rules1']);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.rulesVersion).toBe(2);
    expect(migrated.board).toEqual(original.board);
    expect(original.schemaVersion).toBe(1);
  });

  it('rejects missing migration paths and non-advancing migrations', () => {
    const old = { ...fixture(), schemaVersion: 0 };
    expect(() => new SaveCodec().decode(JSON.stringify(old))).toThrow(SaveError);
    expect(() => new SaveCodec(new Map([[0, s => s]])).decode(JSON.stringify(old))).toThrow(SaveError);
  });

  it.each([
    ['duplicate tile IDs', (s: GameSave) => { s.board.tiles[1].id = s.board.tiles[0].id; }],
    ['duplicate cells', (s: GameSave) => { s.board.tiles[1].col = s.board.tiles[0].col; }],
    ['missing cell', (s: GameSave) => { s.board.tiles.pop(); }],
    ['invalid ID counter', (s: GameSave) => { s.board.nextId = 1; }],
    ['unknown special', (s: GameSave) => { s.board.tiles[0].special = 'unknown' as never; }],
    ['negative moves', (s: GameSave) => { s.session.movesLeft = -1; }],
    ['excess moves', (s: GameSave) => { s.session.movesLeft = 1_000_000; }],
    ['unfinished turn', (s: GameSave) => { s.session.state = GameState.Resolving as never; }],
    ['invalid RNG', (s: GameSave) => { s.random.state = -1; }],
    ['inconsistent victory', (s: GameSave) => { s.session.state = GameState.Victory; }],
  ])('rejects %s', (_, mutate) => {
    const save = fixture(); mutate(save);
    expect(() => new SaveCodec().decode(JSON.stringify(save))).toThrow(SaveError);
  });
});

function completedFixture(): GameSave {
  const save = fixture();
  save.session.state = GameState.Victory;
  save.session.score = save.session.config.targetScore;
  save.session.globalScore = save.session.score;
  return save;
}

describe('local save protection', () => {
  it('only checkpoints completed levels, never regular moves, bonus turns or losses', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const checkpoint = completedFixture();
    expect(store.save(checkpoint)).toBe(true);
    const raw = storage.getItem(SAVE_KEY);
    const partial = fixture();
    expect(store.save(partial)).toBe(false);
    partial.session.score = partial.session.config.targetScore;
    expect(store.save(partial)).toBe(false);
    partial.session.state = GameState.GameOver;
    expect(store.save(partial)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
  });

  it('archives and clears the checkpoint on an explicit new run', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    store.save(completedFixture());
    store.beginNewRun();
    expect(new SaveStore(storage).load()).toBeNull();
    expect([...storage.data.keys()].some(key => key.startsWith(SAVE_KEY + '.recovery.'))).toBe(true);
  });
  it('rotates a valid checkpoint and resumes the latest one', () => {
    const storage = new MemoryStorage(), store = new SaveStore(storage);
    const first = completedFixture(), second = completedFixture();
    second.session.movesLeft--;
    second.session.levelMovesLeft!--;
    expect(store.load()).toBeNull();
    expect(store.save(first)).toBe(true);
    expect(store.save(second)).toBe(true);
    expect(storage.getItem(BACKUP_KEY)).toBe(JSON.stringify(first));
    expect(new SaveStore(storage).load()?.session.movesLeft).toBe(second.session.movesLeft);
  });

  it.each(['{broken', JSON.stringify({ ...completedFixture(), schemaVersion: 99 }),
    JSON.stringify({ ...completedFixture(), rulesVersion: 99 }),
    JSON.stringify({ ...completedFixture(), schemaVersion: 0 })])(
    'never overwrites unreadable/unsupported data automatically: %s', (raw) => {
      const storage = new MemoryStorage();
      storage.setItem(SAVE_KEY, raw);
      const store = new SaveStore(storage);
      expect(store.load()).toBeNull();
      expect(store.save(completedFixture())).toBe(false);
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
      store.beginNewRun();
      expect([...storage.data.entries()].some(([key, value]) =>
        key.startsWith(SAVE_KEY + '.recovery.') && value === raw)).toBe(true);
      expect(store.save(completedFixture())).toBe(true);
      expect(new SaveStore(storage).load()).not.toBeNull();
    });

  it('recovers a known-good backup without overwriting a corrupt primary', () => {
    const storage = new MemoryStorage(), saved = completedFixture();
    storage.setItem(SAVE_KEY, '{broken');
    storage.setItem(BACKUP_KEY, JSON.stringify(saved));
    const store = new SaveStore(storage);
    expect(store.load()?.board).toEqual(saved.board);
    expect(store.status).toBe('recovered');
    expect(store.save(saved)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe('{broken');
  });

  it('does not use an old backup to downgrade a save from a newer game', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...completedFixture(), rulesVersion: GAME_RULES_VERSION + 1 }));
    storage.setItem(BACKUP_KEY, JSON.stringify(completedFixture()));
    const store = new SaveStore(storage);
    expect(store.load()).toBeNull();
    expect(store.status).toBe('newer');
  });

  it('handles unavailable storage without throwing', () => {
    const storage: IStorage = {
      getItem() { throw new Error('SecurityError'); },
      removeItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); },
    };
    const store = new SaveStore(storage);
    expect(store.load()).toBeNull();
    expect(store.save(completedFixture())).toBe(false);
    expect(() => store.beginNewRun()).not.toThrow();
    expect(store.status).toBe('unavailable');
  });

  it('preserves the last checkpoint on quota failure', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify(completedFixture());
    storage.setItem(SAVE_KEY, raw);
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    const store = new SaveStore(storage);
    expect(store.load()).not.toBeNull();
    expect(store.save(completedFixture())).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    expect(store.status).toBe('unavailable');
  });
});
