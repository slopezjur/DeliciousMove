import { describe, expect, it } from 'vitest';
import { PlayerResources, RESOURCES_KEY, LIFE_REGEN_MS } from '../src/persistence/PlayerResources.ts';
import { GameSession, GameOverReason, GameState } from '../src/core/GameSession.ts';
import { LevelDifficulty } from '../src/core/LevelProgression.ts';

function setup() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  let time = 1000000;
  const now = () => time;
  return { storage, data, now, advance: (ms: number) => { time += ms; }, resources: new PlayerResources(storage, now) };
}

describe('persistent lives', () => {
  it('starts full, charges each failure once, and retries/new runs never refill lives', () => {
    const { resources } = setup();
    expect(resources.snapshot()).toEqual({ lives: 5, maximum: 5, secondsToNext: 0 });
    resources.beginAttempt('checkpoint', 7, 12);
    expect(resources.fail('checkpoint', 7, 9, GameOverReason.Deadlock)).toBe(true);
    expect(resources.fail('checkpoint', 7, 9, GameOverReason.Deadlock)).toBe(false);
    expect(resources.snapshot()).toEqual({ lives: 4, maximum: 5, secondsToNext: 1800 });
    resources.beginAttempt('checkpoint', 7, 9);
    expect(resources.snapshot().lives).toBe(4);
    resources.fail('checkpoint', 7, 0, GameOverReason.OutOfMoves);
    expect(resources.snapshot().lives).toBe(3);
    resources.clearAttempt();
    resources.beginAttempt('new', 1, 0);
    expect(resources.snapshot().lives).toBe(3);
  });

  it('regenerates offline at exact 30-minute boundaries, caps at five, and discards full-life idle time', () => {
    const env = setup();
    for (let i = 0; i < 5; i++) {
      env.resources.beginAttempt('new', 1, 0);
      env.resources.fail('new', 1, 0, GameOverReason.OutOfMoves);
    }
    expect(env.resources.snapshot().lives).toBe(0);
    env.advance(LIFE_REGEN_MS - 1);
    expect(new PlayerResources(env.storage, env.now).snapshot()).toEqual({ lives: 0, maximum: 5, secondsToNext: 1 });
    env.advance(1);
    expect(new PlayerResources(env.storage, env.now).snapshot()).toEqual({ lives: 1, maximum: 5, secondsToNext: 1800 });
    env.advance(LIFE_REGEN_MS * 10);
    const reloaded = new PlayerResources(env.storage, env.now);
    expect(reloaded.snapshot()).toEqual({ lives: 5, maximum: 5, secondsToNext: 0 });
    reloaded.beginAttempt('new', 1, 0);
    reloaded.fail('new', 1, 0, GameOverReason.Deadlock);
    expect(reloaded.snapshot()).toEqual({ lives: 4, maximum: 5, secondsToNext: 1800 });
  });

  it('retains spent bank and failure markers across reloads without saving board state', () => {
    const { resources, storage, now } = setup();
    resources.beginAttempt('victory-6', 7, 20);
    resources.spendBank('victory-6', 7, 14);
    resources.spendBank('unrelated', 7, 0);
    resources.spendBank('victory-6', 7, 20);
    resources.fail('victory-6', 7, 14, GameOverReason.Deadlock);
    const reloaded = new PlayerResources(storage, now);
    expect(reloaded.getAttempt('victory-6')).toEqual({ checkpoint: 'victory-6', level: 7, bank: 14, failed: GameOverReason.Deadlock });
    expect(reloaded.getAttempt('older')).toBeUndefined();
    expect(reloaded.fail('victory-6', 7, 14, GameOverReason.Deadlock)).toBe(false);
    expect(reloaded.snapshot().lives).toBe(4);
    reloaded.beginAttempt('victory-6', 7, 20);
    expect(reloaded.getAttempt('victory-6')?.bank).toBe(14);
    expect(Object.keys(JSON.parse(storage.getItem(RESOURCES_KEY)!))).not.toContain('board');
  });

  it('does not reset an existing regeneration timer after another failure or grant lives on clock rollback', () => {
    const env = setup();
    env.resources.fail('new', 1, 0, GameOverReason.OutOfMoves);
    env.advance(10 * 60 * 1000);
    env.resources.beginAttempt('new', 1, 0);
    env.resources.fail('new', 1, 0, GameOverReason.OutOfMoves);
    expect(env.resources.snapshot().secondsToNext).toBe(1200);
    env.advance(-5 * 60 * 1000);
    const reloaded = new PlayerResources(env.storage, env.now);
    expect(reloaded.snapshot()).toEqual({ lives: 3, maximum: 5, secondsToNext: 1200 });
  });

  it.each(['broken', '{"version":2}', '{"version":1,"lives":-1}', 'null'])(
    'preserves unreadable/future resources: %s', raw => {
      const env = setup(); env.storage.setItem(RESOURCES_KEY, raw);
      const resources = new PlayerResources(env.storage, env.now);
      resources.fail('new', 1, 0, GameOverReason.Deadlock);
      resources.clearAttempt();
      expect(resources.status).toBe('preserved');
      expect(env.storage.getItem(RESOURCES_KEY)).toBe(raw);
    });

  it('continues in memory when storage is unavailable', () => {
    const resources = new PlayerResources({ getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() {} });
    resources.fail('new', 1, 0, GameOverReason.OutOfMoves);
    expect(resources.snapshot().lives).toBe(4);
    expect(resources.status).toBe('unavailable');
  });
});

describe('level and bank move budgets', () => {
  const session = () => new GameSession({ getConfig: level => ({ level, difficulty: LevelDifficulty.Hard, moves: 2, shuffles: 3, targetScore: 1000 }) });
  const move = (game: GameSession) => { game.onMoveInitiated(); game.onTurnCompleted(); };
  it('spends base before bank, fails only after both run out, and refreshes the same level on retry', () => {
    const game = session(); game.startLevel(7, 2);
    move(game); expect([game.getLevelMovesLeft(), game.getAccumulatedMoves()]).toEqual([1, 2]);
    move(game); expect([game.getLevelMovesLeft(), game.getAccumulatedMoves()]).toEqual([0, 2]);
    move(game); expect([game.getLevelMovesLeft(), game.getAccumulatedMoves()]).toEqual([0, 1]);
    game.addPoints(200); game.consumeShuffle(); move(game);
    expect(game.getState()).toBe(GameState.GameOver);
    expect(game.getGameOverReason()).toBe(GameOverReason.OutOfMoves);
    game.retryLevel();
    expect(game.getSnapshot()).toMatchObject({ level: 7, movesLeft: 2, levelMovesLeft: 2, accumulatedMoves: 0, shufflesLeft: 3, score: 0, globalScore: 0 });
    expect(game.canMakeMove()).toBe(true);
  });
  it('freezes both budgets in bonus, banks unused base, and keeps only unspent bank after deadlock', () => {
    const game = session(); game.startLevel(1, 3); move(game);
    game.addPoints(1000); move(game);
    expect([game.getLevelMovesLeft(), game.getAccumulatedMoves()]).toEqual([1, 3]);
    game.completeWithVictory(); game.advanceLevel();
    expect([game.getLevelMovesLeft(), game.getAccumulatedMoves()]).toEqual([2, 4]);
    move(game); move(game); move(game);
    game.addPoints(200); game.endWithDeadlock(); game.retryLevel();
    expect(game.getSnapshot()).toMatchObject({ level: 2, levelMovesLeft: 2, accumulatedMoves: 3, globalScore: 1000, score: 0 });
  });
});
