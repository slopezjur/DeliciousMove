import { SoundManager } from '../audio/SoundManager.ts';

export class HUDView {
  private scoreEl: HTMLElement;
  private movesEl: HTMLElement;
  private targetEl: HTMLElement;
  private progressFill: HTMLElement;
  private soundBtn: HTMLElement;
  private modalEl: HTMLElement;
  private modalTitle: HTMLElement;
  private modalScore: HTMLElement;
  private modalBtn: HTMLElement;

  private currentScore = 0;
  private targetScore = 5000;
  private displayedScore = 0;
  private animFrameId: number = 0;

  constructor(onRestart: () => void) {
    this.scoreEl = document.getElementById('score-value')!;
    this.movesEl = document.getElementById('moves-value')!;
    this.targetEl = document.getElementById('target-value')!;
    this.progressFill = document.getElementById('progress-fill')!;
    this.soundBtn = document.getElementById('sound-toggle-btn')!;
    this.modalEl = document.getElementById('game-modal')!;
    this.modalTitle = document.getElementById('modal-title')!;
    this.modalScore = document.getElementById('modal-final-score')!;
    this.modalBtn = document.getElementById('modal-action-btn')!;

    this.soundBtn.addEventListener('click', () => {
      const isMuted = SoundManager.toggleMute();
      this.soundBtn.textContent = isMuted ? '🔇' : '🔊';
    });

    this.modalBtn.addEventListener('click', () => {
      this.hideModal();
      onRestart();
    });
  }

  public initLevel(moves: number, target: number): void {
    this.currentScore = 0;
    this.displayedScore = 0;
    this.targetScore = target;
    this.scoreEl.textContent = '0';
    this.movesEl.textContent = moves.toString();
    this.targetEl.textContent = target.toLocaleString();
    this.progressFill.style.width = '0%';
    this.hideModal();
  }

  public updateMoves(moves: number): void {
    this.movesEl.textContent = moves.toString();
    if (moves <= 5) {
      this.movesEl.classList.add('low-moves');
    } else {
      this.movesEl.classList.remove('low-moves');
    }
  }

  public addScore(amount: number): void {
    this.currentScore += amount;
    this.animateScore();
    const progress = Math.min(100, (this.currentScore / this.targetScore) * 100);
    this.progressFill.style.width = `${progress}%`;
  }

  private animateScore(): void {
    cancelAnimationFrame(this.animFrameId);
    const step = () => {
      const diff = this.currentScore - this.displayedScore;
      if (diff > 0) {
        this.displayedScore += Math.ceil(diff * 0.15);
        this.scoreEl.textContent = this.displayedScore.toLocaleString();
        this.animFrameId = requestAnimationFrame(step);
      } else {
        this.displayedScore = this.currentScore;
        this.scoreEl.textContent = this.displayedScore.toLocaleString();
      }
    };
    this.animFrameId = requestAnimationFrame(step);
  }

  public showVictory(score: number): void {
    SoundManager.playVictory();
    this.modalTitle.textContent = '🍬 SWEET VICTORY! 🍬';
    this.modalTitle.style.color = '#00e676';
    this.modalScore.textContent = `Final Score: ${score.toLocaleString()}`;
    this.modalBtn.textContent = 'Play Next Level';
    this.modalEl.classList.remove('hidden');
  }

  public showGameOver(score: number): void {
    this.modalTitle.textContent = 'OUT OF MOVES';
    this.modalTitle.style.color = '#ff1744';
    this.modalScore.textContent = `Score Achieved: ${score.toLocaleString()}`;
    this.modalBtn.textContent = 'Try Again';
    this.modalEl.classList.remove('hidden');
  }

  public hideModal(): void {
    this.modalEl.classList.add('hidden');
  }
}
