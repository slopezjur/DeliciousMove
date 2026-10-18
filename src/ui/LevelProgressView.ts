import type { Objective, ObjectiveProgress } from '../core/BoardFeatures.ts';
import type { LevelConfig } from '../core/LevelProgression.ts';

/** Sole owner of the shared goal progress bar and minimum-score completion marker. */
export class LevelProgressView {
  private progress: ObjectiveProgress[] = [];

  setLevel(config: LevelConfig): void {
    const objectives: readonly Objective[] = config.objectives ?? [{ kind: 'score', target: config.targetScore }];
    this.update(objectives.map(objective => ({ objective, current: 0 })));
  }

  update(progress: readonly ObjectiveProgress[]): void {
    this.progress = structuredClone([...progress]);
    this.render();
  }

  setScore(score: number): void {
    for (const item of this.progress) {
      if (item.objective.kind === 'score') item.current = Math.min(score, item.objective.target);
    }
    this.render();
  }

  setBonusPhase(active: boolean): void {
    if (typeof document !== 'undefined') document.getElementById('progress-fill')?.classList.toggle('bonus-phase-glow', active);
  }

  private render(): void {
    if (typeof document === 'undefined') return;
    const score = this.progress.find(p => p.objective.kind === 'score');
    const scoreBox = document.getElementById('score-target-box');
    if (scoreBox) {
      scoreBox.classList.toggle('hidden', !score);
      scoreBox.dataset.complete = String(!!score && score.current >= score.objective.target);
    }
    const fill = document.getElementById('progress-fill');
    const ratio = this.progress.length
      ? this.progress.reduce((sum, p) => sum + p.current / p.objective.target, 0) / this.progress.length : 0;
    if (fill) fill.style.width = `${Math.min(100, ratio * 100)}%`;
  }
}
