import { IHUDView } from './IHUDView.ts';
import { LevelConfig, LevelDifficulty } from '../core/LevelProgression.ts';
import { ISoundService } from '../audio/ISoundService.ts';
import { SoundManager } from '../audio/SoundManager.ts';

import { LanguageService } from '../i18n/LanguageService.ts';

const LOW_MOVES_THRESHOLD = 5;

export class HUDView implements IHUDView {
  private scoreEl: HTMLElement | null;
  private globalScoreEl: HTMLElement | null;
  private movesEl: HTMLElement | null;
  private targetEl: HTMLElement | null;
  private levelEl: HTMLElement | null;
  private shufflesEl: HTMLElement | null;
  private difficultyBadgeEl: HTMLElement | null;
  private movesBonusBadgeEl: HTMLElement | null;
  private movesFrozenBadgeEl: HTMLElement | null;
  private bonusPhaseBadgeEl: HTMLElement | null;
  private progressFill: HTMLElement | null;
  private soundBtn: HTMLElement | null;

  private soundService: ISoundService;

  private currentScore = 0;
  private globalScore = 0;
  private difficulty: LevelDifficulty = LevelDifficulty.Easy;
  private targetScore = 4000;
  private displayedScore = 0;
  private animFrameId: number = 0;

  constructor(soundService: ISoundService = new SoundManager(), private readonly language = new LanguageService()) {
    this.soundService = soundService;
    language.subscribe(() => this.refreshLanguage());

    this.scoreEl = this.findElement('score-value');
    this.globalScoreEl = this.findElement('global-score-value');
    this.movesEl = this.findElement('moves-value');
    this.targetEl = this.findElement('target-value');
    this.levelEl = this.findElement('level-value');
    this.shufflesEl = this.findElement('shuffles-value');
    this.difficultyBadgeEl = this.findElement('difficulty-badge');
    this.movesBonusBadgeEl = this.findElement('moves-bonus-badge');
    this.movesFrozenBadgeEl = this.findElement('moves-frozen-badge');
    this.bonusPhaseBadgeEl = this.findElement('bonus-phase-indicator');
    this.progressFill = this.findElement('progress-fill');
    this.soundBtn = this.findElement('sound-toggle-btn');

    if (this.soundBtn) {
      this.soundBtn.addEventListener('click', () => {
        this.soundService.toggleMute();
        this.renderSound();
      });
      this.renderSound();
    }
  }

  public initLevel(config: LevelConfig, bonusMoves: number = 0, globalScore: number = 0): void {
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
    if (this.movesFrozenBadgeEl) {
      this.movesFrozenBadgeEl.classList.add('hidden');
    }

    if (this.difficultyBadgeEl && config.difficulty) {
      this.difficultyBadgeEl.textContent = this.language.t(config.difficulty);
      this.difficultyBadgeEl.className = `difficulty-badge difficulty-${config.difficulty}`;
    }

    if (this.movesBonusBadgeEl) {
      if (bonusMoves > 0) {
        this.movesBonusBadgeEl.textContent = `+${bonusMoves}`;
        this.movesBonusBadgeEl.classList.remove('hidden');
      } else {
        this.movesBonusBadgeEl.classList.add('hidden');
      }
    }

    this.updateMoves(config.moves + bonusMoves, false);
    this.updateShuffles(config.shuffles);
  }

  public updateMoves(moves: number, isFrozen = false): void {
    this.setText(this.movesEl, moves.toString());
    if (isFrozen) {
      this.movesFrozenBadgeEl?.classList.remove('hidden');
      this.movesEl?.classList.remove('low-moves');
      this.movesEl?.classList.add('frozen-moves');
    } else {
      this.movesFrozenBadgeEl?.classList.add('hidden');
      this.movesEl?.classList.remove('frozen-moves');
      this.movesEl?.classList.toggle('low-moves', moves <= LOW_MOVES_THRESHOLD);
    }
  }

  public updateShuffles(shuffles: number): void {
    this.setText(this.shufflesEl, shuffles.toString());
    this.shufflesEl?.classList.toggle('low-moves', shuffles <= 0);
  }

  public addScore(amount: number, globalScore?: number, isBonusPhase?: boolean): void {
    this.currentScore += amount;
    if (globalScore !== undefined) {
      this.globalScore = globalScore;
      this.setText(this.globalScoreEl, globalScore.toLocaleString(this.language.locale));
    }
    this.animateScore();
    const progress = Math.min(100, (this.currentScore / this.targetScore) * 100);
    if (this.progressFill) this.progressFill.style.width = `${progress}%`;

    const qualified = isBonusPhase ?? (this.currentScore >= this.targetScore);
    if (qualified) {
      this.bonusPhaseBadgeEl?.classList.remove('hidden');
      this.movesFrozenBadgeEl?.classList.remove('hidden');
      this.movesEl?.classList.remove('low-moves');
      this.movesEl?.classList.add('frozen-moves');
      this.progressFill?.classList.add('bonus-phase-glow');
    }
  }

  private refreshLanguage(): void {
    this.renderSound();
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

  private renderSound(): void {
    if (!this.soundBtn) return;
    const enabled = !this.soundService.isMuted();
    this.soundBtn.textContent = this.language.t(enabled ? 'soundOn' : 'soundOff');
    this.soundBtn.setAttribute('aria-pressed', String(enabled));
    this.soundBtn.setAttribute('aria-label', this.language.t('soundTip'));
  }

  private setText(element: HTMLElement | null, value: string): void {
    if (element) element.textContent = value;
  }

  private findElement(id: string): HTMLElement | null {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }
}
