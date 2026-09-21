import { IHUDView } from './IHUDView.ts';
import { LevelConfig, LevelDifficulty } from '../core/LevelProgression.ts';

import { LanguageService } from '../i18n/LanguageService.ts';
import { ObjectivesView } from './ObjectivesView.ts';
import { ObjectiveProgress } from '../core/BoardFeatures.ts';

const LOW_MOVES_THRESHOLD = 5;

export class HUDView implements IHUDView {
  private scoreEl: HTMLElement | null;
  private globalScoreEl: HTMLElement | null;
  private movesEl: HTMLElement | null;
  private targetEl: HTMLElement | null;
  private levelEl: HTMLElement | null;
  private shufflesEl: HTMLElement | null;
  private difficultyBadgeEl: HTMLElement | null;
  private bonusPhaseBadgeEl: HTMLElement | null;
  private progressFill: HTMLElement | null;
  private readonly objectivesView: ObjectivesView;

  private currentScore = 0;
  private globalScore = 0;
  private difficulty: LevelDifficulty = LevelDifficulty.Easy;
  private targetScore = 4000;
  private displayedScore = 0;
  private bonusActive = false;
  private lastChanceActive = false;
  private animFrameId: number = 0;

  constructor(private readonly language = new LanguageService()) {
    this.objectivesView = new ObjectivesView(language);
    language.subscribe(() => this.refreshLanguage());

    this.scoreEl = this.findElement('score-value');
    this.globalScoreEl = this.findElement('global-score-value');
    this.movesEl = this.findElement('moves-value');
    this.targetEl = this.findElement('target-value');
    this.levelEl = this.findElement('level-value');
    this.shufflesEl = this.findElement('shuffles-value');
    this.difficultyBadgeEl = this.findElement('difficulty-badge');
    this.bonusPhaseBadgeEl = this.findElement('bonus-phase-indicator');
    this.progressFill = this.findElement('progress-fill');
    const bonusDialog = this.findElement('bonus-info-dialog') as HTMLDialogElement | null;
    this.bonusPhaseBadgeEl?.addEventListener('click', () => bonusDialog?.showModal());
    this.findElement('bonus-info-close')?.addEventListener('click', () => bonusDialog?.close());

  }

  public initLevel(config: LevelConfig, bonusMoves: number = 0, globalScore: number = 0): void {
    this.setLastChance(false);
    this.objectivesView.setLevel(config);
    this.difficulty = config.difficulty;
    this.globalScore = globalScore;
    this.currentScore = 0;
    this.displayedScore = 0;
    this.targetScore = config.targetScore;

    this.setText(this.scoreEl, '0');
    this.setText(this.globalScoreEl, globalScore.toLocaleString(this.language.locale));
    this.setText(this.levelEl, config.level.toString());
    this.setText(this.targetEl, config.targetScore.toLocaleString(this.language.locale));
    if (this.progressFill) {
      this.progressFill.style.width = '0%';
      this.progressFill.classList.remove('bonus-phase-glow');
    }

    if (this.bonusPhaseBadgeEl) {
      this.bonusPhaseBadgeEl.classList.add('hidden');
    }

    if (this.difficultyBadgeEl && config.difficulty) {
      this.difficultyBadgeEl.textContent = this.language.t(config.difficulty);
      this.difficultyBadgeEl.className = `difficulty-badge difficulty-${config.difficulty}`;
    }

    this.updateMoves(config.moves + bonusMoves, false, config.moves, bonusMoves);
    this.showBonus(false);
    this.updateShuffles(config.shuffles);
  }

  public updateMoves(moves: number, isFrozen = false, levelMoves = moves, bankMoves = 0): void {
    this.setText(this.movesEl, levelMoves.toString());
    this.setText(this.findElement('bank-moves-value'), bankMoves.toString());
    this.findElement('bank-moves')?.classList.toggle('bank-active', levelMoves === 0 && bankMoves > 0 && !isFrozen);
    if (isFrozen) {
      this.movesEl?.classList.remove('low-moves');
      this.movesEl?.classList.add('frozen-moves');
    } else {
      this.movesEl?.classList.remove('frozen-moves');
      this.movesEl?.classList.toggle('low-moves', moves <= LOW_MOVES_THRESHOLD);
    }
  }

  public updateShuffles(shuffles: number): void {
    this.setText(this.shufflesEl, shuffles.toString());
    this.shufflesEl?.classList.toggle('low-moves', shuffles <= 0);
  }

  public updateObjectives(progress: ObjectiveProgress[]): void {
    this.objectivesView.update(progress);
    this.showBonus(progress.length > 0 && progress.every(p => p.current >= p.objective.target));
  }

  private showBonus(active: boolean): void {
    this.bonusActive = active;
    this.bonusPhaseBadgeEl?.classList.toggle('hidden', !active || this.lastChanceActive);
    this.progressFill?.classList.toggle('bonus-phase-glow', active);
    if (active) {
      this.movesEl?.classList.remove('low-moves');
      this.movesEl?.classList.add('frozen-moves');
      this.progressFill?.classList.add('bonus-phase-glow');
    }
  }

  public setLastChance(active: boolean): void {
    this.lastChanceActive = active;
    this.findElement('last-chance-indicator')?.classList.toggle('hidden', !active);
    this.showBonus(this.bonusActive);
  }

  public addScore(amount: number, globalScore?: number, isBonusPhase?: boolean): void {
    this.currentScore += amount;
    if (globalScore !== undefined) {
      this.globalScore = globalScore;
      this.setText(this.globalScoreEl, globalScore.toLocaleString(this.language.locale));
    }
    this.animateScore();
    const progress = Math.min(100, (this.currentScore / this.targetScore) * 100);
    if (this.progressFill && !this.objectivesView.hasVariedObjectives()) this.progressFill.style.width = `${progress}%`;

    const qualified = isBonusPhase ?? (!this.objectivesView.hasVariedObjectives() && this.currentScore >= this.targetScore);
    this.showBonus(qualified);
  }

  private refreshLanguage(): void {
    this.showBonus(this.bonusActive);
    this.setText(this.difficultyBadgeEl, this.language.t(this.difficulty));
    this.setText(this.scoreEl, this.displayedScore.toLocaleString(this.language.locale));
    this.setText(this.globalScoreEl, this.globalScore.toLocaleString(this.language.locale));
    this.setText(this.targetEl, this.targetScore.toLocaleString(this.language.locale));
  }

  private animateScore(): void {
    if (typeof cancelAnimationFrame === 'undefined') return;
    cancelAnimationFrame(this.animFrameId);
    const step = () => {
      const diff = this.currentScore - this.displayedScore;
      if (diff > 0) {
        this.displayedScore += Math.ceil(diff * 0.15);
        this.setText(this.scoreEl, this.displayedScore.toLocaleString(this.language.locale));
        this.animFrameId = requestAnimationFrame(step);
      } else {
        this.displayedScore = this.currentScore;
        this.setText(this.scoreEl, this.displayedScore.toLocaleString(this.language.locale));
      }
    };
    this.animFrameId = requestAnimationFrame(step);
  }

  private setText(element: HTMLElement | null, value: string): void {
    if (element) element.textContent = value;
  }

  private findElement(id: string): HTMLElement | null {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }
}
