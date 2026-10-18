import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { BoardGravitySystem } from '../src/core/BoardGravitySystem.ts';
import { advanceMechanics } from '../src/core/BoardMechanics.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { GameSession, GameState } from '../src/core/GameSession.ts';
import { LevelDifficulty } from '../src/core/LevelProgression.ts';
import { LevelBoardSetup } from '../src/core/LevelFeatures.ts';
import { applyRoute, nextJourney, PerkEffects, type JourneyState } from '../src/core/Journey.ts';
import { puzzleFeatures } from '../src/core/AuthoredLevels.ts';
import { TerrainResolver } from '../src/core/TerrainResolver.ts';
import { SpecialType, TileColor } from '../src/core/TileTypes.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { SpecialRegistry, StripedHorizontalHandler } from '../src/core/specials/SpecialRegistry.ts';
import { PerkStripeHandler } from '../src/core/specials/PerkStripeHandler.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';

describe('journey choices', () => {
  it('expires old perks, refreshes selected perks, and rewards a cleared challenge', () => {
    const current: JourneyState = { route: 'challenge', perks: [{ id: 'airdrop', levelsLeft: 1 }, { id: 'thaw', levelsLeft: 3 }] };
    expect(nextJourney(current, { route: 'safe', perk: 'crosswind' })).toEqual({ route: 'safe',
      perks: [{ id: 'thaw', levelsLeft: 2 }, { id: 'crosswind', levelsLeft: 4 }] });
    expect(nextJourney(current, { route: 'safe', perk: 'thaw' })?.perks).toEqual([{ id: 'thaw', levelsLeft: 4 }]);
    expect(current.perks[0].levelsLeft).toBe(1);
  });

  it('changes only the upcoming challenge budget and mandatory score', () => {
    const config = { level: 2, moves: 18, shuffles: 3, difficulty: LevelDifficulty.Medium, targetScore: 5600,
      objectives: [{ kind: 'score' as const, target: 5600 }, { kind: 'color' as const, color: TileColor.Red, target: 24 }] };
    const tuned = applyRoute(config, { route: 'challenge', perks: [] });
    expect(tuned.moves).toBe(16); expect(tuned.targetScore).toBe(6450);
    expect(tuned.objectives?.[0].target).toBe(tuned.targetScore);
    expect(tuned.objectives?.[1]).toEqual(config.objectives[1]); expect(config.moves).toBe(18);
  });

  it('retains route and perk duration on retry and banks unused moves when bonus is finished', () => {
    const session = new GameSession({ getConfig: level => ({ level, moves: 5, shuffles: 1, targetScore: 100,
      difficulty: LevelDifficulty.Easy }) });
    session.addPoints(100); session.completeWithVictory(); session.advanceLevel({ route: 'challenge', perk: 'airdrop' });
    const journey = session.getSnapshot().journey;
    while (session.canMakeMove()) { session.onMoveInitiated(); session.onTurnCompleted(); }
    expect(session.getState()).toBe(GameState.GameOver); session.retryLevel();
    expect(session.getSnapshot().journey).toEqual(journey);
    session.addPoints(150); const moves = session.getMovesLeft();
    session.completeWithVictory(); session.advanceLevel({ route: 'safe', perk: 'thaw' });
    expect(session.getAccumulatedMoves()).toBe(moves);
    expect(session.getSnapshot().journey?.perks).toContainEqual({ id: 'thaw', levelsLeft: 4 });
  });
});

describe('turn-based board mechanisms', () => {
  it('moves a conveyor simultaneously and pauses the entire belt behind an ice lock', () => {
    const board = new Board(), setup = new LevelBoardSetup(), features = puzzleFeatures('conveyor').features;
    setup.configure(board, features); new BoardInitializer(new SeededRandomSource(10)).populate(board); setup.placeObjects(board, features);
    const belt = features.conveyors![0], ids = belt.map(p => board.get(p.row, p.col)!.id);
    const step = advanceMechanics(board)!;
    expect(step.transports).toHaveLength(belt.length);
    belt.forEach((p, i) => expect(board.get(p.row, p.col)!.id).toBe(ids[(i + ids.length - 1) % ids.length]));
    board.getCell(belt[0].row, belt[0].col)!.ice = 1;
    const before = board.getSnapshot().tiles;
    advanceMechanics(board);
    expect(board.getSnapshot().tiles).toEqual(before);
  });

  it('moves surviving candies through portals and preserves identity across columns', () => {
    const board = new Board(3, 2);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) board.createTile(r, c, TileColor.Blue);
    board.getCell(2, 0)!.portalTo = { row: 0, col: 1 };
    const id = board.get(2, 0)!.id; board.set(2, 1, null);
    const drops = new BoardGravitySystem().applyGravity(board);
    expect(board.get(0, 1)!.id).toBe(id);
    expect(drops).toContainEqual({ id, fromRow: 2, toRow: 0, fromCol: 0, col: 1, teleport: true });
    expect(board.get(0, 0)).toBeNull();
  });

  it('damages only the exposed boss node and rotates after three valid turns', () => {
    const board = new Board(), setup = new LevelBoardSetup(), features = puzzleFeatures('fountain').features;
    setup.configure(board, features); new BoardInitializer(new SeededRandomSource(11)).populate(board); setup.placeObjects(board, features);
    const [first, second] = features.boss!.weakSpots, terrain = new TerrainResolver();
    const target = board.get(first.row, first.col)!, shielded = board.get(second.row, second.col)!;
    terrain.applyHits(board, new Set([target.id, shielded.id]));
    expect(target.layers).toBe(2); expect(shielded.layers).toBe(3);
    for (let turn = 0; turn < 3; turn++) advanceMechanics(board);
    expect(board.getCell(first.row, first.col)!.bossShielded).toBe(true);
    expect(board.getCell(second.row, second.col)!.bossShielded).toBe(false);
  });

  it('does not advance belts, boss turns or chocolate after rejected swaps', () => {
    const board = new Board(), setup = new LevelBoardSetup(), features = puzzleFeatures('conveyor').features;
    setup.configure(board, features); new BoardInitializer(new SeededRandomSource(12)).populate(board); setup.placeObjects(board, features);
    const before = board.getSnapshot();
    expect(new CascadeResolver().resolveSwap(board, { row: 0, col: 0 }, { row: 3, col: 3 }).valid).toBe(false);
    expect(board.getSnapshot()).toEqual(before);
  });

  it('empowers only the first stripe and records its charge in the board snapshot', () => {
    const board = new Board(5, 5), perks = new PerkEffects();
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) board.createTile(r, c, TileColor.Green);
    perks.reset({ route: 'safe', perks: [{ id: 'crosswind', levelsLeft: 3 }] });
    const registry = new SpecialRegistry(); registry.registerEffectHandler(new PerkStripeHandler(new StripedHorizontalHandler(), perks));
    const resolver = new SpecialResolver(registry), source = board.get(1, 1)!; source.special = SpecialType.StripedHorizontal;
    const effects: Parameters<SpecialResolver['detonate']>[3] = [];
    resolver.detonate(board, [{ specials: [source] }], new Set(), effects);
    expect(effects).toHaveLength(2); expect(board.getSnapshot().mechanics?.stripeUsed).toBe(true);
    const second: typeof effects = []; resolver.detonate(board, [{ specials: [source] }], new Set(), second);
    expect(second).toHaveLength(1);
  });
});
