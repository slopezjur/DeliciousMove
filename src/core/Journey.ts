import type { LevelConfig } from './LevelProgression.ts';
import type { Board } from './Board.ts';

export const PERK_IDS = ['airdrop', 'crosswind', 'thaw'] as const;
export type PerkId = typeof PERK_IDS[number];
export type RouteId = 'safe' | 'challenge';
export interface ActivePerk { id: PerkId; levelsLeft: number }
export interface JourneyState { route: RouteId; perks: ActivePerk[] }
export interface JourneyChoice { route: RouteId; perk: PerkId }

export function isJourney(value: unknown): value is JourneyState {
  if (!value || typeof value !== 'object') return false;
  const state = value as JourneyState;
  return (state.route === 'safe' || state.route === 'challenge') && Array.isArray(state.perks)
    && state.perks.length <= PERK_IDS.length && new Set(state.perks.map(p => p?.id)).size === state.perks.length
    && state.perks.every(p => p && PERK_IDS.includes(p.id) && Number.isInteger(p.levelsLeft) && p.levelsLeft >= 1 && p.levelsLeft <= 4);
}

/** Choices advance only between victories; retrying never renews a perk. */
export function nextJourney(current: JourneyState | undefined, choice?: JourneyChoice): JourneyState | undefined {
  if (!current && !choice) return undefined;
  const perks = (current?.perks ?? []).filter(p => p.levelsLeft > 1)
    .map(p => ({ ...p, levelsLeft: p.levelsLeft - 1 })).filter(p => p.id !== choice?.perk);
  if (choice) perks.push({ id: choice.perk, levelsLeft: current?.route === 'challenge' ? 4 : 3 });
  return { route: choice?.route ?? 'safe', perks };
}

export function applyRoute(config: LevelConfig, journey?: JourneyState): LevelConfig {
  if (journey?.route !== 'challenge') return structuredClone(config);
  const targetScore = Math.round(config.targetScore * 1.15 / 50) * 50;
  return { ...structuredClone(config), moves: Math.max(6, config.moves - 2), targetScore,
    objectives: config.objectives?.map(o => o.kind === 'score' ? { ...o, target: targetScore } : { ...o }) };
}

/** Selection is separate from board-owned charges so turn snapshots retain spent effects. */
export interface IStripePerk {
  consumeStripe(board: Board): boolean;
}

export class PerkEffects implements IStripePerk {
  private perks = new Set<PerkId>();

  reset(journey?: JourneyState): void {
    this.perks = new Set(journey?.perks.map(p => p.id));
  }

  has(id: PerkId): boolean { return this.perks.has(id); }
  consumeStripe(board: Board): boolean {
    if (!this.has('crosswind') || board.mechanics?.stripeUsed) return false;
    board.mechanics ??= { turns: 0 };
    board.mechanics.stripeUsed = true;
    return true;
  }
}
