import { describe, it, expect, vi } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { TileColor, SpecialType } from '../src/core/TileTypes.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { CascadeResolver } from '../src/core/CascadeResolver.ts';
import { SpecialResolver } from '../src/core/SpecialResolver.ts';
import { SpecialRegistry } from '../src/core/specials/SpecialRegistry.ts';
import { ScoreCalculator } from '../src/core/ScoreCalculator.ts';
import { BoardGravitySystem } from '../src/core/BoardGravitySystem.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { TurnCoordinator } from '../src/TurnCoordinator.ts';
import { GameSession } from '../src/core/GameSession.ts';
import { InfiniteLevelProgression } from '../src/core/LevelProgression.ts';
import { IDeadlockResolver } from '../src/core/ShuffleEngine.ts';
import { IAnimationSequencer } from '../src/view/IAnimationSequencer.ts';

function createFixedBoard(): Board {
  const board = new Board(8, 8);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board.createTile(r, c, (r + c) % 2 === 0 ? TileColor.Purple : TileColor.Orange);
    }
  }
  return board;
}

describe('2x2 Airplane & Free Special Activation Tests', () => {
  const rng = new SeededRandomSource(42);
  const registry = new SpecialRegistry(rng);
  const matchDetector = new MatchDetector();
  const cascadeResolver = new CascadeResolver(
    new ScoreCalculator(),
    new BoardGravitySystem(),
    new TileSpawner(undefined, rng),
    matchDetector,
    new SpecialResolver(registry)
  );

  describe('Airplane 2x2 Square Detection', () => {
    it('detects a 2x2 square of matching color and creates an Airplane', () => {
      const board = createFixedBoard();
      // Create a 2x2 square of Blue at (2, 2), (2, 3), (3, 2), (3, 3)
      board.get(2, 2)!.color = TileColor.Blue;
      board.get(2, 3)!.color = TileColor.Blue;
      board.get(3, 2)!.color = TileColor.Blue;
      board.get(3, 3)!.color = TileColor.Blue;

      const matches = matchDetector.detectMatches(board);
      expect(matches.length).toBe(1);
      expect(matches[0].tiles.length).toBe(4);
      expect(matches[0].spawnSpecial?.type).toBe(SpecialType.Airplane);
      expect(matches[0].spawnSpecial?.color).toBe(TileColor.Blue);
    });

    it('spawns the Airplane at the player interaction position', () => {
      const board = createFixedBoard();
      board.get(2, 2)!.color = TileColor.Green;
      board.get(2, 3)!.color = TileColor.Green;
      board.get(3, 2)!.color = TileColor.Green;
      board.get(3, 3)!.color = TileColor.Green;

      // Interaction position at (3, 3)
      const matches = matchDetector.detectMatches(board, [{ row: 3, col: 3 }]);
      expect(matches.length).toBe(1);
      expect(matches[0].spawnSpecial?.position).toEqual({ row: 3, col: 3 });
    });
  });

  describe('Free Special Dragging (without matching colors)', () => {
    it('allows swapping a Striped rocket with an adjacent normal tile and detonates it', () => {
      const board = createFixedBoard();
      // Put a Striped rocket at (4, 4)
      board.get(4, 4)!.special = SpecialType.StripedHorizontal;
      board.get(4, 4)!.color = TileColor.Red;

      // Normal tile at (4, 5) is Purple (no color match with Red)
      board.get(4, 5)!.color = TileColor.Purple;

      const result = cascadeResolver.resolveSwap(board, { row: 4, col: 4 }, { row: 4, col: 5 });
      expect(result.valid).toBe(true);
      expect(result.steps.length).toBeGreaterThanOrEqual(1);

      // Verify that step 0 triggered the special
      const step0 = result.steps[0];
      expect(step0.triggeredSpecials?.some((s) => s.effectType === SpecialType.StripedHorizontal)).toBe(true);
    });

    it('allows swapping a Wrapped bomb with an adjacent normal tile and detonates it', () => {
      const board = createFixedBoard();
      board.get(3, 3)!.special = SpecialType.Wrapped;
      board.get(3, 3)!.color = TileColor.Yellow;

      const result = cascadeResolver.resolveSwap(board, { row: 3, col: 3 }, { row: 3, col: 4 });
      expect(result.valid).toBe(true);
      expect(result.steps[0].triggeredSpecials?.some((s) => s.effectType === SpecialType.Wrapped)).toBe(true);
    });

    it('allows swapping an Airplane with an adjacent normal tile and detonates it', () => {
      const board = createFixedBoard();
      board.get(2, 2)!.special = SpecialType.Airplane;
      board.get(2, 2)!.color = TileColor.Blue;

      const result = cascadeResolver.resolveSwap(board, { row: 2, col: 2 }, { row: 2, col: 3 });
      expect(result.valid).toBe(true);
      expect(result.steps[0].triggeredSpecials?.some((s) => s.effectType === SpecialType.Airplane)).toBe(true);
      const effect = result.steps[0].triggeredSpecials?.find((s) => s.effectType === SpecialType.Airplane);
      expect(effect?.targetTile).toBeDefined();
    });
  });

  describe('Direct Click / Tap Activation', () => {
    it('activates a Striped rocket directly via resolveActivation without swapping', () => {
      const board = createFixedBoard();
      board.get(1, 1)!.special = SpecialType.StripedVertical;

      const result = cascadeResolver.resolveActivation(board, { row: 1, col: 1 });
      expect(result.valid).toBe(true);
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
      expect(result.steps[0].triggeredSpecials?.some((s) => s.effectType === SpecialType.StripedVertical)).toBe(true);
    });

    it('activates an Airplane directly and selects a target', () => {
      const board = createFixedBoard();
      board.get(5, 5)!.special = SpecialType.Airplane;

      const result = cascadeResolver.resolveActivation(board, { row: 5, col: 5 });
      expect(result.valid).toBe(true);
      const effect = result.steps[0].triggeredSpecials?.find((s) => s.effectType === SpecialType.Airplane);
      expect(effect).toBeDefined();
      expect(effect?.targetTile).toBeDefined();
    });

    it('activates a special candy via TurnCoordinator.activateTile and consumes 1 move', async () => {
      const board = createFixedBoard();
      board.get(2, 2)!.special = SpecialType.Wrapped;

      const session = new GameSession(new InfiniteLevelProgression());
      const initialMoves = session.getMovesLeft();

      const fakeDeadlock: IDeadlockResolver = {
        findPossibleMoves: () => [{ from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }],
        hasPossibleMoves: () => true,
        shuffleBoard: () => ({ success: true, mapping: new Map() }),
      };

      const fakeAnim: IAnimationSequencer = {
        animateSwap: vi.fn(),
        animateShuffle: vi.fn(),
        playCascadeSteps: vi.fn(),
      };

      const coordinator = new TurnCoordinator({
        board,
        animations: fakeAnim,
        cascadeResolver,
        deadlockResolver: fakeDeadlock,
        session,
      });

      const success = await coordinator.activateTile({ row: 2, col: 2 });
      expect(success).toBe(true);
      expect(session.getMovesLeft()).toBe(initialMoves - 1);
      expect(fakeAnim.playCascadeSteps).toHaveBeenCalled();
    });
  });

  describe('Airplane Combos', () => {
    it('executes Airplane + Airplane combo (launches 3 planes)', () => {
      const board = createFixedBoard();
      board.get(3, 3)!.special = SpecialType.Airplane;
      board.get(3, 4)!.special = SpecialType.Airplane;

      const result = cascadeResolver.resolveSwap(board, { row: 3, col: 3 }, { row: 3, col: 4 });
      expect(result.valid).toBe(true);
      const effect = result.steps[0].triggeredSpecials?.find((s) => s.effectType === 'combo_airplane_airplane');
      expect(effect).toBeDefined();
      expect(effect?.targetTile).toBeDefined();
      expect(effect?.secondaryTargets?.length).toBe(2);
    });

    it('executes Airplane + Striped combo (cross blast at destination)', () => {
      const board = createFixedBoard();
      board.get(3, 3)!.special = SpecialType.Airplane;
      board.get(3, 4)!.special = SpecialType.StripedHorizontal;

      const result = cascadeResolver.resolveSwap(board, { row: 3, col: 3 }, { row: 3, col: 4 });
      expect(result.valid).toBe(true);
      const effect = result.steps[0].triggeredSpecials?.find((s) => s.effectType === 'combo_airplane_striped');
      expect(effect).toBeDefined();
      expect(effect?.targetTile).toBeDefined();
    });

    it('executes Airplane + Wrapped combo (3x3 blast at destination)', () => {
      const board = createFixedBoard();
      board.get(3, 3)!.special = SpecialType.Airplane;
      board.get(3, 4)!.special = SpecialType.Wrapped;

      const result = cascadeResolver.resolveSwap(board, { row: 3, col: 3 }, { row: 3, col: 4 });
      expect(result.valid).toBe(true);
      const effect = result.steps[0].triggeredSpecials?.find((s) => s.effectType === 'combo_airplane_wrapped');
      expect(effect).toBeDefined();
      expect(effect?.targetTile).toBeDefined();
    });
  });
});
