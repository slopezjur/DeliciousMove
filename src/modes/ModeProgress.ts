import type { ICollectionRecorder } from '../core/Collection.ts';
import { comboId } from '../core/SpecialCombinations.ts';
import type { SpecialType, SwapResult } from '../core/TileTypes.ts';
import { GAME_RULES_VERSION } from '../persistence/SaveCodec.ts';
import { lessonCompleted } from './Laboratory.ts';
import type { PlayMode } from './PlayMode.ts';

type SpecialPair = readonly [SpecialType, SpecialType];
interface Observation { result: SwapResult; pair?: SpecialPair; automatic: boolean; deliveries: number }
interface Completion { score: number; turns: number; bank: number; startingBank: number }

/** A mode implements only the progress hooks that apply to its rules. */
export interface ModeProgressPolicy {
  observe?(observation: Observation): boolean;
  complete?(completion: Completion): void;
}

export interface IModeProgress {
  readonly lessonDone: boolean;
  startLevel(bank: number): void;
  beginTurn(): void;
  endTurn(played: boolean): void;
  observe(result: SwapResult, pair?: SpecialPair, automatic?: boolean): void;
  complete(score: number, bank: number): void;
}

/** Tracks a player turn including its automatic finale; rejected turns earn no progress. */
export class ModeProgress implements IModeProgress {
  private turns = 0;
  private deliveries = 0;
  private startingBank = 0;
  private completedLesson = false;

  constructor(private readonly policy: ModeProgressPolicy) {}

  get lessonDone(): boolean { return this.completedLesson; }

  startLevel(bank: number): void {
    this.turns = 0; this.deliveries = 0; this.startingBank = bank; this.completedLesson = false;
  }

  beginTurn(): void { this.deliveries = 0; this.turns++; }
  endTurn(played: boolean): void { if (!played) this.turns--; }

  observe(result: SwapResult, pair?: SpecialPair, automatic = false): void {
    if (!result.valid) return;
    for (const step of result.steps) for (const event of step.objectiveEvents ?? []) {
      if (event.kind === 'ingredient') this.deliveries += event.amount;
    }
    const done = this.policy.observe?.({ result, pair, automatic, deliveries: this.deliveries });
    this.completedLesson ||= done === true;
  }

  complete(score: number, bank: number): void {
    this.policy.complete?.({ score, bank, turns: this.turns, startingBank: this.startingBank });
  }
}

/** Mode-specific policies are selected here, outside gameplay and presentation classes. */
export function modeProgress(mode: PlayMode, collection: ICollectionRecorder): IModeProgress {
  switch (mode.kind) {
    case 'campaign': return new ModeProgress({
      observe: ({ pair, deliveries }) => {
        const combo = pair ? comboId(pair[0], pair[1]) : undefined;
        collection.observe(combo ? [combo] : [], deliveries);
        return false;
      },
      complete: ({ bank, startingBank }) => collection.completeLevel(bank === startingBank),
    });
    case 'daily': return new ModeProgress({
      complete: ({ score, turns }) => collection.recordDaily(`${mode.day}:${GAME_RULES_VERSION}`, { score, moves: turns }),
    });
    case 'lab': return new ModeProgress({
      observe: ({ result, pair, automatic }) => !automatic && lessonCompleted(mode.lesson, result, pair),
    });
    case 'puzzle': return new ModeProgress({});
  }
}
