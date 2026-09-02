export interface LevelConfig {
  level: number;
  moves: number;
  targetScore: number;
  /** Rescue shuffles granted for this level. Never zero: the player always gets one out. */
  shuffles: number;
}

export interface ILevelProgression {
  getConfig(level: number): LevelConfig;
}

export interface InfiniteProgressionTuning {
  baseMoves: number;
  minMoves: number;
  /** Moves are reduced by 1 every N levels. */
  movesDecayEveryLevels: number;
  baseTargetScore: number;
  /** Multiplicative target growth per level. */
  targetGrowthRate: number;
  targetRounding: number;
  baseShuffles: number;
  minShuffles: number;
  /** Rescue shuffles are reduced by 1 every N levels. */
  shuffleDecayEveryLevels: number;
}

export const DEFAULT_INFINITE_TUNING: InfiniteProgressionTuning = {
  baseMoves: 25,
  minMoves: 16,
  movesDecayEveryLevels: 2,
  baseTargetScore: 4000,
  targetGrowthRate: 1.28,
  targetRounding: 50,
  baseShuffles: 4,
  minShuffles: 1,
  shuffleDecayEveryLevels: 3,
};

/**
 * Endless progression: every cleared level raises the target score and tightens the
 * move and rescue-shuffle budgets, converging on a floor rather than becoming impossible.
 */
export class InfiniteLevelProgression implements ILevelProgression {
  private readonly tuning: InfiniteProgressionTuning;

  constructor(tuning: InfiniteProgressionTuning = DEFAULT_INFINITE_TUNING) {
    this.tuning = tuning;
  }

  public getConfig(level: number): LevelConfig {
    const t = this.tuning;
    const index = Math.max(0, level - 1);

    const moves = Math.max(t.minMoves, t.baseMoves - Math.floor(index / t.movesDecayEveryLevels));
    const rawTarget = t.baseTargetScore * Math.pow(t.targetGrowthRate, index);
    const targetScore = Math.round(rawTarget / t.targetRounding) * t.targetRounding;
    const shuffles = Math.max(
      t.minShuffles,
      t.baseShuffles - Math.floor(index / t.shuffleDecayEveryLevels)
    );

    return { level: Math.max(1, level), moves, targetScore, shuffles };
  }
}
