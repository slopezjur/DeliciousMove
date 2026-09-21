import { describe, it, expect, vi } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { SpecialRegistry } from '../src/core/specials/SpecialRegistry.ts';
import { ScoreCalculator } from '../src/core/ScoreCalculator.ts';
import { BoardGravitySystem } from '../src/core/BoardGravitySystem.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { ShuffleEngine, IDeadlockResolver, ShuffleResult } from '../src/core/ShuffleEngine.ts';
import { GameSession, GameState, GameOverReason } from '../src/core/GameSession.ts';
import {
  ILevelProgression,
  InfiniteLevelProgression,
  LevelConfig,
  LevelDifficulty,
} from '../src/core/LevelProgression.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { ALL_TILE_COLORS, Position, TileColor } from '../src/core/TileTypes.ts';
import { TurnCoordinator } from '../src/TurnCoordinator.ts';
import { IAnimationSequencer } from '../src/view/IAnimationSequencer.ts';
import { IGameTelemetryService } from '../src/core/telemetry/IGameTelemetry.ts';

class FixedProgression implements ILevelProgression {
  constructor(private readonly template: Partial<LevelConfig>) {}
  public getConfig(level: number): LevelConfig {
    return {
      level,
      difficulty: LevelDifficulty.Easy,
      moves: 20,
      targetScore: 1000,
      shuffles: 2,
      ...this.template,
    };
  }
}

/** Records playback calls without touching Pixi or GSAP. */
class FakeAnimator implements IAnimationSequencer {
  public swaps: Position[][] = [];
  public shuffles = 0;
  public cascadeSteps = 0;

  public async animateSwap(_a: number, _b: number, posA: Position, posB: Position) {
    this.swaps.push([posA, posB]);
  }
  public async playCascadeSteps(steps: any[], onScoreGained: (score: number) => void) {
    this.cascadeSteps += steps.length;
    steps.forEach((s) => onScoreGained(s.scoreGained));
  }
  public async animateShuffle() {
    this.shuffles++;
  }
}

const makeCascadeResolver = (seed = 5) =>
  new CascadeResolver(
    new ScoreCalculator(),
    new BoardGravitySystem(),
    new TileSpawner(ALL_TILE_COLORS, new SeededRandomSource(seed)),
    new MatchDetector(),
    new SpecialResolver(new SpecialRegistry(new SeededRandomSource(seed)))
  );

/** Deadlock resolver stub so tests can force jams deterministically. */
class StubDeadlockResolver implements IDeadlockResolver {
  constructor(
    private readonly jammed: boolean,
    private readonly shuffleSucceeds = true
  ) {}
  public findPossibleMoves() {
    return [];
  }
  public hasPossibleMoves(): boolean {
    return !this.jammed;
  }
  public shuffleBoard(): ShuffleResult {
    return { success: this.shuffleSucceeds, mapping: new Map() };
  }
}

/** Board seeded with a guaranteed vertical 3-match at (4,6) after swapping with (3,6). */
const boardWithPendingMatch = () => {
  const board = new Board(8, 8);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.createTile(r, c, (r + c) % 2 === 0 ? TileColor.Purple : TileColor.Orange);
    }
  }
  board.get(4, 4)!.color = TileColor.Blue;
  board.get(4, 5)!.color = TileColor.Blue;
  board.get(3, 6)!.color = TileColor.Blue;
  return board;
};

const MATCH_SWAP: [Position, Position] = [
  { row: 3, col: 6 },
  { row: 4, col: 6 },
];

const makeCoordinator = (opts: {
  board: Board;
  session: GameSession;
  deadlockResolver?: IDeadlockResolver;
  animations?: FakeAnimator;
}) => {
  const animations = opts.animations ?? new FakeAnimator();
  const coordinator = new TurnCoordinator({
    board: opts.board,
    animations,
    cascadeResolver: makeCascadeResolver(),
    deadlockResolver:
      opts.deadlockResolver ??
      new ShuffleEngine(new MatchDetector(), new SeededRandomSource(9)),
    session: opts.session,
  });
  return { coordinator, animations };
};

