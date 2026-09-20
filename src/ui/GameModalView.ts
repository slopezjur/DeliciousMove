import { IGameModalView } from './IGameModalView.ts';
import { GameOverReason } from '../core/GameSession.ts';
import { ISoundService } from '../audio/ISoundService.ts';
import { SoundManager } from '../audio/SoundManager.ts';

import { LanguageService } from '../i18n/LanguageService.ts';

export class GameModalView implements IGameModalView {
  private modalEl: HTMLElement | null;
  private modalTitle: HTMLElement | null;
  private modalScore: HTMLElement | null;
  private modalGlobalContainer: HTMLElement | null;
  private modalGlobalScore: HTMLElement | null;
  private modalDetail: HTMLElement | null;
  private modalBtn: HTMLElement | null;
  private soundService: ISoundService;
  private redraw?: () => void;

  /**
   * @param onAction Invoked when the player confirms the modal. The caller decides what
   *                 that means for the current state (advance a level or restart the run).
   */
  constructor(onAction: () => void, soundService: ISoundService = new SoundManager(), private readonly language = new LanguageService()) {
    this.soundService = soundService;
    language.subscribe(() => this.redraw?.());
    this.modalEl = this.findElement('game-modal');
    this.modalTitle = this.findElement('modal-title');
    this.modalScore = this.findElement('modal-final-score');
    this.modalGlobalContainer = this.findElement('modal-global-container');
    this.modalGlobalScore = this.findElement('modal-global-score');
    this.modalDetail = this.findElement('modal-detail');
    this.modalBtn = this.findElement('modal-action-btn');

    if (this.modalBtn) {
      this.modalBtn.addEventListener('click', () => {
        this.hide();
        onAction();
      });
    }
  }

  public showVictory(score: number, level: number, movesSaved: number = 0, globalScore?: number): void {
    this.soundService.playVictory();
    this.redraw = () => {
      const savedMsg = movesSaved > 0
        ? this.language.t('banked', { moves: movesSaved, level: level + 1 })
        : this.language.t('nextWaiting', { level: level + 1 });
      this.render({
        title: this.language.t('victoryTitle'),
        detail: this.language.t('cleared', { level }) + ' ' + savedMsg,
        score, globalScore, buttonLabel: this.language.t('nextLevel'),
      });
    };
    this.redraw();
  }

  public showGameOver(score: number, level: number, reason: GameOverReason): void {
    this.redraw = () => {
      const deadlock = reason === GameOverReason.Deadlock;
      this.render({
        title: this.language.t(deadlock ? 'deadlockTitle' : 'outTitle'),
        detail: this.language.t(deadlock ? 'deadlockDetail' : 'outDetail') + ' ' + this.language.t('reached', { level }),
        score, buttonLabel: this.language.t('tryAgain'),
      });
    };
    this.redraw();
  }

  public hide(): void {
    this.redraw = undefined;
    if (this.modalEl) this.modalEl.classList.add('hidden');
  }

  private render(view: {
    title: string;
    detail: string;
    score: number;
    globalScore?: number;
    buttonLabel: string;
  }): void {
    if (this.modalTitle) this.modalTitle.textContent = view.title;
    if (this.modalDetail) this.modalDetail.textContent = view.detail;
    if (this.modalScore) this.modalScore.textContent = view.score.toLocaleString(this.language.locale);

    if (this.modalGlobalContainer && this.modalGlobalScore) {
      if (view.globalScore !== undefined && view.globalScore > 0) {
        this.modalGlobalScore.textContent = view.globalScore.toLocaleString(this.language.locale);
        this.modalGlobalContainer.classList.remove('hidden');
      } else {
        this.modalGlobalContainer.classList.add('hidden');
      }
    }

    if (this.modalBtn) this.modalBtn.textContent = view.buttonLabel;
    if (this.modalEl) this.modalEl.classList.remove('hidden');
  }

  private findElement(id: string): HTMLElement | null {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }
}
