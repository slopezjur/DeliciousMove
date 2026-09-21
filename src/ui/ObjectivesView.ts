import { Objective, ObjectiveProgress } from '../core/BoardFeatures.ts';
import { LevelConfig } from '../core/LevelProgression.ts';
import { LanguageService, MessageKey } from '../i18n/LanguageService.ts';

export function objectiveLabel(language: LanguageService, objective: Objective): string {
  if (objective.kind === 'color') return language.t('collectColor', { color: language.t(`color_${objective.color}` as MessageKey) });
  if (objective.kind === 'blocker') return language.t('clearBlocker', { blocker: language.t(`blocker_${objective.blocker}`) });
  return language.t(`objective_${objective.kind}`);
}

/** Localized goal counters share one source of truth with session victory rules. */
export class ObjectivesView {
  private config?: LevelConfig;
  private progress: ObjectiveProgress[] = [];
  constructor(private readonly language: LanguageService) { language.subscribe(() => this.render()); }
  setLevel(config: LevelConfig): void { this.config = config; this.progress = []; this.render(); }
  update(progress: ObjectiveProgress[]): void { this.progress = structuredClone(progress); this.render(); }
  hasVariedObjectives(): boolean { return !!this.config?.objectives?.some(o => o.kind !== 'score'); }

  private render(): void {
    if (typeof document === 'undefined') return;
    const list = document.getElementById('objectives-list');
    if (!list) return;
    const varied = this.hasVariedObjectives();
    list.classList.toggle('hidden', !varied);
    const scoreGoal = this.progress.find(p => p.objective.kind === 'score');
    const scoreBox = document.getElementById('score-target-box');
    if (scoreBox) {
      scoreBox.classList.toggle('hidden', varied && !scoreGoal);
      scoreBox.dataset.complete = String(!!scoreGoal && scoreGoal.current >= scoreGoal.objective.target);
    }
    list.replaceChildren();
    for (const { objective, current } of varied ? this.progress.filter(p => p.objective.kind !== 'score') : []) {
      const item = document.createElement('div');
      item.className = 'objective-item';
      item.dataset.kind = objective.kind;
      item.dataset.complete = String(current >= objective.target);
      const icon = document.createElement('span');
      icon.className = 'objective-icon'; icon.setAttribute('aria-hidden', 'true');
      if (objective.kind === 'color') { icon.textContent = '◆'; icon.dataset.color = String(objective.color); }
      else icon.textContent = objective.kind === 'ingredient' ? '🍒' : objective.kind === 'jelly' ? '◈'
        : objective.kind === 'blocker' ? { ice: '❄', frosting: '🧁', crate: '📦', chocolate: '🍫' }[objective.blocker] : '★';
      const label = document.createElement('span'); label.textContent = objectiveLabel(this.language, objective);
      const count = document.createElement('strong');
      count.textContent = `${current.toLocaleString(this.language.locale)} / ${objective.target.toLocaleString(this.language.locale)}`;
      item.append(icon, label, count); list.append(item);
    }
    if (varied && this.progress.length) {
      const fill = document.getElementById('progress-fill');
      const ratio = this.progress.reduce((sum, p) => sum + p.current / p.objective.target, 0) / this.progress.length;
      if (fill) fill.style.width = `${Math.min(100, ratio * 100)}%`;
    }
  }
}
