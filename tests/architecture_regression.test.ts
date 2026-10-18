import { describe, it, expect, vi, afterEach } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { TileColor, SpecialType } from '../src/core/TileTypes.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { BonusRefillPolicy, IRefillPolicy } from '../src/core/refill/RefillPolicy.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { SpecialRegistry } from '../src/core/specials/SpecialRegistry.ts';
import { ISpecialComboHandler } from '../src/core/specials/ISpecialHandler.ts';
import { SoundManager } from '../src/audio/SoundManager.ts';
import { GameDebugController } from '../src/debug/GameDebugController.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { ITerrainResolver } from '../src/core/TerrainResolver.ts';
import { LivesView } from '../src/ui/LivesView.ts';
import { PerkStripeHandler } from '../src/core/specials/PerkStripeHandler.ts';

afterEach(() => vi.unstubAllGlobals());

describe('Extensible policies and isolated dependencies', () => {
  it.each(['player', 'last_chance'] as const)('injects mechanics refresh without a boss and advances only player turns (%s)', context => {
    const board = new Board(3, 3), source = board.createTile(1, 1, TileColor.Blue, SpecialType.Wrapped);
    const mechanics = {
      advance: vi.fn(() => null),
      refresh: vi.fn((b: Board) => { b.getCell(0, 0)!.jelly = 1; return b.getCells(); }),
    };
    const resolver = new CascadeResolver(undefined, undefined, { refillEmptySlots: () => [] }, undefined, undefined, undefined, mechanics);
    const result = resolver.resolveActivation(board, source, false, context);
    expect(result.steps[0].cellsAfter?.find(c => c.row === 0 && c.col === 0)?.jelly).toBe(1);
    expect(mechanics.refresh).toHaveBeenCalledOnce();
    expect(mechanics.advance).toHaveBeenCalledTimes(context === 'player' ? 1 : 0);
  });

  it('decorates a stripe using only a charge-consumption capability', () => {
    const board = new Board(3, 3), source = board.createTile(1, 1, TileColor.Blue, SpecialType.StripedHorizontal);
    const charge = { consumeStripe: vi.fn().mockReturnValueOnce(true).mockReturnValue(false) };
    const stripe = new PerkStripeHandler({ supportedType: SpecialType.StripedHorizontal,
      execute: context => ({ sourceTile: { ...context.sourceTile }, affectedTileIds: [], effectType: SpecialType.StripedHorizontal }) }, charge);
    const context = { board, sourceTile: source, destroyedTileIds: new Set<number>(), triggerQueue: [] };
    expect(stripe.execute(context).extraEffects?.[0].sourceTile.row).toBe(2);
    expect(stripe.execute(context).extraEffects).toBeUndefined();
    expect(charge.consumeStripe).toHaveBeenCalledWith(board);
  });

  it('detects matches with a registry that exposes no registration operations', () => {
    const board = new Board(3, 3);
    board.createTile(0, 0, TileColor.Blue); board.createTile(0, 1, TileColor.Blue); board.createTile(0, 2, TileColor.Blue);
    const rules = new (class {
      getRules() { return [{ priority: 1, evaluate: () => [{ color: TileColor.Blue,
        tiles: [board.get(0, 0)!, board.get(0, 1)!, board.get(0, 2)!] }] }]; }
    })();
    expect(new MatchDetector(rules).detectMatches(board)[0].tiles).toHaveLength(3);
  });

  it('runs effects with a read-only special registry and an independent terrain implementation', () => {
    const board = new Board(3, 3), source = board.createTile(1, 1, TileColor.Blue, SpecialType.Wrapped);
    const effects = new SpecialResolver({ getEffectHandler: () => ({ supportedType: SpecialType.Wrapped,
      execute: () => ({ sourceTile: source, effectType: source.special, affectedTileIds: [source.id] }) }),
      findComboHandler: () => undefined });
    const terrain: ITerrainResolver = { applyHits: vi.fn(() => ({ objectiveEvents: [], updatedTiles: [] })),
      spread: vi.fn(() => null) };
    const resolver = new CascadeResolver(undefined, undefined, { refillEmptySlots: () => [] }, undefined, effects, terrain);
    const result = resolver.resolveActivation(board, source);
    expect(result.valid).toBe(true);
    expect(result.steps[0].matchedTileIds).toEqual([source.id]);
    expect(terrain.applyHits).toHaveBeenCalledOnce();
    expect(terrain.spread).toHaveBeenCalledOnce();
  });

  it('renders a countdown through a translator with no storage or language-preference methods', () => {
    const timer = { textContent: '' };
    vi.stubGlobal('document', { getElementById: (id: string) => id === 'lives-timer' ? timer : null });
    new LivesView({ locale: 'en', t: (_key, params) => `Remaining: ${params?.time}` })
      .render({ lives: 1, maximum: 5, secondsToNext: 61 }, 'available');
    expect(timer.textContent).toBe('Remaining: 1:01');
  });

  it('selects a newly registered color-bomb combo ahead of the generic fallback', () => {
    const board = new Board(2, 2);
    const bomb = board.createTile(0, 0, TileColor.Red, SpecialType.ColorBomb);
    const wrapped = board.createTile(0, 1, TileColor.Blue, SpecialType.Wrapped);
    const registry = new SpecialRegistry();
    const custom: ISpecialComboHandler = {
      name: 'CustomBombWrapped',
      canHandle: (a, b) => a.special === SpecialType.ColorBomb && b.special === SpecialType.Wrapped,
      execute: () => ({ effects: [], secondaryDetonations: [] }),
    };
    registry.registerComboHandler(custom);
    expect(registry.findComboHandler(bomb, wrapped)).toBe(custom);
    wrapped.special = SpecialType.StripedHorizontal;
    expect(registry.findComboHandler(bomb, wrapped)?.name).toBe('ColorBombStriped');
  });

  it('supports explicit overrides without editing existing combo handlers', () => {
    const board = new Board(2, 2);
    const a = board.createTile(0, 0, TileColor.Red, SpecialType.StripedHorizontal);
    const b = board.createTile(0, 1, TileColor.Blue, SpecialType.StripedVertical);
    const registry = new SpecialRegistry();
    const override: ISpecialComboHandler = {
      name: 'Override',
      canHandle: () => true,
      execute: () => ({ effects: [], secondaryDetonations: [] }),
    };
    registry.registerComboHandler(override, -1);
    expect(registry.findComboHandler(a, b)).toBe(override);
  });

  it('allows a refill policy to change tile selection without changing cell traversal', () => {
    const board = new Board(2, 2);
    const existing = board.createTile(1, 0, TileColor.Red);
    const policy: IRefillPolicy = {
      beginWave: () => ({
        nextTile: () => ({ color: TileColor.Blue, special: SpecialType.Wrapped }),
      }),
    };
    const spawner = new TileSpawner(undefined, new SeededRandomSource(1), { normal: policy, bonus: policy });
    const spawns = spawner.refillEmptySlots(board);
    expect(spawns).toHaveLength(3);
    expect(board.get(1, 0)).toBe(existing);
    expect(spawns.every(({ tile }) => tile.special === SpecialType.Wrapped)).toBe(true);
  });

  it('keeps bonus rock budgets isolated between concurrent waves', () => {
    const board = new Board(4, 4);
    const policy = new BonusRefillPolicy([TileColor.Blue, TileColor.Green], new SeededRandomSource(1), {
      maxRocksPerWave: 2, rockChance: 1,
    });
    const a = policy.beginWave();
    const b = policy.beginWave();
    expect(a.nextTile(board, 3, 0).special).toBe(SpecialType.Rock);
    expect(a.nextTile(board, 2, 0).special).toBeUndefined();
    expect(a.nextTile(board, 3, 1).special).toBe(SpecialType.Rock);
    expect(a.nextTile(board, 3, 2).special).toBeUndefined();
    expect(b.nextTile(board, 3, 0).special).toBe(SpecialType.Rock);
    expect(b.nextTile(board, 3, 1).special).toBe(SpecialType.Rock);
  });

  it('does not share mute state between independent sound services', () => {
    const a = new SoundManager();
    const b = new SoundManager();
    expect(a.toggleMute()).toBe(true);
    expect(a.isMuted()).toBe(true);
    expect(b.isMuted()).toBe(false);
    expect(a.toggleMute()).toBe(false);
  });

  it('wires browser diagnostics to injected commands and clipboard', async () => {
    vi.stubGlobal('window', {});
    const telemetry = {
      getRecentMoves: vi.fn().mockReturnValue([]),
      getSnapshot: vi.fn(),
      exportDiagnosticJson: () => '{"level":1}',
    };
    const actions = { onUnlockInput: vi.fn(), onForceShuffle: vi.fn() };
    const clipboard = { copyText: vi.fn().mockResolvedValue(true) };
    new GameDebugController(telemetry, actions, clipboard);
    window.__GAME_DEBUG__!.unlockInput();
    window.__GAME_DEBUG__!.forceShuffle();
    await window.__GAME_DEBUG__!.copyReport();
    expect(actions.onUnlockInput).toHaveBeenCalledOnce();
    expect(actions.onForceShuffle).toHaveBeenCalledOnce();
    expect(clipboard.copyText).toHaveBeenCalledWith('{"level":1}');
  });
});
