import { describe, expect, it, vi } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { LastChanceQueue } from '../src/core/LastChanceQueue.ts';
import { CascadeResolver, ICascadeResolver } from '../src/core/CascadeResolver.ts';
import { CascadeStep, SpecialType, TileColor } from '../src/core/TileTypes.ts';
import { GameSession, GameState, GameOverReason } from '../src/core/GameSession.ts';
import { LevelDifficulty } from '../src/core/LevelProgression.ts';
import { TurnCoordinator } from '../src/TurnCoordinator.ts';
import { IAnimationSequencer } from '../src/view/IAnimationSequencer.ts';
import { ObjectiveEvent } from '../src/core/BoardFeatures.ts';
import { TerrainResolver } from '../src/core/TerrainResolver.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { GameTelemetryService } from '../src/core/telemetry/GameTelemetryService.ts';

const step = (score = 0, events: ObjectiveEvent[] = []): CascadeStep => ({
  matchedTileIds: [], spawnedSpecials: [], drops: [], spawns: [], scoreGained: score, objectiveEvents: events,
});
const sessionWith = (moves = 1, bank = 0, target = 100, jelly = false) => {
  const session = new GameSession({ getConfig: level => ({ level, moves, targetScore: target,
    difficulty: LevelDifficulty.Easy, shuffles: 3,
    objectives: [{ kind: 'score', target }, ...(jelly ? [{ kind: 'jelly' as const, target: 1 }] : [])],
  }) });
  session.startLevel(1, bank);
  return session;
};
function setup(options: { moves?: number; bank?: number; score?: number; jelly?: boolean; events?: ObjectiveEvent[]; noActions?: boolean } = {}) {
  const board = new Board(3, 3);
  board.createTile(0, 0, TileColor.Red);
  board.createTile(0, 1, TileColor.Blue);
  const special = board.createTile(2, 2, TileColor.Yellow, SpecialType.StripedHorizontal);
  const session = sessionWith(options.moves ?? 1, options.bank ?? 0, 100, options.jelly);
  const resolver: ICascadeResolver = {
    resolveSwap: vi.fn(() => ({ valid: true, steps: [step(10)] })),
    resolveActivation: vi.fn((b, pos) => {
      b.set(pos.row, pos.col, null);
      return { valid: true, steps: [step(options.score ?? 90, options.events)] };
    }),
  };
  const animations: IAnimationSequencer = {
    animateSwap: vi.fn(async () => {}), animateShuffle: vi.fn(async () => {}),
    playCascadeSteps: vi.fn(async (steps: CascadeStep[], record: Parameters<IAnimationSequencer['playCascadeSteps']>[1]) => {
      steps.forEach(s => record(s.scoreGained, s.objectiveEvents));
    }),
  };
  const deadlocks = { hasPossibleMoves: vi.fn(() => !options.noActions),
    findPossibleMoves: () => [], shuffleBoard: vi.fn(() => ({ success: false, mapping: new Map() })) };
  const telemetry = new GameTelemetryService({ board, session, deadlockResolver: deadlocks, isInputLocked: () => !session.canMakeMove() });
  const coordinator = new TurnCoordinator({ board, session, cascadeResolver: resolver, animations, deadlockResolver: deadlocks, telemetry });
  const play = () => coordinator.playMove({ row: 0, col: 0 }, { row: 0, col: 1 });
  return { board, special, session, resolver, animations, deadlocks, coordinator, play, telemetry };
}

