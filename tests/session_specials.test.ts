import { describe, it, expect } from 'vitest';
import { ScoreCalculator } from '../src/core/ScoreCalculator.ts';
import { GameSession, GameState, GameOverReason } from '../src/core/GameSession.ts';
import { ILevelProgression, LevelConfig, LevelDifficulty } from '../src/core/LevelProgression.ts';
import { BoardGravitySystem } from '../src/core/BoardGravitySystem.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { Board } from '../src/core/Board.ts';
import { TileColor, SpecialType, TileData } from '../src/core/TileTypes.ts';
import {
  SpecialRegistry,
  DoubleColorBombComboHandler,
  ColorBombStripedComboHandler,
} from '../src/core/specials/SpecialRegistry.ts';
import { ISpecialEffectHandler, SpecialTriggerEffect } from '../src/core/specials/ISpecialHandler.ts';

/** Fixed single-level progression so session tests never depend on the scaling curve. */
class FixedProgression implements ILevelProgression {
  constructor(private readonly template: Partial<LevelConfig>) {}
  public getConfig(level: number): LevelConfig {
    return {
      level,
      difficulty: LevelDifficulty.Easy,
      moves: 20,
      targetScore: 1000,
      shuffles: 2,
      ...this.template,
    };
  }
}

const sessionWith = (moves: number, targetScore: number, shuffles = 2) =>
  new GameSession(new FixedProgression({ moves, targetScore, shuffles }));

describe('SOLID Refactoring Unit Tests', () => {
  describe('ScoreCalculator (SRP)', () => {
    it('calculates score with combo multipliers correctly', () => {
      const calc = new ScoreCalculator(60);
      expect(calc.calculateStepScore(3, 1)).toBe(180);
      expect(calc.calculateStepScore(4, 2)).toBe(480);
      expect(calc.calculateStepScore(5, 3)).toBe(900);
    });

    it('defaults multiplier to at least 1', () => {
      const calc = new ScoreCalculator(60);
      expect(calc.calculateStepScore(3, 0)).toBe(180);
    });
  });

  describe('BoardGravitySystem & TileSpawner (SRP)', () => {
    it('drops hanging tiles to the bottom of the column', () => {
      const board = new Board(4, 4);
      // Place a tile at (0, 1) and leave (1, 1), (2, 1), (3, 1) empty
      const t = board.createTile(0, 1, TileColor.Red);

      const gravity = new BoardGravitySystem();
      const drops = gravity.applyGravity(board);

      expect(drops.length).toBe(1);
      expect(drops[0].id).toBe(t.id);
      expect(drops[0].fromRow).toBe(0);
      expect(drops[0].toRow).toBe(3);
      expect(board.get(3, 1)?.id).toBe(t.id);
      expect(board.get(0, 1)).toBeNull();
    });

    it('refills empty spaces at top of board', () => {
      const board = new Board(4, 4);
      // Row 3 has a tile, rows 0-2 are empty
      board.createTile(3, 0, TileColor.Blue);

      const spawner = new TileSpawner([TileColor.Green]);
      const spawns = spawner.refillEmptySlots(board);

      expect(spawns.length).toBe(15);
      expect(board.get(0, 0)?.color).toBe(TileColor.Green);
      expect(board.get(1, 0)?.color).toBe(TileColor.Green);
      expect(board.get(2, 0)?.color).toBe(TileColor.Green);
      expect(board.get(3, 0)?.color).toBe(TileColor.Blue);
    });
  });

  describe('GameSession State Machine (SRP)', () => {
    it('manages moves and transitions to Victory when score reaches target', () => {
      const session = sessionWith(5, 1000);
      let stateLog: GameState[] = [];
      session.addListener({
        onStateChanged: (s) => stateLog.push(s),
      });

      expect(session.canMakeMove()).toBe(true);
      session.onMoveInitiated();
      expect(session.getMovesLeft()).toBe(4);
      expect(session.getState()).toBe(GameState.Resolving);

      session.addPoints(1200);
      expect(session.getScore()).toBe(1200);

      const finalState = session.onTurnCompleted();
      expect(finalState).toBe(GameState.Victory);
      expect(session.canMakeMove()).toBe(false);
    });

    it('transitions to GameOver when moves reach 0 before target', () => {
      const session = sessionWith(1, 1000);
      session.onMoveInitiated();
      session.addPoints(200);
      const finalState = session.onTurnCompleted();
      expect(finalState).toBe(GameState.GameOver);
      expect(session.getGameOverReason()).toBe(GameOverReason.OutOfMoves);
    });
  });

  describe('SpecialRegistry (OCP Strategy Pattern)', () => {
    it('finds appropriate combo handler by strategy inspection', () => {
      const registry = new SpecialRegistry();

      const bomb1: TileData = { id: 1, row: 0, col: 0, color: TileColor.Red, special: SpecialType.ColorBomb };
      const bomb2: TileData = { id: 2, row: 0, col: 1, color: TileColor.Blue, special: SpecialType.ColorBomb };
      const striped: TileData = { id: 3, row: 0, col: 1, color: TileColor.Yellow, special: SpecialType.StripedHorizontal };

      const doubleBombHandler = registry.findComboHandler(bomb1, bomb2);
      expect(doubleBombHandler).toBeInstanceOf(DoubleColorBombComboHandler);

      const bombStripedHandler = registry.findComboHandler(bomb1, striped);
      expect(bombStripedHandler).toBeInstanceOf(ColorBombStripedComboHandler);
    });

    it('matches GiantCross combo symmetrically in both swap directions', () => {
      const registry = new SpecialRegistry();
      const striped: TileData = { id: 10, row: 2, col: 2, color: TileColor.Red, special: SpecialType.StripedHorizontal };
      const wrapped: TileData = { id: 11, row: 2, col: 3, color: TileColor.Blue, special: SpecialType.Wrapped };

      const handlerA = registry.findComboHandler(striped, wrapped);
      const handlerB = registry.findComboHandler(wrapped, striped);

      expect(handlerA).toBeDefined();
      expect(handlerB).toBeDefined();
      expect(handlerA?.name).toBe('GiantCross');
      expect(handlerB?.name).toBe('GiantCross');
    });

    it('allows registering new custom special handlers dynamically without modifying registry core (OCP)', () => {
      const registry = new SpecialRegistry();

      class MockCustomHandler implements ISpecialEffectHandler {
        public readonly supportedType = SpecialType.Wrapped;
        public execute(): SpecialTriggerEffect {
          return {
            sourceTile: { id: 99, row: 0, col: 0, color: TileColor.Red, special: SpecialType.Wrapped },
            affectedTileIds: [99],
            effectType: SpecialType.Wrapped,
          };
        }
      }

      registry.registerEffectHandler(new MockCustomHandler());
      const handler = registry.getEffectHandler(SpecialType.Wrapped);
      expect(handler).toBeInstanceOf(MockCustomHandler);
    });
  });
});
