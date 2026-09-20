import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { BoardGravitySystem } from '../src/core/BoardGravitySystem.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { TerrainResolver } from '../src/core/TerrainResolver.ts';
import { LevelBoardSetup } from '../src/core/LevelFeatures.ts';
import { InfiniteLevelProgression } from '../src/core/LevelProgression.ts';
import { GameSession, GameState } from '../src/core/GameSession.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { ShuffleEngine } from '../src/core/ShuffleEngine.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { SpecialRegistry } from '../src/core/specials/SpecialRegistry.ts';
import { ScoreCalculator } from '../src/core/ScoreCalculator.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { SpecialType, TileColor, CascadeStep } from '../src/core/TileTypes.ts';
import { SaveCodec, SAVE_SCHEMA_VERSION, GAME_RULES_VERSION } from '../src/persistence/SaveCodec.ts';
import { LanguageService } from '../src/i18n/LanguageService.ts';
import { objectiveLabel } from '../src/ui/ObjectivesView.ts';
import { BoardView } from '../src/view/BoardView.ts';
import { AnimationQueue } from '../src/view/AnimationQueue.ts';
import gsap from 'gsap';

function setup(level = 1, seed = 20) {
  const board = new Board(), random = new SeededRandomSource(seed);
  const config = new InfiniteLevelProgression().getConfig(level), setup = new LevelBoardSetup();
  setup.configure(board, config.features);
  new BoardInitializer(random).populate(board);
  setup.placeObjects(board, config.features);
  const detector = new MatchDetector(), shuffle = new ShuffleEngine(detector, random);
  if (!shuffle.hasPossibleMoves(board)) expect(shuffle.shuffleBoard(board).success).toBe(true);
  const resolver = new CascadeResolver(new ScoreCalculator(), new BoardGravitySystem(), new TileSpawner(undefined, random),
    detector, new SpecialResolver(new SpecialRegistry(random)), new TerrainResolver(random));
  return { board, random, config, detector, shuffle, resolver };
}

function saveState(board: Board, session: GameSession, random: SeededRandomSource) {
  return { schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION, savedAt: '2026-09-20T12:00:00Z',
    board: board.getSnapshot(), session: session.exportState(), random: random.getSnapshot() };
}