describe('TurnCoordinator', () => {
  it('charges a move and awards points for a legal swap', async () => {
    const board = boardWithPendingMatch();
    const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 3 }));
    session.startLevel(1);

    const { coordinator, animations } = makeCoordinator({ board, session });
    const played = await coordinator.playMove(...MATCH_SWAP);

    expect(played).toBe(true);
    expect(session.getMovesLeft()).toBe(9);
    expect(session.getScore()).toBeGreaterThan(0);
    expect(animations.swaps.length).toBe(1);
    expect(animations.cascadeSteps).toBeGreaterThan(0);
    expect(session.getState()).toBe(GameState.Ready);
  });

  it('rejects an illegal swap without charging a move, and animates the revert', async () => {
    const board = boardWithPendingMatch();
    const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 3 }));
    session.startLevel(1);

    const { coordinator, animations } = makeCoordinator({ board, session });
    const played = await coordinator.playMove({ row: 0, col: 0 }, { row: 0, col: 1 });

    expect(played).toBe(false);
    expect(session.getMovesLeft()).toBe(10);
    expect(session.getScore()).toBe(0);
    // Swap out and swap back.
    expect(animations.swaps.length).toBe(2);
  });

  it('refuses to play once the run is over', async () => {
    const board = boardWithPendingMatch();
    const session = new GameSession(new FixedProgression({ moves: 1, targetScore: 99999, shuffles: 1 }));
    session.startLevel(1);
    session.endWithDeadlock();

    const { coordinator, animations } = makeCoordinator({ board, session });
    expect(await coordinator.playMove(...MATCH_SWAP)).toBe(false);
    expect(animations.swaps.length).toBe(0);
  });

  describe('infinite mode', () => {
    it('reaches Victory when the level target is met and 0 possible moves remain, then ladders up', async () => {
      const board = boardWithPendingMatch();
      const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 100, shuffles: 3 }));
      session.startLevel(1);

      // In bonus phase, victory triggers when 0 possible moves remain on the board
      const { coordinator } = makeCoordinator({
        board,
        session,
        deadlockResolver: new StubDeadlockResolver(true),
      });
      await coordinator.playMove(...MATCH_SWAP);

      expect(session.getState()).toBe(GameState.Victory);
      expect(session.canMakeMove()).toBe(false);

      session.advanceLevel();
      expect(session.getLevel()).toBe(2);
      expect(session.canMakeMove()).toBe(true);
    });

    it('freezes moves and continues bonus play when target is met and moves still remain', async () => {
      const board = boardWithPendingMatch();
      const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 100, shuffles: 3 }));
      session.startLevel(1);

      const { coordinator } = makeCoordinator({
        board,
        session,
        deadlockResolver: new StubDeadlockResolver(false),
      });
      await coordinator.playMove(...MATCH_SWAP);

      expect(session.isTargetReached()).toBe(true);
      expect(session.getState()).toBe(GameState.Ready);
      expect(session.getMovesLeft()).toBe(9); // 10 - 1 = 9 from the qualifying move

      // Subsequent moves during bonus phase do NOT decrement moves
      session.onMoveInitiated();
      expect(session.getMovesLeft()).toBe(9); // Frozen!
    });

    it('alternates difficulty and escalates cycle-over-cycle targets across many levels with the real progression', () => {
      const session = new GameSession(new InfiniteLevelProgression());
      session.startLevel(1);

      const configs: LevelConfig[] = [];
      for (let i = 0; i < 12; i++) {
        configs.push(session.getLevelConfig());
        session.advanceLevel();
      }

      expect(session.getLevel()).toBe(13);
      // Difficulty alternates in a 4-tier cycle
      expect(configs[0].difficulty).toBe(LevelDifficulty.Easy);
      expect(configs[1].difficulty).toBe(LevelDifficulty.Medium);
      expect(configs[2].difficulty).toBe(LevelDifficulty.Hard);
      expect(configs[3].difficulty).toBe(LevelDifficulty.VeryHard);
      expect(configs[4].difficulty).toBe(LevelDifficulty.Easy);

      // Cycle-over-cycle targets escalate
      expect(configs[4].targetScore).toBeGreaterThan(configs[0].targetScore);
      expect(configs[8].targetScore).toBeGreaterThan(configs[4].targetScore);
    });
  });

  describe('getting stuck', () => {
    it('fails out of moves without spending remaining shuffles, even on a jammed board', async () => {
      const session = new GameSession(new FixedProgression({ moves: 1, targetScore: 99999, shuffles: 3 }));
      const { coordinator, animations } = makeCoordinator({ board: boardWithPendingMatch(), session,
        deadlockResolver: new StubDeadlockResolver(true, false) });
      await coordinator.playMove(...MATCH_SWAP);
      expect(session.getGameOverReason()).toBe(GameOverReason.OutOfMoves);
      expect(session.getShufflesLeft()).toBe(3);
      expect(animations.shuffles).toBe(0);
    });
    it('spends a rescue shuffle when the board jams and the budget allows', async () => {
      const board = boardWithPendingMatch();
      const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 2 }));
      session.startLevel(1);

      const { coordinator, animations } = makeCoordinator({
        board,
        session,
        deadlockResolver: new StubDeadlockResolver(true, true),
      });

      await coordinator.playMove(...MATCH_SWAP);

      expect(animations.shuffles).toBe(1);
      expect(session.getShufflesLeft()).toBe(1);
      expect(session.getState()).toBe(GameState.Ready);
    });

    it('ends the run when the board jams with no rescue left', async () => {
      const board = boardWithPendingMatch();
      const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 0 }));
      session.startLevel(1);

      const { coordinator, animations } = makeCoordinator({
        board,
        session,
        deadlockResolver: new StubDeadlockResolver(true, true),
      });

      await coordinator.playMove(...MATCH_SWAP);

      expect(animations.shuffles).toBe(0);
      expect(session.getState()).toBe(GameState.GameOver);
      expect(session.getGameOverReason()).toBe(GameOverReason.Deadlock);
    });

    it('ends the run when even a rescue shuffle cannot unjam the board', async () => {
      const board = boardWithPendingMatch();
      const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 3 }));
      session.startLevel(1);

      const { coordinator, animations } = makeCoordinator({
        board,
        session,
        deadlockResolver: new StubDeadlockResolver(true, false),
      });

      await coordinator.playMove(...MATCH_SWAP);

      // Every remaining rescue is attempted before charging a life.
      expect(animations.shuffles).toBe(3);
      expect(session.getState()).toBe(GameState.GameOver);
      expect(session.getGameOverReason()).toBe(GameOverReason.Deadlock);
    });

    it('exhausts a multi-shuffle budget over consecutive jammed turns', async () => {
      const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 2 }));
      session.startLevel(1);
      const jammed = new StubDeadlockResolver(true, true);
      const animations = new FakeAnimator();

      for (let turn = 0; turn < 3; turn++) {
        const board = boardWithPendingMatch();
        const { coordinator } = makeCoordinator({
          board,
          session,
          deadlockResolver: jammed,
          animations,
        });
        await coordinator.playMove(...MATCH_SWAP);
      }

      expect(animations.shuffles).toBe(2);
      expect(session.getShufflesLeft()).toBe(0);
      expect(session.getGameOverReason()).toBe(GameOverReason.Deadlock);
    });

    it('does not touch the rescue budget while the board still has moves', async () => {
      const board = boardWithPendingMatch();
      const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 2 }));
      session.startLevel(1);

      const { coordinator, animations } = makeCoordinator({
        board,
        session,
        deadlockResolver: new StubDeadlockResolver(false),
      });

      await coordinator.playMove(...MATCH_SWAP);

      expect(animations.shuffles).toBe(0);
      expect(session.getShufflesLeft()).toBe(2);
    });
  });

  describe('deadlocks are actually reachable in real play', () => {
    /**
     * Plays a full level making random legal moves - the "improper movements" case -
     * and reports the turn on which the board jammed, or -1 if it never did.
     * Fixed seeds exercise reachable jams; they do not estimate a population-wide jam rate.
     */
    const playUntilJam = (seed: number, maxMoves = 30): number => {
      const random = new SeededRandomSource(seed);
      const board = new Board(8, 8);
      new BoardInitializer(random, ALL_TILE_COLORS).populate(board);

      const detector = new MatchDetector();
      const engine = new ShuffleEngine(detector, random);
      const resolver = new CascadeResolver(
        new ScoreCalculator(),
        new BoardGravitySystem(),
        new TileSpawner(ALL_TILE_COLORS, random),
        detector,
        new SpecialResolver(new SpecialRegistry(random))
      );

      for (let move = 0; move < maxMoves; move++) {
        const moves = engine.findPossibleMoves(board);
        if (moves.length === 0) return move;
        const pick = moves[random.nextInt(moves.length)];
        resolver.resolveSwap(board, pick.from, pick.to);
      }
      return -1;
    };

    it('jams a standard 6-color board during ordinary random play', () => {
      // 119 * 7919: a seed known to jam after 12 moves.
      expect(playUntilJam(942361)).toBe(12);
    });

    it('can play 30 legal moves without a jam for these fixed seeds', () => {
      // Swipe-directed stripes change the outcome of the former move-17 jam fixture.
      expect(playUntilJam(7919)).toBe(-1);
      expect(playUntilJam(190056)).toBe(-1);
    });

    it('turns a real jam into a loss once the rescue budget is gone', async () => {
      const board = new Board(8, 8);
      new BoardInitializer(new SeededRandomSource(942361), ALL_TILE_COLORS).populate(board);

      const session = new GameSession(
        new FixedProgression({ moves: 30, targetScore: 999999, shuffles: 1 })
      );
      session.startLevel(1);
      // The level's single rescue was already spent earlier in the run.
      expect(session.consumeShuffle()).toBe(true);

      const matchBoard = boardWithPendingMatch();
      const { coordinator } = makeCoordinator({
        board: matchBoard,
        session,
        deadlockResolver: new StubDeadlockResolver(true, true),
      });
      await coordinator.playMove(...MATCH_SWAP);

      expect(session.getState()).toBe(GameState.GameOver);
      expect(session.getGameOverReason()).toBe(GameOverReason.Deadlock);
    });
  });

  it('notifies listeners of the level, move and shuffle changes a HUD needs', async () => {
    const board = boardWithPendingMatch();
    const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 1 }));
    const onLevelStarted = vi.fn();
    const onMovesUpdated = vi.fn();
    const onShufflesUpdated = vi.fn();
    session.addListener({ onLevelStarted, onMovesUpdated, onShufflesUpdated });
    session.startLevel(1);

    const { coordinator } = makeCoordinator({
      board,
      session,
      deadlockResolver: new StubDeadlockResolver(true, true),
    });
    await coordinator.playMove(...MATCH_SWAP);

    expect(onLevelStarted).toHaveBeenCalledWith(
      expect.objectContaining({ level: 1, moves: 10, shuffles: 1 })
    );
    expect(onMovesUpdated).toHaveBeenCalledWith(9);
    expect(onShufflesUpdated).toHaveBeenCalledWith(0);
  });

  it('records rich cascade telemetry when telemetry service is injected', async () => {
    const board = boardWithPendingMatch();
    const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 99999, shuffles: 1 }));
    session.startLevel(1);

    const mockTelemetry: IGameTelemetryService = {
      recordSwap: vi.fn(),
      recordActivation: vi.fn(),
      recordShuffle: vi.fn(),
      recordStateTransition: vi.fn(),
      getRecentMoves: vi.fn().mockReturnValue([]),
      getSnapshot: vi.fn() as any,
      exportDiagnosticJson: vi.fn().mockReturnValue('{}'),
    };

    const coordinator = new TurnCoordinator({
      board,
      animations: new FakeAnimator(),
      cascadeResolver: makeCascadeResolver(),
      deadlockResolver: new StubDeadlockResolver(true, true),
      session,
      telemetry: mockTelemetry,
    });

    await coordinator.playMove(...MATCH_SWAP);

    expect(mockTelemetry.recordSwap).toHaveBeenCalledWith(
      MATCH_SWAP[0],
      MATCH_SWAP[1],
      true,
      expect.any(Number),
      expect.any(Number),
      expect.any(Array),
      expect.any(Array)
    );
  });
});
