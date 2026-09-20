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
import { IGameTelemetryService } from '../src/core/telemetry/IGameTelemetry.ts';

afterEach(() => vi.unstubAllGlobals());

describe('Extensible policies and isolated dependencies', () => {
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
    } as unknown as IGameTelemetryService;
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