describe('terrain, objects and matching', () => {
  it.each(['ingredient', 'frosting', 'crate', 'chocolate'] as const)('%s cannot form lines or squares', kind => {
    const board = new Board(3, 3);
    for (const [r, c] of [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]]) {
      const tile = board.createTile(r, c, TileColor.Red); tile.kind = kind;
      if (kind !== 'ingredient') tile.layers = 2;
    }
    expect(new MatchDetector().detectMatches(board)).toEqual([]);
    expect(new ShuffleEngine().hasPossibleMoves(board)).toBe(false);
  });

  it('ice blocks swaps, matches, activation and gravity until thawed', () => {
    const board = new Board(4, 3);
    const tile = board.createTile(1, 1, TileColor.Red, SpecialType.StripedVertical);
    board.getCell(1, 1)!.ice = 2;
    expect(board.canSwap(tile)).toBe(false);
    expect(board.canActivate(tile)).toBe(false);
    expect(new ShuffleEngine().hasPossibleMoves(board)).toBe(false);
    new BoardGravitySystem().applyGravity(board);
    expect(board.get(1, 1)?.id).toBe(tile.id);
    const a = board.createTile(1, 0, TileColor.Blue), b = board.createTile(1, 2, TileColor.Blue);
    const terrain = new TerrainResolver();
    terrain.applyHits(board, new Set([tile.id, a.id, b.id]));
    expect(board.getCell(1, 1)!.ice).toBe(1);
    expect(tile.special).toBe(SpecialType.StripedVertical);
    const next = terrain.applyHits(board, new Set([a.id]));
    expect(next.objectiveEvents).toContainEqual({ kind: 'blocker', blocker: 'ice', amount: 1 });
    expect(next.cellsAfter?.find(c => c.row === 1 && c.col === 1)?.ice).toBe(0);
    expect(board.canActivate(tile)).toBe(true);
  });

  it.each(['frosting', 'crate'] as const)('removes only one %s layer per pass, even with several hits', kind => {
    const board = new Board(3, 3), terrain = new TerrainResolver();
    const blocker = board.createTile(1, 1, TileColor.Red); blocker.kind = kind; blocker.layers = 3;
    const a = board.createTile(1, 0, TileColor.Blue), b = board.createTile(0, 1, TileColor.Green);
    for (let layers = 2; layers >= 0; layers--) {
      const destroyed = new Set([a.id, b.id, blocker.id]);
      const result = terrain.applyHits(board, destroyed);
      expect(blocker.layers).toBe(layers);
      expect(destroyed.has(blocker.id)).toBe(layers === 0);
      expect(result.objectiveEvents.filter(e => e.kind === 'blocker')).toHaveLength(layers === 0 ? 1 : 0);
    }
  });

  it('counts matched colors and jelly once, including the candy that evolves', () => {
    const board = new Board(3, 3), tile = board.createTile(1, 1, TileColor.Green);
    board.getCell(1, 1)!.jelly = 1;
    const result = new TerrainResolver().applyHits(board, new Set([tile.id]), [tile, tile]);
    expect(result.objectiveEvents).toEqual([{ kind: 'color', color: TileColor.Green, amount: 1 }, { kind: 'jelly', amount: 1 }]);
    expect(result.cellsAfter?.find(c => c.row === 1 && c.col === 1)?.jelly).toBe(0);
  });

  it('gaps split gravity and refill never creates a tile in a hole', () => {
    const board = new Board(6, 3);
    board.getCell(2, 1)!.playable = false;
    const top = board.createTile(0, 1, TileColor.Red), bottom = board.createTile(3, 1, TileColor.Green);
    const drops = new BoardGravitySystem().applyGravity(board);
    expect(drops).toContainEqual({ id: top.id, fromRow: 0, toRow: 1, col: 1 });
    expect(drops).toContainEqual({ id: bottom.id, fromRow: 3, toRow: 5, col: 1 });
    const spawns = new TileSpawner().refillEmptySlots(board);
    expect(board.get(2, 1)).toBeNull();
    expect(board.getSnapshot().tiles).toHaveLength(17);
    expect(spawns.every(s => s.appearInPlace)).toBe(true);
    expect(board.clone().getSnapshot()).toEqual(board.getSnapshot());
    const restored = new Board(6, 3); restored.restore(board.getSnapshot());
    expect(restored.getSnapshot()).toEqual(board.getSnapshot());
  });

  it('shuffles only unlocked candies and preserves cell terrain, blockers and ingredients', () => {
    const { board, shuffle } = setup(10);
    board.getCell(1, 1)!.ice = 2;
    const fixed = board.getSnapshot().tiles.filter(t => t.kind || !board.canSwap(t));
    const cells = board.getCells();
    shuffle.shuffleBoard(board);
    expect(board.getCells()).toEqual(cells);
    for (const t of fixed) expect(board.get(t.row, t.col)).toEqual(t);
    expect(new Set(board.getSnapshot().tiles.map(t => t.id)).size).toBe(board.getSnapshot().tiles.length);
  });
});

