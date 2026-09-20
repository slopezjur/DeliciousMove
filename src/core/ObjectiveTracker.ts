import { Objective, ObjectiveEvent, ObjectiveProgress, eventMatches } from './BoardFeatures.ts';

/** Counts removal events independently of scoring and presentation. */
export class ObjectiveTracker {
  private counts: number[];
  constructor(private readonly objectives: readonly Objective[], restored?: readonly number[]) {
    this.counts = objectives.map((objective, i) => Math.min(objective.target, restored?.[i] ?? 0));
  }
  public record(events: readonly ObjectiveEvent[]): void {
    this.objectives.forEach((objective, i) => {
      for (const event of events) if (eventMatches(objective, event)) {
        this.counts[i] = Math.min(objective.target, this.counts[i] + event.amount);
      }
    });
  }
  public snapshot(score: number): ObjectiveProgress[] {
    return this.objectives.map((objective, i) => ({ objective: { ...objective },
      current: Math.min(objective.target, objective.kind === 'score' ? score : this.counts[i]) }));
  }
  public complete(score: number): boolean { return this.snapshot(score).every(p => p.current >= p.objective.target); }
}
