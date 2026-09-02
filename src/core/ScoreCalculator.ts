export interface IScoreCalculator {
  calculateStepScore(destroyedTileCount: number, comboMultiplier: number): number;
}

export class ScoreCalculator implements IScoreCalculator {
  private readonly baseTileScore: number;

  constructor(baseTileScore: number = 60) {
    this.baseTileScore = baseTileScore;
  }

  public calculateStepScore(destroyedTileCount: number, comboMultiplier: number): number {
    return destroyedTileCount * this.baseTileScore * Math.max(1, comboMultiplier);
  }
}