describe('last-chance queue', () => {
  it('captures usable specials in row order, excluding rocks, ingredients and ice', () => {
    const board = new Board(3, 3);
    board.createTile(2, 2, TileColor.Red, SpecialType.Airplane);
    board.createTile(0, 0, TileColor.Red, SpecialType.Rock);
    board.createTile(0, 1, TileColor.Red, SpecialType.Wrapped);
    board.getCell(0, 1)!.ice = 1;
    board.createTile(1, 0, TileColor.Red).kind = 'ingredient';
    const first = board.createTile(1, 1, TileColor.Blue, SpecialType.ColorBomb);
    const queue = new LastChanceQueue(board);
    expect(queue.next(board)?.id).toBe(first.id);
    expect(queue.next(board)?.special).toBe(SpecialType.Airplane);
    expect(queue.next(board)).toBeUndefined();
  });

  it('follows gravity, ignores new specials, and skips removed or already-triggered IDs', () => {
    const board = new Board(4, 4);
    const a = board.createTile(0, 0, TileColor.Red, SpecialType.Wrapped);
    const b = board.createTile(0, 1, TileColor.Blue, SpecialType.Airplane);
    board.createTile(0, 2, TileColor.Green, SpecialType.StripedVertical);
    const d = board.createTile(0, 3, TileColor.Yellow, SpecialType.ColorBomb);
    const queue = new LastChanceQueue(board);
    expect(queue.next(board)?.id).toBe(a.id);
    board.set(0, 1, null); board.set(3, 1, b);
    board.set(0, 2, null);
    board.createTile(1, 0, TileColor.Red, SpecialType.Wrapped);
    queue.record([{ ...step(), triggeredSpecials: [{ sourceTile: { ...d }, effectType: d.special, affectedTileIds: [d.id] }] }]);
    expect(queue.next(board)).toMatchObject({ id: b.id, row: 3, col: 1 });
    expect(queue.next(board)).toBeUndefined();
  });

  it('does not queue a replacement evolution even if it reuses an original ID', () => {
    const board = new Board(2, 2), a = board.createTile(0, 0, TileColor.Red, SpecialType.Airplane);
    const queue = new LastChanceQueue(board);
    queue.record([{ ...step(), spawnedSpecials: [{ ...a, special: SpecialType.ColorBomb }] }]);
    expect(queue.next(board)).toBeUndefined();
  });
});

