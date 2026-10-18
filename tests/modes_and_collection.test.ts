import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { LevelBoardSetup } from '../src/core/LevelFeatures.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { GameOverReason } from '../src/core/GameSession.ts';
import { LESSON_IDS, lessonCompleted, lessonMove } from '../src/modes/Laboratory.ts';
import { COMBOS } from '../src/core/SpecialCombinations.ts';
import { dailySeed, modeConfig, parseMode, utcDay, type PlayMode } from '../src/modes/PlayMode.ts';
import { modeDependencies } from '../src/modes/ModeDependencies.ts';
import { CollectionStore, COLLECTION_KEY } from '../src/persistence/CollectionStore.ts';
import { GAME_RULES_VERSION } from '../src/persistence/SaveCodec.ts';
import { MemoryStorage } from '../src/persistence/Storage.ts';

function prepared(mode: Exclude<PlayMode, { kind: 'campaign' }>) {
  const deps = modeDependencies(mode), board = new Board(), setup = new LevelBoardSetup();
  setup.configure(board, modeConfig(mode).features); deps.boardInitializer!.populate(board);
  setup.placeObjects(board, modeConfig(mode).features);
  return { board, deps };
}

describe('daily and practice modes', () => {
  it('uses a shared UTC day and rejects links with incompatible rules', () => {
    expect(utcDay(new Date('2026-10-18T23:30:00-05:00'))).toBe('2026-10-19');
    expect(parseMode(new URLSearchParams(`mode=daily&day=2026-10-18&rules=${GAME_RULES_VERSION}`)))
      .toEqual({ kind: 'daily', day: '2026-10-18', seed: dailySeed('2026-10-18') });
    expect(parseMode(new URLSearchParams('mode=daily&rules=999'))).toBe('versionMismatch');
    expect(parseMode(new URLSearchParams('mode=lab&lesson=unknown'))).toMatchObject({ kind: 'lab', lesson: 'four' });
  });

  it('recreates identical daily boards and budgets independently of campaign resources', () => {
    const mode = { kind: 'daily' as const, day: '2026-10-18', seed: dailySeed('2026-10-18') };
    const first = prepared(mode), second = prepared(mode);
    expect(first.board.getSnapshot()).toEqual(second.board.getSnapshot());
    expect(first.deps.session!.getSnapshot()).toEqual(second.deps.session!.getSnapshot());
    expect(first.deps.storage).toBeInstanceOf(MemoryStorage);
    first.deps.resources!.fail('new', 1, 0, GameOverReason.OutOfMoves);
    expect(first.deps.resources!.snapshot().lives).toBe(5);
    first.deps.storage!.setItem('campaign-save', 'isolated');
    expect(second.deps.storage!.getItem('campaign-save')).toBeNull();
  });

  it.each(LESSON_IDS)('provides a legal lesson move and recognizes completion for %s', lesson => {
    const { board, deps } = prepared({ kind: 'lab', lesson, seed: 731 });
    const { from, to } = lessonMove(lesson);
    const pair = [board.get(from.row, from.col)!.special, board.get(to.row, to.col)!.special] as const;
    const resolver = new CascadeResolver(undefined, undefined, new TileSpawner(undefined, deps.random));
    const result = resolver.resolveSwap(board, from, to);
    expect(result.valid).toBe(true); expect(lessonCompleted(lesson, result, pair)).toBe(true);
    const moves = deps.session!.getMovesLeft();
    for (let turn = 0; turn < 120; turn++) { deps.session!.onMoveInitiated(); deps.session!.onTurnCompleted(); }
    expect(deps.session!.getMovesLeft()).toBe(moves);
  });
});

describe('persistent mastery and cosmetic rewards', () => {
  it('unlocks themes through actual recipe progress and preserves them across reloads', () => {
    const storage = new MemoryStorage(), collection = new CollectionStore(storage);
    collection.chooseTheme('royal'); expect(collection.snapshot().theme).toBe('classic');
    collection.completeLevel(true); expect(collection.unlocked('mint')).toBe(true);
    collection.observe(COMBOS.map(c => c.id), 3);
    collection.chooseTheme('royal');
    const reloaded = new CollectionStore(storage);
    expect(reloaded.unlocked('cocoa')).toBe(true); expect(reloaded.unlocked('royal')).toBe(true);
    expect(reloaded.snapshot().combos).toHaveLength(10); expect(reloaded.snapshot().theme).toBe('royal');
  });

  it('keeps the best daily score and uses fewer turns to break ties', () => {
    const collection = new CollectionStore(new MemoryStorage()), key = `2026-10-18:${GAME_RULES_VERSION}`;
    collection.recordDaily(key, { score: 9000, moves: 20 });
    collection.recordDaily(key, { score: 8000, moves: 15 });
    collection.recordDaily(key, { score: 9000, moves: 18 });
    expect(collection.snapshot().daily[key]).toEqual({ score: 9000, moves: 18 });
  });

  it.each(['{broken', '{"version":99}', 'null'])('preserves unreadable or unsupported collection data: %s', raw => {
    const storage = new MemoryStorage(); storage.setItem(COLLECTION_KEY, raw);
    const collection = new CollectionStore(storage); collection.completeLevel(true); collection.observe(['cross'], 3);
    expect(collection.status).toBe('preserved'); expect(storage.getItem(COLLECTION_KEY)).toBe(raw);
  });
});
