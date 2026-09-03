import { CascadeStep, Position } from '../core/TileTypes.ts';
import { TileSprite } from './TileSprite.ts';

/**
 * Playback contract the turn coordinator depends on, so orchestration never binds to a
 * concrete GSAP implementation (DIP).
 */
export interface IAnimationSequencer {
  animateSwap(
    spriteA: TileSprite,
    spriteB: TileSprite,
    posA: Position,
    posB: Position
  ): Promise<void>;
  playCascadeSteps(steps: CascadeStep[], onScoreGained: (score: number) => void): Promise<void>;
  animateShuffle(tileMappings: Map<number, Position>): Promise<void>;
  animateHint?(sprites: TileSprite[]): void;
  animateForbiddenMove?(sprite: TileSprite): Promise<void>;
}
