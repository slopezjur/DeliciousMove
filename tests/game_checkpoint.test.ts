import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application } from 'pixi.js';
import { Game } from '../src/Game.ts';
import { Board } from '../src/core/Board.ts';
import { GameSession, GameState, GameOverReason } from '../src/core/GameSession.ts';
import { PlayerResources, LIFE_REGEN_MS, RESOURCES_KEY } from '../src/persistence/PlayerResources.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { BoardView } from '../src/view/BoardView.ts';
import { SAVE_KEY } from '../src/persistence/SaveStore.ts';
import { RECORDS_KEY } from '../src/persistence/RecordsStore.ts';
import { Position, SpecialType, CascadeStep } from '../src/core/TileTypes.ts';
import { LevelDifficulty } from '../src/core/LevelProgression.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { GameSave, SaveCodec, SAVE_SCHEMA_VERSION, GAME_RULES_VERSION } from '../src/persistence/SaveCodec.ts';

const captured = vi.hoisted(() => ({
  swap: undefined as undefined | ((from: Position, to: Position) => Promise<boolean>),
}));
vi.mock('../src/input/InputController.ts', () => ({
  InputController: class {
    private locked = false;
    constructor(_view: unknown, swap: typeof captured.swap) { captured.swap = swap; }
    setLocked(value: boolean) { this.locked = value; }
    isLocked() { return this.locked; }
  },
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function environment() {
  vi.useFakeTimers();
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, addEventListener: vi.fn() });
  vi.stubGlobal('document', {
    getElementById: () => null, querySelectorAll: () => [],
    documentElement: { lang: 'en' }, addEventListener: vi.fn(),
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
  const app = {
    init: vi.fn().mockResolvedValue(undefined), stage: { addChild: vi.fn() },
    canvas: {}, renderer: { resize: vi.fn() },
  } as unknown as Application;
  const hud = { initLevel: vi.fn(), addScore: vi.fn(), updateMoves: vi.fn(), updateShuffles: vi.fn(), setLastChance: vi.fn() };
  const modal = { showVictory: vi.fn(), showGameOver: vi.fn(), hide: vi.fn() };
  const idleHintController = { start: vi.fn(), stop: vi.fn(), resetTimer: vi.fn() };
  const container = { appendChild: vi.fn() } as unknown as HTMLElement;
  return { data, storage, app, hud, modal, idleHintController, container };
}

function saveFixture(session: GameSession): GameSave {
  const board = new Board(), random = new SeededRandomSource(20);
  new BoardInitializer(random).populate(board);
  return {
    schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION,
    savedAt: '2026-09-20T12:00:00.000Z', board: board.getSnapshot(),
    session: session.exportState(), random: random.getSnapshot(),
  };
}

describe('game checkpoint lifecycle', () => {
  it.each([false, true])('charges a life only after unsuccessful finale playback (rescued=%s)', async rescued => {
    const env = environment(), board = new Board(), view = new BoardView(board);
    const session = new GameSession({ getConfig: level => ({ level, moves: 1, shuffles: 3,
      targetScore: 100, difficulty: LevelDifficulty.Easy }) });
    let entered = () => {}, release = () => {};
    const started = new Promise<void>(resolve => { entered = resolve; });
    const game = new Game({ ...env, board, boardView: view, session,
      boardInitializer: { populate(b) {
        new BoardInitializer(new SeededRandomSource(20)).populate(b);
        b.get(7, 7)!.special = SpecialType.StripedHorizontal;
      } },
      cascadeResolver: {
        resolveSwap: () => ({ valid: true, steps: [] }),
        resolveActivation: (b, pos) => {
          b.get(pos.row, pos.col)!.special = SpecialType.None;
          return { valid: true, steps: [{ matchedTileIds: [], spawnedSpecials: [], drops: [], spawns: [], scoreGained: rescued ? 100 : 10 }] };
        },
      },
      animationQueue: {
        animateSwap: async () => {}, animateShuffle: async () => {}, animateHint: () => {},
        playCascadeSteps: async (steps: CascadeStep[], record) => {
          if (session.getState() === GameState.LastChance) {
            entered(); await new Promise<void>(resolve => { release = resolve; });
          }
          steps.forEach(s => record(s.scoreGained, s.objectiveEvents));
        },
      },
      deadlockResolver: { hasPossibleMoves: () => true, findPossibleMoves: () => [],
        shuffleBoard: () => ({ success: true, mapping: new Map() }) },
    });
    try {
      await game.init(env.container);
      const resources = new PlayerResources(env.storage);
      const playing = captured.swap!({ row: 0, col: 0 }, { row: 0, col: 1 });
      await started;
      expect(env.hud.setLastChance).toHaveBeenLastCalledWith(true);
      expect(resources.snapshot().lives).toBe(5);
      expect(env.modal.showGameOver).not.toHaveBeenCalled();
      expect(env.storage.getItem(SAVE_KEY)).toBeNull();
      expect(await captured.swap!({ row: 0, col: 0 }, { row: 0, col: 1 })).toBe(false);
      game.startNewGame();
      expect(session.getState()).toBe(GameState.LastChance);
      release(); await playing;
      expect(resources.snapshot().lives).toBe(rescued ? 5 : 4);
      expect(session.getState()).toBe(rescued ? GameState.Ready : GameState.GameOver);
      expect(env.hud.setLastChance).toHaveBeenLastCalledWith(false);
      expect(env.storage.getItem(SAVE_KEY)).toBeNull();
      if (!rescued) {
        (game as unknown as { onModalAction(): void }).onModalAction();
        expect(resources.snapshot().lives).toBe(4);
        expect(session.getSnapshot()).toMatchObject({ movesLeft: 1, shufflesLeft: 3, score: 0, globalScore: 0 });
      }
    } finally { view.destroy({ children: true }); }
  });

  it.each([false, true])('reconciles accepted mid-level saves without refunding bank or losing failure (failed=%s)', async failed => {
    const env = environment(), original = new GameSession();
    original.startLevel(1, 3);
    original.addPoints(100);
    const save = saveFixture(original);
    const raw = new SaveCodec().encode(save);
    env.storage.setItem(SAVE_KEY, raw);
    const checkpoint = `${save.savedAt}:1`;
    const resources = new PlayerResources(env.storage);
    resources.beginAttempt(checkpoint, 1, 3);
    resources.spendBank(checkpoint, 1, 2);
    if (failed) resources.fail(checkpoint, 1, 2, GameOverReason.Deadlock);
    const session = new GameSession(), board = new Board(), view = new BoardView(board);
    const game = new Game({ ...env, session, board, boardView: view, random: new SeededRandomSource(9) });
    try {
      await game.init(env.container);
      expect(session.getState()).toBe(failed ? GameState.GameOver : GameState.Ready);
      expect(session.getAccumulatedMoves()).toBe(2);
      expect(session.getMovesLeft()).toBe(session.getLevelMovesLeft() + 2);
      expect(resources.getAttempt(checkpoint)?.failed).toBe(failed ? GameOverReason.Deadlock : undefined);
      expect(resources.snapshot().lives).toBe(failed ? 4 : 5);
      expect(board.getSnapshot()).toEqual(save.board);
      expect(session.getScore()).toBe(100);
      if (failed) {
        (game as unknown as { onModalAction(): void }).onModalAction();
        expect(session.getSnapshot()).toMatchObject({ score: 0, globalScore: 0, accumulatedMoves: 2 });
        expect(resources.snapshot().lives).toBe(4);
      }
      expect(env.storage.getItem(SAVE_KEY)).toBe(raw);
    } finally { view.destroy({ children: true }); }
  });

  it('uses the persisted bank on retry when another tab has spent moves', async () => {
    const env = environment(), won = new GameSession();
    won.onMoveInitiated(); won.addPoints(won.getTargetScore()); won.completeWithVictory();
    const save = saveFixture(won);
    env.storage.setItem(SAVE_KEY, new SaveCodec().encode(save));
    const boardA = new Board(), viewA = new BoardView(boardA), sessionA = new GameSession();
    const boardB = new Board(), viewB = new BoardView(boardB), sessionB = new GameSession();
    const a = new Game({ ...env, board: boardA, boardView: viewA, session: sessionA });
    const b = new Game({ ...env, board: boardB, boardView: viewB, session: sessionB });
    try {
      await a.init(env.container);
      (a as unknown as { onModalAction(): void }).onModalAction();
      await b.init(env.container);
      expect(sessionB.getAccumulatedMoves()).toBe(21);
      for (let i = 0; i < sessionA.getLevelConfig().moves + 1; i++) {
        sessionA.onMoveInitiated(); sessionA.onTurnCompleted();
      }
      sessionB.addPoints(100);
      sessionB.failAttempt(GameOverReason.Deadlock);
      (b as unknown as { onModalAction(): void }).onModalAction();
      expect(sessionB.getSnapshot()).toMatchObject({
        level: 2, accumulatedMoves: 20, levelMovesLeft: sessionB.getLevelConfig().moves,
        score: 0, globalScore: save.session.globalScore, shufflesLeft: sessionB.getLevelConfig().shuffles,
      });
      expect(sessionB.getMovesLeft()).toBe(sessionB.getLevelMovesLeft() + 20);
      const resources = new PlayerResources(env.storage);
      expect(resources.snapshot().lives).toBe(4);
      expect(resources.getAttempt(`${save.savedAt}:1`)).toMatchObject({ bank: 20 });
      expect(resources.getAttempt(`${save.savedAt}:1`)?.failed).toBeUndefined();
    } finally { viewA.destroy({ children: true }); viewB.destroy({ children: true }); }
  });

  it('charges once per failure, gates zero lives, keeps lives on New Game, and resumes after regeneration', async () => {
    const env = environment(), board = new Board(), view = new BoardView(board), session = new GameSession();
    let now = 1000000;
    const coordinator = { playMove: vi.fn(async () => false), activateTile: vi.fn(async () => false) };
    const game = new Game({ ...env, board, boardView: view, session, now: () => now, turnCoordinator: coordinator });
    const retry = () => (game as unknown as { onModalAction(): void }).onModalAction();
    try {
      await game.init(env.container);
      const resources = new PlayerResources(env.storage, () => now);
      for (let lives = 4; lives >= 0; lives--) {
        session.failAttempt(GameOverReason.OutOfMoves);
        session.failAttempt(GameOverReason.OutOfMoves);
        expect(resources.snapshot().lives).toBe(lives);
        retry();
        expect(resources.snapshot().lives).toBe(lives);
        expect(session.getState()).toBe(lives ? GameState.Ready : GameState.GameOver);
      }
      expect(await captured.swap!({ row: 0, col: 0 }, { row: 0, col: 1 })).toBe(false);
      expect(coordinator.playMove).not.toHaveBeenCalled();
      game.startNewGame();
      expect(resources.snapshot().lives).toBe(0);
      expect(await captured.swap!({ row: 0, col: 0 }, { row: 0, col: 1 })).toBe(false);
      now += LIFE_REGEN_MS;
      retry();
      expect(resources.snapshot().lives).toBe(1);
      await captured.swap!({ row: 0, col: 0 }, { row: 0, col: 1 });
      expect(coordinator.playMove).toHaveBeenCalledOnce();
      expect(env.storage.getItem(SAVE_KEY)).toBeNull();
    } finally { view.destroy({ children: true }); }
  });

  it('restores a failed level and spent bank without charging another life or restoring failed score', async () => {
    const env = environment(), board = new Board(), view = new BoardView(board), session = new GameSession();
    new PlayerResources(env.storage).beginAttempt('new', 1, 2);
    const game = new Game({ ...env, board, boardView: view, session });
    try {
      await game.init(env.container);
      for (let i = 0; i < session.getLevelConfig().moves + 1; i++) { session.onMoveInitiated(); session.onTurnCompleted(); }
      session.addPoints(100);
      session.failAttempt(GameOverReason.Deadlock);
      const debit = env.storage.getItem(RESOURCES_KEY)!;
      const restoredSession = new GameSession(), restoredBoard = new Board(), restoredView = new BoardView(restoredBoard);
      const restored = new Game({ ...env, board: restoredBoard, boardView: restoredView, session: restoredSession });
      try {
        await restored.init(env.container);
        expect(restoredSession.getState()).toBe(GameState.GameOver);
        expect(JSON.parse(env.storage.getItem(RESOURCES_KEY)!).lives).toBe(JSON.parse(debit).lives);
        (restored as unknown as { onModalAction(): void }).onModalAction();
        expect(restoredSession.getSnapshot()).toMatchObject({ level: 1, levelMovesLeft: 22, accumulatedMoves: 1, score: 0, globalScore: 0, shufflesLeft: 4 });
        expect(new PlayerResources(env.storage).snapshot().lives).toBe(4);
      } finally { restoredView.destroy({ children: true }); }
    } finally { view.destroy({ children: true }); }
  });
  it('measures the canvas host and defers observed resizes until playback settles', async () => {
    const env = environment(), board = new Board(), view = new BoardView(board);
    const viewport = { clientWidth: 351, clientHeight: 351, appendChild: vi.fn() };
    let resize = () => {};
    let finish = () => {};
    const observe = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe = observe;
      constructor(callback: () => void) { resize = callback; }
    });
    vi.stubGlobal('document', {
      getElementById: (id: string) => id === 'board-viewport' ? viewport : null,
      querySelectorAll: () => [], documentElement: { lang: 'en' }, addEventListener: vi.fn(),
    });
    const game = new Game({
      ...env, board, boardView: view, random: new SeededRandomSource(20),
      turnCoordinator: {
        playMove: () => new Promise<boolean>(resolve => { finish = () => resolve(false); }),
        activateTile: async () => false,
      },
    });
    try {
      await game.init(env.container);
      expect(viewport.appendChild).toHaveBeenCalledWith(env.app.canvas);
      expect(observe).toHaveBeenCalledWith(viewport);
      expect(env.app.renderer.resize).toHaveBeenLastCalledWith(351, 351);
      const sizeBefore = view.tileSize;
      const playing = captured.swap!({ row: 0, col: 0 }, { row: 0, col: 1 });
      viewport.clientWidth = 720;
      viewport.clientHeight = 720;
      resize();
      expect(env.app.renderer.resize).toHaveBeenLastCalledWith(351, 351);
      expect(view.tileSize).toBe(sizeBefore);
      finish();
      await playing;
      expect(env.app.renderer.resize).toHaveBeenLastCalledWith(720, 720);
      expect(view.tileSize).toBeGreaterThan(sizeBefore);
      expect(env.storage.getItem(SAVE_KEY)).toBeNull();
    } finally { view.destroy({ children: true }); }
  });

  it('writes only after victory playback settles and preserves the checkpoint through the next level', async () => {
    const env = environment(), board = new Board(), session = new GameSession();
    const view = new BoardView(board);
    let finishPlayback: () => void = () => {};
    let victory = false;
    const turnCoordinator = {
      playMove: async () => {
        session.onMoveInitiated();
        session.addPoints(victory ? session.getTargetScore() : 60);
        if (victory) {
          await new Promise<void>(resolve => { finishPlayback = resolve; });
          session.completeWithVictory();
        } else session.onTurnCompleted();
        return true;
      },
      activateTile: async () => false,
    };
    const game = new Game({
      ...env, board, session, boardView: view, random: new SeededRandomSource(20), turnCoordinator,
    });
    try {
      await game.init(env.container);
      expect(env.storage.getItem(SAVE_KEY)).toBeNull();
      await captured.swap!({ row: 0, col: 0 }, { row: 0, col: 1 });
      expect(env.storage.getItem(SAVE_KEY)).toBeNull();
      victory = true;
      const playing = captured.swap!({ row: 0, col: 0 }, { row: 0, col: 1 });
      expect(session.getState()).toBe(GameState.Resolving);
      expect(env.storage.getItem(SAVE_KEY)).toBeNull();
      finishPlayback();
      await playing;
      const checkpoint = env.storage.getItem(SAVE_KEY)!;
      const records = env.storage.getItem(RECORDS_KEY)!;
      expect(JSON.parse(records)).toMatchObject({ bestLevel: 1, bestScore: session.getGlobalScore() });
      expect(JSON.parse(checkpoint).session.state).toBe(GameState.Victory);
      session.advanceLevel();
      expect(session.getLevel()).toBe(2);
      expect(env.storage.getItem(SAVE_KEY)).toBe(checkpoint);
      game.forceShuffle();
      expect(env.storage.getItem(SAVE_KEY)).toBe(checkpoint);

      const restoredSession = new GameSession(), restoredBoard = new Board();
      const restoredView = new BoardView(restoredBoard);
      const restored = new Game({
        ...env, board: restoredBoard, session: restoredSession,
        boardView: restoredView, random: new SeededRandomSource(999),
      });
      try {
        await restored.init(env.container);
        expect(restoredSession.getState()).toBe(GameState.Ready);
        expect(restoredSession.getLevel()).toBe(2);
        expect(restoredSession.getScore()).toBe(0);
        expect(restoredSession.getGlobalScore()).toBe(JSON.parse(checkpoint).session.globalScore);
        expect(env.modal.showVictory).toHaveBeenCalled();
        expect(env.storage.getItem(SAVE_KEY)).toBe(checkpoint);
        restored.startNewGame();
        expect(restoredSession.getLevel()).toBe(1);
        expect(restoredSession.getScore()).toBe(0);
        expect(env.storage.getItem(SAVE_KEY)).toBeNull();
        expect(env.storage.getItem(RECORDS_KEY)).toBe(records);
        expect([...env.data.keys()].some(key => key.startsWith(SAVE_KEY + '.recovery.'))).toBe(true);
      } finally { restoredView.destroy({ children: true }); }
    } finally { view.destroy({ children: true }); }
  });
});