describe('last-chance turn lifecycle', () => {
  it('rescues the level, reports automatic activations and permits bonus play at zero moves', async () => {
    const env = setup();
    const states: GameState[] = [];
    env.session.addListener({ onStateChanged: state => states.push(state) });
    await env.play();
    expect(states).toEqual([GameState.Resolving, GameState.LastChance, GameState.Ready]);
    expect(env.resolver.resolveActivation).toHaveBeenCalledWith(env.board, { row: 2, col: 2 }, false, 'last_chance');
    expect(env.session.isBonusPhase()).toBe(true);
    expect(env.session.canMakeMove()).toBe(true);
    expect(env.session.getMovesLeft()).toBe(0);
    expect(env.session.getShufflesLeft()).toBe(3);
    expect(env.telemetry.getRecentMoves().map(m => m.action)).toEqual(['swap', 'last_chance']);
    expect(env.telemetry.getSnapshot().lastTurn?.activationContext).toBe('last_chance');
  });

  it.each([false, true])('requires both score and feature goals before rescue (enoughScore=%s)', async enoughScore => {
    const env = setup({ jelly: true, score: enoughScore ? 90 : 20,
      events: enoughScore ? [] : [{ kind: 'jelly', amount: 1 }] });
    await env.play();
    expect(env.session.getState()).toBe(GameState.GameOver);
    expect(env.session.getGameOverReason()).toBe(GameOverReason.OutOfMoves);
    expect(env.deadlocks.shuffleBoard).not.toHaveBeenCalled();
  });

  it('counts objective events from the finale and wins if its completed board has no actions', async () => {
    const env = setup({ jelly: true, events: [{ kind: 'jelly', amount: 1 }], noActions: true });
    await env.play();
    expect(env.session.getState()).toBe(GameState.Victory);
    expect(env.session.getObjectives().every(p => p.current === p.objective.target)).toBe(true);
    expect(env.deadlocks.shuffleBoard).not.toHaveBeenCalled();
  });

  it.each([{ moves: 2 }, { bank: 1 }])('does not trigger while any move budget remains: %o', async options => {
    const env = setup(options);
    await env.play();
    expect(env.session.getMovesLeft()).toBe(1);
    expect(env.resolver.resolveActivation).not.toHaveBeenCalled();
  });

  it('does not trigger if the last ordinary cascade already completed the objectives', async () => {
    const env = setup(); env.session.addPoints(90);
    await env.play();
    expect(env.session.isBonusPhase()).toBe(true);
    expect(env.resolver.resolveActivation).not.toHaveBeenCalled();
  });

  it('fails normally when no usable special remains', async () => {
    const env = setup(); env.board.getCell(2, 2)!.ice = 1;
    const begin = vi.spyOn(env.session, 'beginLastChance');
    await env.play();
    expect(begin).not.toHaveBeenCalled();
    expect(env.session.getState()).toBe(GameState.GameOver);
  });

  it('also runs after the final player move is a direct activation', async () => {
    const env = setup({ score: 50 });
    env.board.createTile(0, 0, TileColor.Red, SpecialType.Wrapped);
    await env.coordinator.activateTile({ row: 0, col: 0 });
    expect(env.resolver.resolveActivation).toHaveBeenCalledTimes(2);
    expect(env.telemetry.getRecentMoves().map(m => m.action)).toEqual(['activate', 'last_chance']);
    expect(env.session.getScore()).toBe(100);
    expect(env.session.isBonusPhase()).toBe(true);
  });

  it('waits for playback, blocks input and snapshots, and delays failure until the queue ends', async () => {
    const env = setup({ score: 1 });
    let release = () => {};
    let entered = () => {};
    const started = new Promise<void>(resolve => { entered = resolve; });
    env.animations.playCascadeSteps = async (steps, record) => {
      if (env.session.getState() === GameState.LastChance) {
        entered(); await new Promise<void>(resolve => { release = resolve; });
      }
      steps.forEach(s => record(s.scoreGained, s.objectiveEvents));
    };
    const play = env.play(); await started;
    expect(env.session.getState()).toBe(GameState.LastChance);
    expect(env.session.canMakeMove()).toBe(false);
    expect(env.session.isBonusPhase()).toBe(false);
    expect(() => env.session.exportState()).toThrow('unfinished turn');
    expect(await env.coordinator.activateTile({ row: 2, col: 2 })).toBe(false);
    release(); await play;
    expect(env.session.getState()).toBe(GameState.GameOver);
  });

  it('finishes the original queue even after reaching the target, without activating new specials', async () => {
    const env = setup();
    env.board.createTile(2, 1, TileColor.Red, SpecialType.Airplane);
    const original = env.resolver.resolveActivation;
    env.resolver.resolveActivation = vi.fn((board, pos, avoid, context) => {
      const result = original(board, pos, avoid, context);
      board.createTile(pos.row, pos.col, TileColor.Red, SpecialType.Wrapped);
      return result;
    });
    await env.play();
    expect(env.resolver.resolveActivation).toHaveBeenCalledTimes(2);
    expect(env.session.getScore()).toBe(190);
    expect(env.session.isBonusPhase()).toBe(true);
  });
});

describe('automatic activation terrain policy', () => {
  it.each(['player', 'last_chance'] as const)('uses normal effects and cascades with %s chocolate policy', context => {
    const board = new Board(), random = new SeededRandomSource(21);
    new BoardInitializer(random).populate(board);
    board.get(0, 0)!.special = SpecialType.StripedHorizontal;
    const terrain = new TerrainResolver(random), spread = vi.spyOn(terrain, 'spread');
    const resolver = new CascadeResolver(undefined, undefined, undefined, undefined, undefined, terrain);
    const result = resolver.resolveActivation(board, { row: 0, col: 0 }, false, context);
    expect(result.valid).toBe(true);
    expect(result.steps[0].triggeredSpecials?.[0].effectType).toBe(SpecialType.StripedHorizontal);
    expect(result.steps[0].scoreGained).toBeGreaterThan(0);
    expect(result.steps[0].drops.length + result.steps[0].spawns.length).toBeGreaterThan(0);
    expect(spread).toHaveBeenCalledTimes(context === 'player' ? 1 : 0);
  });
});
