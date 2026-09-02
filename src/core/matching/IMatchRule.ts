import { RawRun } from '../MatchDetector.ts';
import { MatchGroup, Position } from '../TileTypes.ts';

export interface IMatchRule {
  readonly priority: number;
  evaluate(
    hRuns: RawRun[],
    vRuns: RawRun[],
    consumedH: Set<RawRun>,
    consumedV: Set<RawRun>,
    interactionPositions: Position[]
  ): MatchGroup[];
}
