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
} from '../src/core/LevelProgression.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { ALL_TILE_COLORS, Position, TileColor } from '../src/core/TileTypes.ts';
import { TurnCoordinator } from '../src/TurnCoordinator.ts';
import { IAnimationSequencer } from '../src/view/IAnimationSequencer.ts';
import { IBoardViewAnimator } from '../src/view/IBoardViewContracts.ts';
import { TileSprite } from '../src/view/TileSprite.ts';

class FixedProgression implements ILevelProgression {
  constructor(private readonly template: Omit<LevelConfig, 'level'>) {}
  public getConfig(level: number): LevelConfig {
    return { level, ...this.template };
  }
}

/** Records playback calls without touching Pixi or GSAP. */
class FakeAnimator implements IAnimationSequencer {
  public swaps: Position[][] = [];
  public shuffles = 0;
  public cascadeSteps = 0;

  public async animateSwap(_a: TileSprite, _b: TileSprite, posA: Position, posB: Position) {
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

/** Minimal animator view: TurnCoordinator only ever looks sprites up by tile id. */
const fakeBoardView = (board: Board): IBoardViewAnimator =>
  ({
    board,
    getTileSprite: (id: number) => ({ id }) as unknown as TileSprite,
  }) as unknown as IBoardViewAnimator;

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
    boardView: fakeBoardView(opts.board),
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
    it('reaches Victory when the level target is met, then ladders up', async () => {
      const board = boardWithPendingMatch();
      const session = new GameSession(new FixedProgression({ moves: 10, targetScore: 100, shuffles: 3 }));
      session.startLevel(1);

      const { coordinator } = makeCoordinator({ board, session });
      await coordinator.playMove(...MATCH_SWAP);

      expect(session.getState()).toBe(GameState.Victory);
      expect(session.canMakeMove()).toBe(false);

      session.advanceLevel();
      expect(session.getLevel()).toBe(2);
      expect(session.canMakeMove()).toBe(true);
    });

    it('keeps escalating targets across many levels with the real progression', () => {
      const session = new GameSession(new InfiniteLevelProgression());
      session.startLevel(1);

      const targets: number[] = [];
      for (let i = 0; i < 12; i++) {
        targets.push(session.getTargetScore());
        session.advanceLevel();
      }

      expect(session.getLevel()).toBe(13);
      for (let i = 1; i < targets.length; i++) {
        expect(targets[i]).toBeGreaterThan(targets[i - 1]);
      }
    });
  });

  describe('getting stuck', () => {
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

      // The shuffle is still shown to the player before the loss is announced.
      expect(animations.shuffles).toBe(1);
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
     * Seeds come from a sweep over 400 simulated games; roughly 3% of them jam.
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

    it('leaves most games unjammed, so the risk stays occasional rather than routine', () => {
      // 5 * 7919 jams only on the very last move; 1 * 7919 never jams at all.
      expect(playUntilJam(7919)).toBe(-1);
      expect(playUntilJam(39595, 26)).toBe(25);
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
});
