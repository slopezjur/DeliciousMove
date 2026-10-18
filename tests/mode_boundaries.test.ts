import { describe, expect, it, vi } from 'vitest';
import type { ICollectionRecorder } from '../src/core/Collection.ts';
import { GameOverReason } from '../src/core/GameSession.ts';
import { SpecialType, type SwapResult } from '../src/core/TileTypes.ts';
import { FreePlayResources } from '../src/modes/FreePlayResources.ts';
import { ModeProgress, modeProgress } from '../src/modes/ModeProgress.ts';
import { GAME_RULES_VERSION } from '../src/persistence/SaveCodec.ts';

function recorder(): ICollectionRecorder {
  return { observe: vi.fn(), completeLevel: vi.fn(), recordDaily: vi.fn() };
}
function delivery(amount: number): SwapResult {
  return { valid: true, steps: [{ matchedTileIds: [], spawnedSpecials: [], drops: [], spawns: [], scoreGained: 0,
    objectiveEvents: [{ kind: 'ingredient', amount }] }] };
}

describe('mode progress policies', () => {
  it('accumulates deliveries through an automatic finale and resets them for the next player turn', () => {
    const collection = recorder(), progress = modeProgress({ kind: 'campaign' }, collection);
    progress.startLevel(5); progress.beginTurn();
    progress.observe(delivery(2), [SpecialType.StripedHorizontal, SpecialType.StripedVertical]);
    expect(collection.observe).toHaveBeenLastCalledWith(['cross'], 2);
    progress.observe(delivery(1), undefined, true);
    expect(collection.observe).toHaveBeenLastCalledWith([], 3);
    progress.endTurn(true); progress.beginTurn(); progress.observe(delivery(1));
    expect(collection.observe).toHaveBeenLastCalledWith([], 1);
    progress.endTurn(true); progress.complete(5000, 5);
    expect(collection.completeLevel).toHaveBeenLastCalledWith(true);
    progress.complete(5000, 4);
    expect(collection.completeLevel).toHaveBeenLastCalledWith(false);
  });

  it('counts only accepted daily turns and never records campaign recipes', () => {
    const collection = recorder(), progress = modeProgress({ kind: 'daily', day: '2026-10-18', seed: 1 }, collection);
    progress.startLevel(0);
    progress.beginTurn(); progress.endTurn(false);
    progress.beginTurn(); progress.observe(delivery(3)); progress.observe(delivery(3), undefined, true); progress.endTurn(true);
    progress.beginTurn(); progress.complete(9000, 0); progress.endTurn(true);
    expect(collection.recordDaily).toHaveBeenCalledWith(`2026-10-18:${GAME_RULES_VERSION}`, { score: 9000, moves: 2 });
    expect(collection.observe).not.toHaveBeenCalled();
    expect(collection.completeLevel).not.toHaveBeenCalled();
  });

  it('recognizes only manual lab completion and resets it on retry', () => {
    const collection = recorder(), progress = modeProgress({ kind: 'lab', lesson: 'cross', seed: 1 }, collection);
    const pair = [SpecialType.StripedHorizontal, SpecialType.StripedVertical] as const;
    progress.startLevel(0); progress.beginTurn(); progress.observe(delivery(0), pair, true);
    expect(progress.lessonDone).toBe(false);
    progress.observe({ valid: false, steps: [] }, pair);
    expect(progress.lessonDone).toBe(false);
    progress.observe(delivery(0), pair);
    expect(progress.lessonDone).toBe(true);
    progress.endTurn(true); progress.complete(5000, 0); progress.startLevel(0);
    expect(progress.lessonDone).toBe(false);
    expect(collection.observe).not.toHaveBeenCalled();
    expect(collection.recordDaily).not.toHaveBeenCalled();
  });

  it('accepts a custom policy without changing game orchestration or requiring collection storage', () => {
    const complete = vi.fn(), progress = new ModeProgress({ complete });
    progress.startLevel(3); progress.beginTurn(); progress.endTurn(true); progress.complete(1500, 2);
    expect(complete).toHaveBeenCalledWith({ score: 1500, turns: 1, bank: 2, startingBank: 3 });
  });
});

describe('free-play resource substitution', () => {
  it('retains attempt identity, spent bank, journey isolation and idempotent failure without charging lives', () => {
    const resources = new FreePlayResources();
    const journey = { route: 'safe' as const, perks: [{ id: 'crosswind' as const, levelsLeft: 3 }] };
    expect(resources.beginAttempt('local', 1, 5, journey)).toBe(5);
    resources.spendBank('other', 1, 0); resources.spendBank('local', 1, 2);
    expect(resources.getAttempt('local')?.bank).toBe(2);
    expect(resources.fail('local', 1, 4, GameOverReason.OutOfMoves)).toBe(true);
    expect(resources.fail('local', 1, 4, GameOverReason.OutOfMoves)).toBe(false);
    const snapshot = resources.getAttempt('local')!;
    snapshot.journey!.perks[0].levelsLeft = 1;
    expect(resources.getAttempt('local')?.journey?.perks[0].levelsLeft).toBe(3);
    expect(resources.snapshot()).toEqual({ lives: 5, maximum: 5, secondsToNext: 0 });
    expect(resources.beginAttempt('local', 1, 9, journey)).toBe(2);
    expect(resources.getAttempt('local')?.failed).toBeUndefined();
    resources.clearAttempt(); expect(resources.getAttempt('local')).toBeUndefined();
  });
});
