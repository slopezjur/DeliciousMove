import { describe, it, expect, vi } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { TileColor, SpecialType, Position, MatchGroup } from '../src/core/TileTypes.ts';
import { MatchDetector, RawRun } from '../src/core/MatchDetector.ts';
import {
  MatchRuleRegistry,
  ColorBombRule,
  IntersectionWrappedRule,
  StripedRule,
  NormalMatchRule,
} from '../src/core/matching/MatchRuleRegistry.ts';
import { IMatchRule } from '../src/core/matching/IMatchRule.ts';
import { HUDView } from '../src/ui/HUDView.ts';
import { ISoundService } from '../src/audio/ISoundService.ts';
import { IGameModalView } from '../src/ui/IGameModalView.ts';
import { GameOverReason } from '../src/core/GameSession.ts';

describe('Second Pass SOLID Refactoring Unit Tests', () => {
  describe('MatchRuleRegistry & Strategy Rules (OCP)', () => {
    it('executes default rules in priority order', () => {
      const registry = new MatchRuleRegistry();
      const rules = registry.getRules();
      expect(rules.length).toBe(4);
      expect(rules[0]).toBeInstanceOf(ColorBombRule);
      expect(rules[1]).toBeInstanceOf(IntersectionWrappedRule);
      expect(rules[2]).toBeInstanceOf(StripedRule);
      expect(rules[3]).toBeInstanceOf(NormalMatchRule);
    });

    it('allows dynamically inserting custom match pattern rules (OCP)', () => {
      const registry = new MatchRuleRegistry();

      class SquareMatchRule implements IMatchRule {
        public readonly priority = 50; // runs before ColorBomb
        public evaluate(
          _hRuns: RawRun[],
          _vRuns: RawRun[],
          consumedH: Set<RawRun>,
          _consumedV: Set<RawRun>,
          _interactionPositions: Position[]
        ): MatchGroup[] {
          if (_hRuns.length > 0) consumedH.add(_hRuns[0]);
          return [
            {
              tiles: [],
              color: TileColor.Blue,
              spawnSpecial: {
                type: SpecialType.Wrapped,
                position: { row: 1, col: 1 },
                color: TileColor.Blue,
              },
            },
          ];
        }
      }

      registry.registerRule(new SquareMatchRule());
      const rules = registry.getRules();
      expect(rules[0]).toBeInstanceOf(SquareMatchRule);

      const board = new Board(4, 4);
      board.createTile(0, 0, TileColor.Blue);
      board.createTile(0, 1, TileColor.Blue);
      board.createTile(0, 2, TileColor.Blue);
      const matches = new MatchDetector(registry).detectMatches(board);
      expect(matches.length).toBe(1);
      expect(matches[0].spawnSpecial?.position).toEqual({ row: 1, col: 1 });
    });
  });

  describe('HUDView & GameModal Separation (SRP & DIP)', () => {
    it('delegates victory and game over to injected modal and plays sound via ISoundService', () => {
      const mockSound: ISoundService = {
        playSwap: vi.fn(),
        playMatch: vi.fn(),
        playSpecialLaser: vi.fn(),
        playBombExplosion: vi.fn(),
        playVictory: vi.fn(),
        playShuffle: vi.fn(),
        toggleMute: vi.fn().mockReturnValue(true),
        isMuted: vi.fn().mockReturnValue(false),
      };

      const mockModal: IGameModalView = {
        showVictory: vi.fn(),
        showGameOver: vi.fn(),
        hide: vi.fn(),
      };

      const onRestart = vi.fn();
      const hud = new HUDView(onRestart, mockSound, mockModal);

      hud.showVictory(4500, 3);
      expect(mockModal.showVictory).toHaveBeenCalledWith(4500, 3);

      hud.showGameOver(1200, 3, GameOverReason.Deadlock);
      expect(mockModal.showGameOver).toHaveBeenCalledWith(1200, 3, GameOverReason.Deadlock);

      hud.initLevel({ level: 3, moves: 20, targetScore: 5000, shuffles: 3 });
      expect(mockModal.hide).toHaveBeenCalled();
    });
  });
});
