import { IGameModalView } from './IGameModalView.ts';
import { GameOverReason } from '../core/GameSession.ts';
import { ISoundService } from '../audio/ISoundService.ts';
import { soundManagerInstance } from '../audio/SoundManager.ts';

const GAME_OVER_COPY: Record<GameOverReason, { title: string; detail: string }> = {
  [GameOverReason.OutOfMoves]: {
    title: '💔 Out of Moves',
    detail: 'You ran out of moves before reaching the target.',
  },
  [GameOverReason.Deadlock]: {
    title: '🧩 No Moves Possible',
    detail: 'The board jammed and you had no reshuffles left.',
  },
};

export class GameModalView implements IGameModalView {
  private modalEl: HTMLElement | null;
  private modalTitle: HTMLElement | null;
  private modalScore: HTMLElement | null;
  private modalDetail: HTMLElement | null;
  private modalBtn: HTMLElement | null;
  private soundService: ISoundService;

  /**
   * @param onAction Invoked when the player confirms the modal. The caller decides what
   *                 that means for the current state (advance a level or restart the run).
   */
  constructor(onAction: () => void, soundService: ISoundService = soundManagerInstance) {
    this.soundService = soundService;
    this.modalEl = this.findElement('game-modal');
    this.modalTitle = this.findElement('modal-title');
    this.modalScore = this.findElement('modal-final-score');
    this.modalDetail = this.findElement('modal-detail');
    this.modalBtn = this.findElement('modal-action-btn');

    if (this.modalBtn) {
      this.modalBtn.addEventListener('click', () => {
        this.hide();
        onAction();
      });
    }
  }

  public showVictory(score: number, level: number, movesSaved: number = 0): void {
    this.soundService.playVictory();
    const savedMsg = movesSaved > 0
      ? `🎉 ${movesSaved} unused moves banked for Level ${level + 1}!`
      : `Level ${level + 1} is waiting!`;
    this.render({
      title: '🎉 Sweet Victory!',
      detail: `Level ${level} cleared. ${savedMsg}`,
      score,
      buttonLabel: 'Next Level →',
    });
  }

  public showGameOver(score: number, level: number, reason: GameOverReason): void {
    const copy = GAME_OVER_COPY[reason] ?? GAME_OVER_COPY[GameOverReason.OutOfMoves];
    this.render({
      title: copy.title,
      detail: `${copy.detail} You reached level ${level}.`,
      score,
      buttonLabel: 'Try Again',
    });
  }

  public hide(): void {
    if (this.modalEl) this.modalEl.classList.add('hidden');
  }

  private render(view: { title: string; detail: string; score: number; buttonLabel: string }): void {
    if (this.modalTitle) this.modalTitle.textContent = view.title;
    if (this.modalDetail) this.modalDetail.textContent = view.detail;
    if (this.modalScore) this.modalScore.textContent = view.score.toLocaleString();
    if (this.modalBtn) this.modalBtn.textContent = view.buttonLabel;
    if (this.modalEl) this.modalEl.classList.remove('hidden');
  }

  private findElement(id: string): HTMLElement | null {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }
}
