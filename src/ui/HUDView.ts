import { IHUDView } from './IHUDView.ts';
import { IGameModalView } from './IGameModalView.ts';
import { GameModalView } from './GameModalView.ts';
import { LevelConfig } from '../core/LevelProgression.ts';
import { GameOverReason } from '../core/GameSession.ts';
import { ISoundService } from '../audio/ISoundService.ts';
import { soundManagerInstance } from '../audio/SoundManager.ts';

const LOW_MOVES_THRESHOLD = 5;

export class HUDView implements IHUDView {
  private scoreEl: HTMLElement | null;
  private movesEl: HTMLElement | null;
  private targetEl: HTMLElement | null;
  private levelEl: HTMLElement | null;
  private shufflesEl: HTMLElement | null;
  private progressFill: HTMLElement | null;
  private soundBtn: HTMLElement | null;

  private soundService: ISoundService;
  private modal: IGameModalView;

  private currentScore = 0;
  private targetScore = 4000;
  private displayedScore = 0;
  private animFrameId: number = 0;

  constructor(
    onModalAction: () => void,
    soundService: ISoundService = soundManagerInstance,
    modal: IGameModalView = new GameModalView(onModalAction, soundService)
  ) {
    this.soundService = soundService;
    this.modal = modal;

    this.scoreEl = this.findElement('score-value');
    this.movesEl = this.findElement('moves-value');
    this.targetEl = this.findElement('target-value');
    this.levelEl = this.findElement('level-value');
    this.shufflesEl = this.findElement('shuffles-value');
    this.progressFill = this.findElement('progress-fill');
    this.soundBtn = this.findElement('sound-toggle-btn');

    if (this.soundBtn) {
      this.soundBtn.addEventListener('click', () => {
        const isMuted = this.soundService.toggleMute();
        if (this.soundBtn) this.soundBtn.textContent = isMuted ? '🔇' : '🔊';
      });
    }
  }

  public initLevel(config: LevelConfig): void {
    this.currentScore = 0;
    this.displayedScore = 0;
    this.targetScore = config.targetScore;

    this.setText(this.scoreEl, '0');
    this.setText(this.levelEl, config.level.toString());
    this.setText(this.targetEl, config.targetScore.toLocaleString());
    if (this.progressFill) this.progressFill.style.width = '0%';

    this.updateMoves(config.moves);
    this.updateShuffles(config.shuffles);
    this.modal.hide();
  }

  public updateMoves(moves: number): void {
    this.setText(this.movesEl, moves.toString());
    this.movesEl?.classList.toggle('low-moves', moves <= LOW_MOVES_THRESHOLD);
  }

  public updateShuffles(shuffles: number): void {
    this.setText(this.shufflesEl, shuffles.toString());
    this.shufflesEl?.classList.toggle('low-moves', shuffles <= 0);
  }

  public addScore(amount: number): void {
    this.currentScore += amount;
    this.animateScore();
    const progress = Math.min(100, (this.currentScore / this.targetScore) * 100);
    if (this.progressFill) this.progressFill.style.width = `${progress}%`;
  }

  public showVictory(score: number, level: number): void {
    this.modal.showVictory(score, level);
  }

  public showGameOver(score: number, level: number, reason: GameOverReason): void {
    this.modal.showGameOver(score, level, reason);
  }

  private animateScore(): void {
    if (typeof cancelAnimationFrame === 'undefined') return;
    cancelAnimationFrame(this.animFrameId);
    const step = () => {
      const diff = this.currentScore - this.displayedScore;
      if (diff > 0) {
        this.displayedScore += Math.ceil(diff * 0.15);
        this.setText(this.scoreEl, this.displayedScore.toLocaleString());
        this.animFrameId = requestAnimationFrame(step);
      } else {
        this.displayedScore = this.currentScore;
        this.setText(this.scoreEl, this.displayedScore.toLocaleString());
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
