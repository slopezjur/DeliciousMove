import type { LevelConfig } from './LevelProgression.ts';
import type { LevelFeatures, Objective } from './BoardFeatures.ts';

export const PUZZLE_IDS = ['conveyor', 'portals', 'delivery', 'fountain'] as const;
export type PuzzleId = typeof PUZZLE_IDS[number];

export function puzzleFeatures(id: PuzzleId): { features: LevelFeatures; objectives: Objective[] } {
  const features: LevelFeatures = { shape: 'rectangle', jelly: [], ice: [], blockers: [], ingredients: [] };
  switch (id) {
    case 'conveyor': {
      const belt = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 2, col: 5 },
        { row: 3, col: 5 }, { row: 3, col: 4 }, { row: 3, col: 3 }, { row: 3, col: 2 }];
      features.conveyors = [belt]; features.jelly = belt.map(p => ({ ...p }));
      return { features, objectives: [{ kind: 'jelly', target: belt.length }] };
    }
    case 'portals':
      features.shape = 'islands';
      features.portals = [{ entrance: { row: 7, col: 1 }, exit: { row: 0, col: 6 } }];
      features.ingredients = [{ row: 0, col: 1 }, { row: 2, col: 1 }];
      return { features, objectives: [{ kind: 'ingredient', target: 2 }] };
    case 'delivery':
      features.ingredients = [1, 3, 5].map(col => ({ row: 3, col }));
      features.blockers = [1, 3, 5].map(col => ({ row: 5, col, kind: 'crate', layers: 2 }));
      return { features, objectives: [{ kind: 'ingredient', target: 3 }, { kind: 'blocker', blocker: 'crate', target: 3 }] };
    case 'fountain': {
      const weakSpots = [1, 3, 6].map(col => ({ row: 4, col }));
      features.blockers = weakSpots.map(p => ({ ...p, kind: 'frosting', layers: 3 }));
      features.blockers.push({ row: 6, col: 3, kind: 'chocolate', layers: 1 });
      features.boss = { weakSpots, period: 3 };
      return { features, objectives: [{ kind: 'blocker', blocker: 'frosting', target: 3 }] };
    }
  }
}

/** Milestones begin after every ordinary mechanic has been introduced. */
export function authoredMilestone(config: LevelConfig): LevelConfig {
  if (config.level < 15 || config.level % 5 !== 0) return config;
  const id: PuzzleId = config.level % 10 === 0 ? 'fountain'
    : (['conveyor', 'portals', 'delivery'] as const)[Math.floor((config.level - 15) / 10) % 3];
  const puzzle = puzzleFeatures(id);
  return { ...config, ...puzzle, challenge: id,
    objectives: [{ kind: 'score', target: config.targetScore }, ...puzzle.objectives] };
}
