import { LevelDifficulty, type LevelConfig } from '../core/LevelProgression.ts';
import { PUZZLE_IDS, puzzleFeatures, type PuzzleId } from '../core/AuthoredLevels.ts';
import { GAME_RULES_VERSION } from '../persistence/SaveCodec.ts';
import { LESSON_IDS, type LessonId } from './Laboratory.ts';

export type PlayMode = { kind: 'campaign' } | { kind: 'daily'; day: string; seed: number }
  | { kind: 'lab'; lesson: LessonId; seed: number } | { kind: 'puzzle'; puzzle: PuzzleId; seed: number };

export function dailySeed(day: string): number {
  let hash = 2166136261;
  for (const char of `deliciousmove:${GAME_RULES_VERSION}:${day}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function utcDay(now = new Date()): string { return now.toISOString().slice(0, 10); }

export function parseMode(params: URLSearchParams): PlayMode | 'versionMismatch' {
  if (params.get('mode') === 'daily') {
    if (params.has('rules') && params.get('rules') !== String(GAME_RULES_VERSION)) return 'versionMismatch';
    const candidate = params.get('day') ?? utcDay();
    const parsed = new Date(`${candidate}T00:00:00Z`);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(candidate) && Number.isFinite(parsed.getTime()) && utcDay(parsed) === candidate ? candidate : utcDay();
    return { kind: 'daily', day, seed: dailySeed(day) };
  }
  if (params.get('mode') === 'lab') {
    const candidate = params.get('lesson');
    return { kind: 'lab', lesson: LESSON_IDS.find(id => id === candidate) ?? 'four', seed: 731 };
  }
  if (params.get('mode') === 'puzzle') return { kind: 'puzzle', puzzle: PUZZLE_IDS.find(id => id === params.get('puzzle')) ?? 'conveyor', seed: 883 };
  return { kind: 'campaign' };
}

export function modeConfig(mode: Exclude<PlayMode, { kind: 'campaign' }>): LevelConfig {
  if (mode.kind === 'lab') return { level: 1, difficulty: LevelDifficulty.Easy, moves: 99, shuffles: 99, targetScore: 1_000_000,
    ...(mode.lesson === 'ice' ? { features: { shape: 'rectangle' as const, jelly: [], blockers: [], ingredients: [], ice: [{ row: 3, col: 3, layers: 1 }] } } : {}) };
  const id = mode.kind === 'puzzle' ? mode.puzzle : PUZZLE_IDS[mode.seed % PUZZLE_IDS.length];
  const puzzle = puzzleFeatures(id);
  const targetScore = mode.kind === 'daily' ? 5000 : 2500;
  return { level: 1, difficulty: LevelDifficulty.Hard, moves: id === 'fountain' ? 28 : 22, shuffles: 2, targetScore,
    ...puzzle, challenge: id, objectives: [{ kind: 'score', target: targetScore }, ...puzzle.objectives] };
}

