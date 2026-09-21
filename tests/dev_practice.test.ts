import { afterEach, describe, expect, it, vi } from 'vitest';
import { practiceDependencies } from '../src/dev/practice.ts';
import { Board } from '../src/core/Board.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { GameState } from '../src/core/GameSession.ts';
import { TurnCoordinator } from '../src/TurnCoordinator.ts';

afterEach(() => vi.unstubAllGlobals());
function practice(query: string) {
  vi.stubGlobal('window', { location: { search: query } });
  vi.stubGlobal('document', { createElement: () => ({}), querySelector: () => null });
  return practiceDependencies();
}

describe('isolated finale practice fixture', () => {
  it('requires an explicit level-one practice URL', () => {
    expect(practice('?practiceLastChance=1')).toBeUndefined();
    expect(practice('?practiceLevel=2&practiceLastChance=1')?.session?.getMovesLeft()).toBe(18);
    expect(practice('?practiceLevel=1')?.session?.getMovesLeft()).toBe(22);
  });

  it('plays a real final-move cascade and automatic queue without storage access', async () => {
    const deps = practice('?practiceLevel=1&practiceLastChance=1')!;
    const board = new Board(), session = deps.session!;
    deps.boardInitializer!.populate(board);
    const states: GameState[] = [];
    session.addListener({ onStateChanged: state => states.push(state) });
    const coordinator = new TurnCoordinator({ board, session,
      cascadeResolver: new CascadeResolver(undefined, undefined, new TileSpawner(undefined, deps.random)),
      deadlockResolver: { hasPossibleMoves: () => true, findPossibleMoves: () => [],
        shuffleBoard: () => ({ success: true, mapping: new Map() }) },
      animations: { animateSwap: async () => {}, animateShuffle: async () => {},
        playCascadeSteps: async (steps, record) => steps.forEach(s => record(s.scoreGained, s.objectiveEvents)) },
    });
    expect(await coordinator.activateTile({ row: 0, col: 0 })).toBe(true);
    expect(states).toEqual([GameState.Resolving, GameState.LastChance, GameState.GameOver]);
    expect(session.getScore()).toBeGreaterThan(0);
    expect(session.getMovesLeft()).toBe(0);
    expect(session.getShufflesLeft()).toBe(4);
    expect(board.get(0, 0)).not.toBeNull();
    deps.storage!.setItem('fixture', 'isolated');
    expect(practice('?practiceLevel=1')!.storage!.getItem('fixture')).toBeNull();
  });
});