describe('ingredient and chocolate turn rules', () => {
  it('delivers cherries through gravity and emits a delivery event exactly once', () => {
    const { board, resolver } = setup(8);
    const cherry = board.get(0, 1)!;
    const laser = board.get(7, 1)!; laser.special = SpecialType.StripedVertical;
    const result = resolver.resolveActivation(board, laser);
    expect(result.valid).toBe(true);
    expect(result.steps.flatMap(s => s.objectiveEvents ?? []).filter(e => e.kind === 'ingredient'))
      .toContainEqual({ kind: 'ingredient', amount: 1 });
    expect(board.getSnapshot().tiles.some(t => t.id === cherry.id)).toBe(false);
    expect(result.steps.some(s => s.drops.some(d => d.id === cherry.id && d.toRow === 7))).toBe(true);
    expect(result.steps.filter(s => s.matchedTileIds.includes(cherry.id))).toHaveLength(1);
  });

  it('color bomb conversions cannot consume or transform ingredients, blockers or iced candies', () => {
    const { board, resolver } = setup(8);
    const cherry = board.get(0, 1)!; cherry.color = TileColor.Red;
    const crate = board.get(4, 7)!; crate.kind = 'crate'; crate.layers = 3; crate.color = TileColor.Red;
    const frozen = board.get(3, 6)!; frozen.color = TileColor.Red; board.getCell(3, 6)!.ice = 3;
    const a = board.get(0, 3)!, b = board.get(0, 4)!;
    a.special = SpecialType.ColorBomb; b.special = SpecialType.StripedHorizontal; b.color = TileColor.Red;
    resolver.resolveSwap(board, a, b);
    const ingredient = board.getSnapshot().tiles.find(t => t.id === cherry.id);
    if (ingredient) expect(ingredient.kind).toBe('ingredient');
    expect(frozen.special).toBe(SpecialType.None);
    expect(crate.special).toBe(SpecialType.None);
  });

  it('spreads once, deterministically, and protects exits, cherries, specials and ice', () => {
    const board = new Board(4, 4), random = new SeededRandomSource(123), terrain = new TerrainResolver(random);
    new BoardInitializer(random).populate(board);
    const chocolate = board.get(1, 1)!; chocolate.kind = 'chocolate'; chocolate.layers = 1;
    board.get(0, 1)!.kind = 'ingredient';
    board.get(1, 0)!.special = SpecialType.Wrapped;
    board.getCell(1, 2)!.exit = true;
    const only = board.get(2, 1)!;
    const before = board.getSnapshot(), rng = random.getSnapshot();
    const result = terrain.spread(board, []);
    expect(result?.matchedTileIds).toEqual([only.id]);
    expect(board.get(2, 1)!.kind).toBe('chocolate');
    const after = board.getSnapshot();
    board.restore(before); random.restore(rng);
    expect(terrain.spread(board, [])).toEqual(result);
    expect(board.getSnapshot()).toEqual(after);
    board.restore(before); board.getCell(2, 1)!.ice = 1;
    expect(terrain.spread(board, [])).toBeNull();
  });

  it('suppresses growth if any cascade cleared chocolate, but not for ordinary clears', () => {
    const { board } = setup(9), terrain = new TerrainResolver(new SeededRandomSource(5));
    const step: CascadeStep = { matchedTileIds: [], spawnedSpecials: [], drops: [], spawns: [], scoreGained: 0,
      objectiveEvents: [{ kind: 'blocker', blocker: 'chocolate', amount: 1 }] };
    expect(terrain.spread(board, [step])).toBeNull();
    expect(terrain.spread(board, [{ ...step, objectiveEvents: [] }])).not.toBeNull();
  });

  it('rejected swaps cannot spread chocolate or damage terrain', () => {
    const { board, resolver, random } = setup(9);
    const before = board.getSnapshot(), rng = random.getSnapshot();
    expect(resolver.resolveSwap(board, { row: 5, col: 2 }, { row: 5, col: 3 }).valid).toBe(false);
    expect(board.getSnapshot()).toEqual(before);
    expect(random.getSnapshot()).toEqual(rng);
  });
});

