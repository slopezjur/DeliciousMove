import { describe, it, expect, vi } from 'vitest';
import {
  InfiniteLevelProgression,
  ILevelProgression,
  LevelConfig,
  LevelDifficulty,
} from '../src/core/LevelProgression.ts';
import { GameSession, GameState, GameOverReason } from '../src/core/GameSession.ts';

class FixedProgression implements ILevelProgression {
  constructor(private readonly template: Partial<LevelConfig>) {}
  public getConfig(level: number): LevelConfig {
    return {
      level,
      difficulty: LevelDifficulty.Easy,
      moves: 5,
      targetScore: 1000,
      shuffles: 2,
      ...this.template,
    };
  }
}

describe('Alternating infinite level progression', () => {
  const progression = new InfiniteLevelProgression();

  it('alternates difficulties in a repeating 4-tier cycle (Easy -> Medium -> Hard -> Very Hard)', () => {
    expect(progression.getConfig(1).difficulty).toBe(LevelDifficulty.Easy);
    expect(progression.getConfig(2).difficulty).toBe(LevelDifficulty.Medium);
    expect(progression.getConfig(3).difficulty).toBe(LevelDifficulty.Hard);
    expect(progression.getConfig(4).difficulty).toBe(LevelDifficulty.VeryHard);

    expect(progression.getConfig(5).difficulty).toBe(LevelDifficulty.Easy);
    expect(progression.getConfig(6).difficulty).toBe(LevelDifficulty.Medium);
    expect(progression.getConfig(7).difficulty).toBe(LevelDifficulty.Hard);
    expect(progression.getConfig(8).difficulty).toBe(LevelDifficulty.VeryHard);
  });

  it('assigns base moves and shuffles according to difficulty tier', () => {
    const easy = progression.getConfig(1);
    const medium = progression.getConfig(2);
    const hard = progression.getConfig(3);
    const veryHard = progression.getConfig(4);

    expect(easy.moves).toBe(22);
    expect(easy.shuffles).toBe(4);

    expect(medium.moves).toBe(18);
    expect(medium.shuffles).toBe(3);

    expect(hard.moves).toBe(15);
    expect(hard.shuffles).toBe(2);

    expect(veryHard.moves).toBe(12);
    expect(veryHard.shuffles).toBe(1);
  });

  it('steps target score down on Easy levels compared to preceding Very Hard levels to provide move banking relief', () => {
    const level4 = progression.getConfig(4); // Very Hard
    const level5 = progression.getConfig(5); // Easy
    expect(level5.targetScore).toBeLessThan(level4.targetScore);
    expect(level5.moves).toBeGreaterThan(level4.moves);
  });

  it('scales baseline difficulty across 4-level cycles', () => {
    expect(progression.getConfig(5).targetScore).toBeGreaterThan(progression.getConfig(1).targetScore);
    expect(progression.getConfig(9).targetScore).toBeGreaterThan(progression.getConfig(5).targetScore);
  });

  it('clamps non-positive level numbers to level 1', () => {
    expect(progression.getConfig(0).level).toBe(1);
    expect(progression.getConfig(-5).moves).toBe(progression.getConfig(1).moves);
  });
});

describe('GameSession level ladder & move accumulation', () => {
  const makeSession = (moves = 5, targetScore = 1000, shuffles = 2) =>
    new GameSession(new FixedProgression({ moves, targetScore, shuffles }));

  it('advances to the next level after a victory and accumulates unused moves', () => {
    const session = makeSession();
    const onLevelStarted = vi.fn();
    session.addListener({ onLevelStarted });

    session.startLevel(1);
    session.onMoveInitiated();
    session.addPoints(1500);
    // Minimum target reached: qualifies for level clear and enters bonus overtime phase
    expect(session.isTargetReached()).toBe(true);
    expect(session.onTurnCompleted()).toBe(GameState.Ready);
    expect(session.completeWithVictory()).toBe(GameState.Victory);

    session.advanceLevel();
    expect(session.getLevel()).toBe(2);
    expect(session.getScore()).toBe(0);
    // 5 base moves + 4 leftover moves = 9
    expect(session.getMovesLeft()).toBe(9);
    expect(session.getAccumulatedMoves()).toBe(4);
    expect(session.getShufflesLeft()).toBe(2);
    expect(session.canMakeMove()).toBe(true);
    expect(onLevelStarted).toHaveBeenCalledTimes(2);
  });

  it('resets accumulated moves and global score back to 0 when restarting after game over', () => {
    const session = makeSession(5, 1000, 2);
    session.startLevel(1);
    session.addPoints(1500); // 5 moves remaining
    expect(session.completeWithVictory()).toBe(GameState.Victory);

    session.advanceLevel();
    expect(session.getMovesLeft()).toBe(10); // 5 base + 5 carried
    expect(session.getGlobalScore()).toBe(1500);

    session.restart();
    expect(session.getLevel()).toBe(1);
    expect(session.getMovesLeft()).toBe(5);
    expect(session.getAccumulatedMoves()).toBe(0);
    expect(session.getGlobalScore()).toBe(0);
    expect(session.getState()).toBe(GameState.Ready);
  });

  it('freezes moves once the minimum target score is achieved', () => {
    const session = makeSession(5, 1000, 2);
    session.startLevel(1);

    // Initial move before target
    session.onMoveInitiated();
    expect(session.getMovesLeft()).toBe(4);

    // Reach minimum target
    session.addPoints(1000);
    expect(session.isTargetReached()).toBe(true);
    expect(session.isBonusPhase()).toBe(true);

    // Subsequent moves in bonus phase do NOT consume moves
    session.onTurnCompleted();
    expect(session.getState()).toBe(GameState.Ready);
    session.onMoveInitiated();
    expect(session.getMovesLeft()).toBe(4); // Frozen!

    session.onMoveInitiated();
    expect(session.getMovesLeft()).toBe(4); // Still frozen!
  });

  it('publishes an infinite ladder with alternating progression', () => {
    const session = new GameSession(new InfiniteLevelProgression());
    session.startLevel(1);
    expect(session.getLevelConfig().difficulty).toBe(LevelDifficulty.Easy);

    session.advanceLevel();
    expect(session.getLevelConfig().difficulty).toBe(LevelDifficulty.Medium);

    session.advanceLevel();
    expect(session.getLevelConfig().difficulty).toBe(LevelDifficulty.Hard);

    session.advanceLevel();
    expect(session.getLevelConfig().difficulty).toBe(LevelDifficulty.VeryHard);

    session.advanceLevel();
    expect(session.getLevelConfig().difficulty).toBe(LevelDifficulty.Easy);
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
