import { CascadeStep, Position } from '../core/TileTypes.ts';

/**
 * Playback contract the turn coordinator depends on, so orchestration never binds to a
 * concrete GSAP implementation (DIP).
 */
export interface IAnimationSequencer {
  animateSwap(
    tileAId: number,
    tileBId: number,
    posA: Position,
    posB: Position
  ): Promise<void>;
  playCascadeSteps(steps: CascadeStep[], onScoreGained: (score: number, events?: import('../core/BoardFeatures.ts').ObjectiveEvent[]) => void): Promise<void>;
  animateShuffle(tileMappings: Map<number, Position>): Promise<void>;
  animateForbiddenMove?(tileId: number): Promise<void>;
}

/** Hints require tile IDs only, with no access to turn playback or renderer objects. */
export interface IHintAnimator {
  animateHint(tileIds: readonly number[]): void;
}
