import { LevelFeatures, Objective } from './BoardFeatures.ts';
import { getLevelFeatures } from './LevelFeatures.ts';

export enum LevelDifficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
  VeryHard = 'very_hard',
}

export interface LevelConfig {
  objectives?: Objective[];
  features?: LevelFeatures;
  level: number;
  difficulty: LevelDifficulty;
  moves: number;
  targetScore: number;
  /** Rescue shuffles granted for this level. Never zero: the player always gets one out. */
  shuffles: number;
}

export interface ILevelProgression {
  getConfig(level: number): LevelConfig;
}

export interface DifficultyPreset {
  baseMoves: number;
  targetMultiplier: number;
  shuffles: number;
}

export interface AlternatingProgressionTuning {
  baseTargetScore: number;
  /** Score scales across 4-level cycles (epochs). */
  cycleGrowthRate: number;
  targetRounding: number;
  presets: Record<LevelDifficulty, DifficultyPreset>;
}

export const DIFFICULTY_CYCLE: readonly LevelDifficulty[] = [
  LevelDifficulty.Easy,
  LevelDifficulty.Medium,
  LevelDifficulty.Hard,
  LevelDifficulty.VeryHard,
];

export const DEFAULT_DIFFICULTY_PRESETS: Record<LevelDifficulty, DifficultyPreset> = {
  [LevelDifficulty.Easy]: {
    baseMoves: 26,
    targetMultiplier: 1.0,
    shuffles: 4,
  },
  [LevelDifficulty.Medium]: {
    baseMoves: 22,
    targetMultiplier: 1.6,
    shuffles: 3,
  },
  [LevelDifficulty.Hard]: {
    baseMoves: 18,
    targetMultiplier: 2.3,
    shuffles: 2,
  },
  [LevelDifficulty.VeryHard]: {
    baseMoves: 15,
    targetMultiplier: 3.2,
    shuffles: 1,
  },
};

export const DEFAULT_ALTERNATING_TUNING: AlternatingProgressionTuning = {
  baseTargetScore: 3500,
  cycleGrowthRate: 1.25,
  targetRounding: 50,
  presets: DEFAULT_DIFFICULTY_PRESETS,
};

/**
 * Alternating endless progression: levels rotate through 4 distinct difficulty tiers
 * (Easy -> Medium -> Hard -> Very Hard -> Easy...). Each epoch/cycle moderately scales
 * base target scores while always providing generous breather/banking opportunities on Easy levels.
 */
export class InfiniteLevelProgression implements ILevelProgression {
  private readonly tuning: AlternatingProgressionTuning;

  constructor(tuning: AlternatingProgressionTuning = DEFAULT_ALTERNATING_TUNING) {
    this.tuning = tuning;
  }

  public getConfig(level: number): LevelConfig {
    const clampedLevel = Math.max(1, level);
    const index = clampedLevel - 1;
    const cycle = Math.floor(index / DIFFICULTY_CYCLE.length);
    const difficulty = DIFFICULTY_CYCLE[index % DIFFICULTY_CYCLE.length];

    const preset = this.tuning.presets[difficulty] ?? DEFAULT_DIFFICULTY_PRESETS[difficulty];
    const cycleGrowth = Math.pow(this.tuning.cycleGrowthRate, cycle);
    const rawTarget = this.tuning.baseTargetScore * preset.targetMultiplier * cycleGrowth;
    const targetScore = Math.round(rawTarget / this.tuning.targetRounding) * this.tuning.targetRounding;
    const family = getLevelFeatures(clampedLevel);

    return {
      ...family,
      objectives: [{ kind: 'score', target: targetScore }, ...(family.objectives ?? [])],
      level: clampedLevel,
      difficulty,
      moves: preset.baseMoves,
      targetScore,
      shuffles: preset.shuffles,
    };
  }
}
