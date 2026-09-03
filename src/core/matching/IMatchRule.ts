import { Board } from '../Board.ts';
import { RawRun } from '../MatchDetector.ts';
import { MatchGroup, Position } from '../TileTypes.ts';

/**
 * Parameter object encapsulating matching context (OCP & Clean Code).
 * Adding future match context avoids changing the IMatchRule evaluate signature.
 */
export interface MatchEvaluationContext {
  hRuns: RawRun[];
  vRuns: RawRun[];
  consumedH: Set<RawRun>;
  consumedV: Set<RawRun>;
  interactionPositions: Position[];
  board?: Board;
  consumedTileIds: Set<number>;
}

export interface IMatchRule {
  readonly priority: number;
  evaluate(context: MatchEvaluationContext): MatchGroup[];
}

export interface IMatchRuleRegistry {
  registerRule(rule: IMatchRule): void;
  getRules(): readonly IMatchRule[];
}
