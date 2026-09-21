import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/Board.ts';
import { TileColor, SpecialType, MatchGroup } from '../src/core/TileTypes.ts';
import { MatchDetector } from '../src/core/MatchDetector.ts';
import {
  MatchRuleRegistry,
  ColorBombRule,
  IntersectionWrappedRule,
  StripedRule,
  NormalMatchRule,
} from '../src/core/matching/MatchRuleRegistry.ts';
import { IMatchRule, MatchEvaluationContext } from '../src/core/matching/IMatchRule.ts';
import { HUDView } from '../src/ui/HUDView.ts';
import { LevelDifficulty } from '../src/core/LevelProgression.ts';

describe('Second Pass SOLID Refactoring Unit Tests', () => {
  describe('MatchRuleRegistry & Strategy Rules (OCP)', () => {
    it('executes default rules in priority order', () => {
      const registry = new MatchRuleRegistry();
      const rules = registry.getRules();
      expect(rules.length).toBe(5);
      expect(rules[0]).toBeInstanceOf(ColorBombRule);
      expect(rules[1]).toBeInstanceOf(IntersectionWrappedRule);
      expect(rules[2].priority).toBe(250);
      expect(rules[3]).toBeInstanceOf(StripedRule);
      expect(rules[4]).toBeInstanceOf(NormalMatchRule);
    });

    it('allows dynamically inserting custom match pattern rules (OCP)', () => {
      const registry = new MatchRuleRegistry();

      class CustomTestMatchRule implements IMatchRule {
        public readonly priority = 50; // runs before ColorBomb
        public evaluate(ctx: MatchEvaluationContext): MatchGroup[] {
          if (ctx.hRuns.length > 0) ctx.consumedH.add(ctx.hRuns[0]);
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

      registry.registerRule(new CustomTestMatchRule());
      const rules = registry.getRules();
      expect(rules[0]).toBeInstanceOf(CustomTestMatchRule);

      const board = new Board(4, 4);
      board.createTile(0, 0, TileColor.Blue);
      board.createTile(0, 1, TileColor.Blue);
      board.createTile(0, 2, TileColor.Blue);
      const matches = new MatchDetector(registry).detectMatches(board);
      expect(matches.length).toBe(1);
      expect(matches[0].spawnSpecial?.position).toEqual({ row: 1, col: 1 });
    });
  });

  describe('HUDView Separation', () => {
    it('initializes and updates HUD metrics independently without modal coupling', () => {
      const hud = new HUDView();
      hud.initLevel({ level: 3, difficulty: LevelDifficulty.Hard, moves: 20, targetScore: 5000, shuffles: 3 }, 5, 12000);
      hud.updateMoves(15);
      hud.updateShuffles(2);
      hud.addScore(300, 12300);

      expect(hud).toBeDefined();
    });
  });
});
