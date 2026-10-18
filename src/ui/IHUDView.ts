import { LevelConfig } from '../core/LevelProgression.ts';

export interface IHUDView {
  setBonusPhase(active: boolean): void;
  setLastChance(active: boolean): void;
  updateObjectives(progress: import('../core/BoardFeatures.ts').ObjectiveProgress[]): void;
  initLevel(config: LevelConfig, bonusMoves?: number, globalScore?: number): void;
  updateMoves(moves: number, isFrozen?: boolean, levelMoves?: number, bankMoves?: number, unlimited?: boolean): void;
  updateShuffles(shuffles: number): void;
  addScore(amount: number, globalScore?: number, isBonusPhase?: boolean): void;
}
