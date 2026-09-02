import { describe, it, expect, vi } from 'vitest';
import {
  InfiniteLevelProgression,
  ILevelProgression,
  LevelConfig,
} from '../src/core/LevelProgression.ts';
import { GameSession, GameState, GameOverReason } from '../src/core/GameSession.ts';

class FixedProgression implements ILevelProgression {
  constructor(private readonly template: Omit<LevelConfig, 'level'>) {}
  public getConfig(level: number): LevelConfig {
    return { level, ...this.template };
  }
}

describe('Infinite level progression', () => {
  const progression = new InfiniteLevelProgression();

  it('raises the target score on every level, without bound', () => {
    let previous = 0;
    for (let level = 1; level <= 30; level++) {
      const config = progression.getConfig(level);
      expect(config.targetScore).toBeGreaterThan(previous);
      previous = config.targetScore;
    }
    expect(progression.getConfig(1).targetScore).toBe(4000);
    expect(progression.getConfig(20).targetScore).toBeGreaterThan(
      progression.getConfig(10).targetScore
    );
  });

  it('tightens the move budget monotonically down to a playable floor', () => {
    const moves = Array.from({ length: 40 }, (_, i) => progression.getConfig(i + 1).moves);
    expect(moves[0]).toBe(25);
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i]).toBeLessThanOrEqual(moves[i - 1]);
    }
    expect(Math.min(...moves)).toBe(16);
  });

  it('always leaves at least one rescue shuffle, however deep the run gets', () => {
    expect(progression.getConfig(1).shuffles).toBe(4);
    expect(progression.getConfig(4).shuffles).toBe(3);
    expect(progression.getConfig(7).shuffles).toBe(2);
    for (let level = 10; level <= 200; level++) {
      expect(progression.getConfig(level).shuffles).toBe(1);
    }
  });

  it('clamps non-positive level numbers to level 1', () => {
    expect(progression.getConfig(0).level).toBe(1);
    expect(progression.getConfig(-5).moves).toBe(progression.getConfig(1).moves);
  });
});

describe('GameSession level ladder', () => {
  const makeSession = (moves = 5, targetScore = 1000, shuffles = 2) =>
    new GameSession(new FixedProgression({ moves, targetScore, shuffles }));

  it('advances to the next level after a victory and rebuilds the budgets', () => {
    const session = makeSession();
    const onLevelStarted = vi.fn();
    session.addListener({ onLevelStarted });

    session.startLevel(1);
    session.onMoveInitiated();
    session.addPoints(1500);
    expect(session.onTurnCompleted()).toBe(GameState.Victory);

    session.advanceLevel();
    expect(session.getLevel()).toBe(2);
    expect(session.getScore()).toBe(0);
    expect(session.getMovesLeft()).toBe(5);
    expect(session.getShufflesLeft()).toBe(2);
    expect(session.canMakeMove()).toBe(true);
    expect(onLevelStarted).toHaveBeenCalledTimes(2);
  });

  it('restarts the run back at level 1 after a loss', () => {
    const session = makeSession(1);
    session.startLevel(9);
    session.onMoveInitiated();
    expect(session.onTurnCompleted()).toBe(GameState.GameOver);

    session.restart();
    expect(session.getLevel()).toBe(1);
    expect(session.getState()).toBe(GameState.Ready);
  });

  it('publishes an infinite ladder with a real progression', () => {
    const session = new GameSession(new InfiniteLevelProgression());
    session.startLevel(1);
    const firstTarget = session.getTargetScore();

    for (let i = 0; i < 5; i++) session.advanceLevel();

    expect(session.getLevel()).toBe(6);
    expect(session.getTargetScore()).toBeGreaterThan(firstTarget);
  });
});

describe('Deadlock loss condition', () => {
  const makeSession = (shuffles: number) =>
    new GameSession(new FixedProgression({ moves: 10, targetScore: 9999, shuffles }));

  it('spends the rescue budget before the board becomes fatal', () => {
    const session = makeSession(2);
    const onShufflesUpdated = vi.fn();
    session.addListener({ onShufflesUpdated });
    session.startLevel(1);

    expect(session.consumeShuffle()).toBe(true);
    expect(session.getShufflesLeft()).toBe(1);
    expect(session.consumeShuffle()).toBe(true);
    expect(session.getShufflesLeft()).toBe(0);

    // Budget exhausted: the next deadlock ends the run.
    expect(session.consumeShuffle()).toBe(false);
    expect(session.endWithDeadlock()).toBe(GameState.GameOver);
    expect(session.getGameOverReason()).toBe(GameOverReason.Deadlock);
    expect(session.canMakeMove()).toBe(false);
  });

  it('reports a deadlock loss distinctly from running out of moves', () => {
    const outOfMoves = new GameSession(new FixedProgression({ moves: 1, targetScore: 9999, shuffles: 1 }));
    outOfMoves.startLevel(1);
    outOfMoves.onMoveInitiated();
    outOfMoves.onTurnCompleted();
    expect(outOfMoves.getGameOverReason()).toBe(GameOverReason.OutOfMoves);

    const jammed = makeSession(0);
    jammed.startLevel(1);
    jammed.endWithDeadlock();
    expect(jammed.getGameOverReason()).toBe(GameOverReason.Deadlock);
  });

  it('keeps a finished game finished when the turn closes afterwards', () => {
    const session = makeSession(0);
    session.startLevel(1);
    session.onMoveInitiated();
    session.endWithDeadlock();

    // onTurnCompleted must not resurrect the session into Ready.
    expect(session.onTurnCompleted()).toBe(GameState.GameOver);
    expect(session.getGameOverReason()).toBe(GameOverReason.Deadlock);
  });

  it('resets the rescue budget when a new level starts', () => {
    const session = makeSession(2);
    session.startLevel(1);
    session.consumeShuffle();
    session.consumeShuffle();
    expect(session.getShufflesLeft()).toBe(0);

    session.advanceLevel();
    expect(session.getShufflesLeft()).toBe(2);
  });
});