describe('objective progression and save migration', () => {
  it.each([4, 8, 10])('replays feature animations at level %s without corrupting tile identity or cell state', async level => {
    const { board, resolver, shuffle } = setup(level), view = new BoardView(board);
    view.initFromBoard(); view.updateLayout(388, 388);
    const queue = new AnimationQueue(view), speed = gsap.globalTimeline.timeScale();
    gsap.globalTimeline.timeScale(30);
    try {
      const move = shuffle.findPossibleMoves(board)[0];
      await queue.animateSwap(board.get(move.from.row, move.from.col)!.id, board.get(move.to.row, move.to.col)!.id, move.from, move.to);
      const result = resolver.resolveSwap(board, move.from, move.to);
      const snapshot = board.getSnapshot(), events = structuredClone(result.steps);
      await queue.playCascadeSteps(result.steps, () => {});
      expect(board.getSnapshot()).toEqual(snapshot); expect(result.steps).toEqual(events);
      board.forEachTile(tile => {
        const sprite = view.getTileSprite(tile.id)!;
        expect(sprite.tileData).toEqual(tile);
        expect({ x: sprite.x, y: sprite.y }).toEqual(view.gridToLocal(tile.row, tile.col));
      });
      await queue.animateShuffle(new Map());
    } finally { gsap.globalTimeline.timeScale(speed); view.destroy({ children: true }); }
  });
  it('requires every objective, not merely score, before freezing moves', () => {
    const config = new InfiniteLevelProgression().getConfig(10);
    const session = new GameSession({ getConfig: () => config });
    session.addPoints(999999);
    expect(session.isTargetReached()).toBe(false);
    session.recordObjectiveEvents([{ kind: 'jelly', amount: 8 }]);
    expect(session.isTargetReached()).toBe(false);
    session.recordObjectiveEvents([{ kind: 'ingredient', amount: 2 }]);
    expect(session.isTargetReached()).toBe(true);
    const moves = session.getMovesLeft(); session.onMoveInitiated();
    expect(session.getMovesLeft()).toBe(moves);
  });

  it('migrates v1 checkpoints in memory without changing their board, RNG, bank or completed level', () => {
    const { board, random } = setup(1), session = new GameSession();
    session.addPoints(4000); session.completeWithVictory();
    const old = saveState(board, session, random);
    old.schemaVersion = 1; old.rulesVersion = 1; delete old.session.objectiveProgress;
    const raw = JSON.stringify(old), migrated = new SaveCodec().decode(raw);
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION); expect(migrated.rulesVersion).toBe(GAME_RULES_VERSION);
    expect(migrated.board).toEqual(old.board); expect(migrated.random).toEqual(old.random);
    expect(migrated.session.movesLeft).toBe(old.session.movesLeft);
    const restored = new GameSession(); restored.restore(migrated.session);
    expect(restored.getState()).toBe(GameState.Victory);
    restored.advanceLevel();
    expect(restored.getLevelConfig().objectives?.map(o => o.kind)).toEqual(['score', 'color']);
    expect(JSON.stringify(old)).toBe(raw);
  });

  it('rejects terrain corruption and impossible ingredient/jelly progress', () => {
    const { board, random } = setup(10), session = new GameSession(undefined, 10);
    const save = saveState(board, session, random), codec = new SaveCodec();
    expect(() => codec.encode(save)).not.toThrow();
    const broken = structuredClone(save); broken.board.cells![0].playable = false;
    expect(() => codec.encode(broken)).toThrow();
    const progress = structuredClone(save); progress.session.objectiveProgress![2] = 2;
    expect(() => codec.encode(progress)).toThrow();
    const invalid = structuredClone(save); invalid.board.tiles.find(t => t.kind === 'ingredient')!.special = SpecialType.Wrapped;
    expect(() => codec.encode(invalid)).toThrow();
  });

  it('keeps a rules-v2 jelly victory complete even below the new minimum score', () => {
    const { board, random } = setup(3), session = new GameSession(undefined, 3);
    for (const cell of board.getCells()) board.getCell(cell.row, cell.col)!.jelly = 0;
    const legacy = saveState(board, session, random);
    legacy.rulesVersion = 2;
    legacy.session.config.objectives = [{ kind: 'jelly', target: 16 }];
    legacy.session.objectiveProgress = [16];
    legacy.session.state = GameState.Victory;
    const raw = JSON.stringify(legacy), decoded = new SaveCodec().decode(raw);
    expect(decoded.session).toEqual(legacy.session);
    session.restore(decoded.session);
    expect(session.isTargetReached()).toBe(true);
    expect(session.getScore()).toBe(0);
    session.advanceLevel();
    expect(session.getLevelConfig().objectives?.map(o => o.kind)).toEqual(['score', 'blocker']);
    expect(session.isTargetReached()).toBe(false);
    expect(JSON.stringify(legacy)).toBe(raw);
  });

  it.each([3, 4, 5, 6, 8, 9, 10])('restores a completed feature checkpoint and advances from level %s', level => {
    const { board, resolver, random } = setup(level);
    const session = new GameSession(undefined, level), codec = new SaveCodec();
    // Whole-board combos exercise durable layers, jelly, deliveries and their save invariants.
    for (let pass = 0; pass < 6 && !session.isTargetReached(); pass++) {
      const pair = board.getSnapshot().tiles.find(tile => board.canSwap(tile) && !tile.kind
        && board.canSwap({ row: tile.row, col: tile.col + 1 }) && !board.get(tile.row, tile.col + 1)!.kind)!;
      const a = board.get(pair.row, pair.col)!, b = board.get(pair.row, pair.col + 1)!;
      a.special = b.special = SpecialType.ColorBomb;
      const result = resolver.resolveSwap(board, a, b);
      expect(result.valid).toBe(true);
      for (const step of result.steps) {
        session.addPoints(step.scoreGained);
        session.recordObjectiveEvents(step.objectiveEvents ?? []);
      }
    }
    expect(session.isTargetReached()).toBe(true);
    session.completeWithVictory();
    const decoded = codec.decode(codec.encode(saveState(board, session, random)));
    const restored = new GameSession(); restored.restore(decoded.session);
    expect(restored.getState()).toBe(GameState.Victory);
    expect(restored.getObjectives()).toEqual(session.getObjectives());
    expect(decoded.board).toEqual(board.getSnapshot());
    restored.advanceLevel();
    expect(restored.getLevel()).toBe(level + 1);
    expect(restored.isTargetReached()).toBe(false);
  });

  it('localizes objective labels in both languages', () => {
    const language = new LanguageService();
    expect(objectiveLabel(language, { kind: 'color', color: TileColor.Red, target: 20 })).toBe('Collect red');
    language.toggle();
    expect(objectiveLabel(language, { kind: 'ingredient', target: 3 })).toBe('Entrega cerezas');
    expect(objectiveLabel(language, { kind: 'blocker', blocker: 'crate', target: 4 })).toBe('Elimina cajas');
  });

  it.each([7, 20, 99])('plays authored families across levels 2–28 with valid snapshots (seed %s)', seed => {
    for (let level = 2; level <= 28; level++) {
      const { board, random, resolver, shuffle, detector } = setup(level, seed);
      const session = new GameSession(undefined, level), codec = new SaveCodec();
      expect(detector.detectMatches(board)).toEqual([]);
      for (let turn = 0; turn < 12 && session.canMakeMove(); turn++) {
        expect(() => codec.encode(saveState(board, session, random))).not.toThrow();
        const moves = shuffle.findPossibleMoves(board);
        if (!moves.length) break;
        const move = random.pick(moves);
        const result = resolver.resolveSwap(board, move.from, move.to, session.isTargetReached());
        expect(result.valid).toBe(true);
        session.onMoveInitiated();
        for (const step of result.steps) { session.addPoints(step.scoreGained); session.recordObjectiveEvents(step.objectiveEvents ?? []); }
        session.onTurnCompleted();
        const tiles = board.getSnapshot().tiles;
        expect(new Set(tiles.map(t => t.id)).size).toBe(tiles.length);
        expect(tiles.every(t => board.isValidPosition(t.row, t.col))).toBe(true);
      }
      expect(() => codec.encode(saveState(board, session, random))).not.toThrow();
    }
  }, 20000);
});
