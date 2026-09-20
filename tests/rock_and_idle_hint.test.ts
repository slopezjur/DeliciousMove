import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import { TileSpawner } from '../src/core/TileSpawner.ts';
import { ShuffleEngine } from '../src/core/ShuffleEngine.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { TileColor, SpecialType } from '../src/core/TileTypes.ts';
import { IdleHintController, IDLE_HINT_DELAY_MS } from '../src/input/IdleHintController.ts';
import { GameSession } from '../src/core/GameSession.ts';
import { ILevelProgression, LevelDifficulty, LevelConfig } from '../src/core/LevelProgression.ts';
import { AirplaneHandler } from '../src/core/specials/SpecialRegistry.ts';
import { GameModalView } from '../src/ui/GameModalView.ts';

class StubProgression implements ILevelProgression {
  getConfig(level: number): LevelConfig {
    return { level, difficulty: LevelDifficulty.Easy, moves: 10, targetScore: 1000, shuffles: 1 };
  }
}

describe('Rock Obstacles & Idle Hint System', () => {
  describe('Rock Obstacles (SpecialType.Rock)', () => {
    it('does not form color matches and breaks match runs', () => {
      const board = new Board(8, 8);
      const detector = new MatchDetector();

      // Fill board with unique dummy pattern
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.createTile(r, c, ((r * 2 + c) % 6) as TileColor);
        }
      }

      // Explicitly set row 2: Red, Rock (Red color), Red, Blue, Blue, Blue (no 3s)
      for (let c = 0; c < 8; c++) {
        board.get(2, c)!.color = TileColor.Blue;
        board.get(2, c)!.special = SpecialType.None;
      }
      board.get(2, 0)!.color = TileColor.Red;
      board.get(2, 1)!.color = TileColor.Red;
      board.get(2, 1)!.special = SpecialType.Rock; // Rock in the middle of Red tiles
      board.get(2, 2)!.color = TileColor.Red;
      board.get(2, 3)!.color = TileColor.Green;
      board.get(2, 4)!.color = TileColor.Purple;

      const matches = detector.detectMatches(board);
      const redMatches = matches.filter((m) => m.color === TileColor.Red);
      expect(redMatches.length).toBe(0); // Rock interrupts, so no Red 3-in-a-row forms
    });

    it('smoothly spawns at most 2 Rock obstacles during bonus overtime refills', () => {
      const board = new Board(8, 8);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.createTile(r, c, TileColor.Blue);
        }
      }

      // Empty top 4 rows (32 slots)
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 8; c++) {
          board.set(r, c, null);
        }
      }

      // Use deterministic seeded random source
      const spawner = new TileSpawner(undefined, new SeededRandomSource(42));
      const spawns = spawner.refillEmptySlots(board, true); // avoidMatches = true

      expect(spawns.length).toBe(32);
      const rockCount = spawns.filter((s) => s.tile.special === SpecialType.Rock).length;
      // Throttled to at most 2 rocks per wave to keep the transition smooth
      expect(rockCount).toBeGreaterThan(0);
      expect(rockCount).toBeLessThanOrEqual(2);
    });

    it('does not count rocks as standalone activatable specials in ShuffleEngine', () => {
      const board = new Board(8, 8);
      const detector = new MatchDetector();
      const shuffle = new ShuffleEngine(detector, new SeededRandomSource(1));

      // Fill board with rocks
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.createTile(r, c, TileColor.Blue, SpecialType.Rock);
        }
      }

      // Board full of rocks has 0 possible moves
      expect(shuffle.hasPossibleMoves(board)).toBe(false);

      // But adding an activatable special candy immediately opens a valid move
      board.get(0, 0)!.special = SpecialType.StripedHorizontal;
      expect(shuffle.hasPossibleMoves(board)).toBe(true);
    });

    it('ensures Airplanes never target unbreakable Rocks', () => {
      const handler = new AirplaneHandler(new SeededRandomSource(5));
      const board = new Board(8, 8);

      // Fill board with rocks, except for takeoff airplane and one normal candy
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.createTile(r, c, TileColor.Blue, SpecialType.Rock);
        }
      }

      const plane = board.createTile(0, 0, TileColor.Yellow, SpecialType.Airplane);
      const normalTarget = board.createTile(7, 7, TileColor.Green, SpecialType.None);

      const destroyedTileIds = new Set<number>();
      const effect = handler.execute({
        board,
        sourceTile: plane,
        destroyedTileIds,
        triggerQueue: [],
      });

      // Target must be the breakable normal candy, NEVER any of the rocks
      expect(effect.targetTile?.id).toBe(normalTarget.id);
      expect(destroyedTileIds.has(normalTarget.id)).toBe(true);
      // None of the rocks should be marked as destroyed
      board.forEachTile((t) => {
        if (t.special === SpecialType.Rock) {
          expect(destroyedTileIds.has(t.id)).toBe(false);
        }
      });
    });

    it('strictly forbids swapping a candy with a rock and plays forbidden rejection animation', async () => {
      const board = new Board(8, 8);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.createTile(r, c, TileColor.Blue);
        }
      }

      // (0, 0) is a Candy, (0, 1) is a Rock
      const candy = board.createTile(0, 0, TileColor.Red, SpecialType.None);
      const rock = board.createTile(0, 1, TileColor.Blue, SpecialType.Rock);

      const animations = {
        animateSwap: vi.fn(),
        animateForbiddenMove: vi.fn().mockResolvedValue(undefined),
      } as any;

      const session = new GameSession(new StubProgression());
      session.startLevel(1);

      const { TurnCoordinator } = await import('../src/TurnCoordinator.ts');
      const coordinator = new TurnCoordinator({
        board,
        animations,
        cascadeResolver: {} as any,
        deadlockResolver: {} as any,
        session,
      });

      const result = await coordinator.playMove({ row: 0, col: 0 }, { row: 0, col: 1 });

      expect(result).toBe(false);
      // animateSwap should NEVER be called; rock stays 100% static
      expect(animations.animateSwap).not.toHaveBeenCalled();
      // animateForbiddenMove MUST be called on the candy sprite attempting the move
      expect(animations.animateForbiddenMove).toHaveBeenCalledWith(candy.id);
      // Move was NOT consumed
      expect(session.getMovesLeft()).toBe(10);
      // Positions remain unchanged
      expect(board.get(0, 0)?.id).toBe(candy.id);
      expect(board.get(0, 1)?.id).toBe(rock.id);
    });
  });

  describe('IdleHintController', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('triggers hint animation on combineable sprites after 10s inactivity', () => {
      const board = new Board(8, 8);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.createTile(r, c, (r + c) % 2 === 0 ? TileColor.Red : TileColor.Blue);
        }
      }

      const deadlockResolver = {
        findPossibleMoves: vi.fn(() => [
          { from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        ]),
      } as any;

      const session = new GameSession(new StubProgression());
      session.startLevel(1);

      const animations = {
        animateHint: vi.fn(),
      } as any;

      const hintController = new IdleHintController(
        board,
        deadlockResolver,
        session,
        animations,
        IDLE_HINT_DELAY_MS
      );

      hintController.start();

      // Before 10s: no hint triggered
      vi.advanceTimersByTime(9_000);
      expect(animations.animateHint).not.toHaveBeenCalled();

      // At 10s: hint triggered on the combineable sprites!
      vi.advanceTimersByTime(1_000);
      expect(animations.animateHint).toHaveBeenCalledTimes(1);
      expect(animations.animateHint).toHaveBeenCalledWith([board.get(0, 0)!.id, board.get(0, 1)!.id]);

      hintController.stop();
    });

    it('resets the 10s countdown when user activity occurs', () => {
      const board = new Board(8, 8);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          board.createTile(r, c, (r + c) % 2 === 0 ? TileColor.Red : TileColor.Blue);
        }
      }

      const deadlockResolver = {
        findPossibleMoves: vi.fn(() => [
          { from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
        ]),
      } as any;

      const session = new GameSession(new StubProgression());
      session.startLevel(1);

      const animations = {
        animateHint: vi.fn(),
      } as any;

      const hintController = new IdleHintController(
        board,
        deadlockResolver,
        session,
        animations,
        IDLE_HINT_DELAY_MS
      );

      hintController.start();

      // User interacts after 7 seconds
      vi.advanceTimersByTime(7_000);
      hintController.resetTimer();

      // Advance another 7 seconds (total 14s elapsed, but only 7s since reset)
      vi.advanceTimersByTime(7_000);
      expect(animations.animateHint).not.toHaveBeenCalled();

      // Reach 10s since reset
      vi.advanceTimersByTime(3_000);
      expect(animations.animateHint).toHaveBeenCalledTimes(1);

      hintController.stop();
    });
  });

  describe('GameModalView UI Presentation', () => {
    it('renders victory details as clean plain text without leaking raw HTML tags', () => {
      const elements: Record<string, any> = {
        'game-modal': { classList: { add: vi.fn(), remove: vi.fn() } },
        'modal-title': { textContent: '' },
        'modal-detail': { textContent: '' },
        'modal-final-score': { textContent: '' },
        'modal-global-container': { classList: { add: vi.fn(), remove: vi.fn() } },
        'modal-global-score': { textContent: '' },
        'modal-action-btn': { addEventListener: vi.fn(), textContent: '' },
      };

      (globalThis as any).document = {
        getElementById: vi.fn((id: string) => elements[id] ?? null),
      };

      const modal = new GameModalView(() => {});
      modal.showVictory(3450, 1, 4, 12890);

      // Verify detail text does not contain HTML tags
      expect(elements['modal-detail'].textContent).toContain('Level 1 cleared. 🎉 4 unused moves banked for Level 2!');
      expect(elements['modal-detail'].textContent).not.toContain('<br>');
      expect(elements['modal-detail'].textContent).not.toContain('<span>');
      expect(elements['modal-detail'].textContent).not.toContain('Global Score:');

      // Verify global score rendered in its dedicated container
      expect(elements['modal-global-container'].classList.remove).toHaveBeenCalledWith('hidden');
      expect(elements['modal-global-score'].textContent).toBe((12890).toLocaleString('en'));
      expect(elements['modal-final-score'].textContent).toBe((3450).toLocaleString('en'));

      delete (globalThis as any).document;
    });
  });
});
