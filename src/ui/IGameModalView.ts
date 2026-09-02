import { GameOverReason } from '../core/GameSession.ts';

export interface IGameModalView {
  showVictory(score: number, level: number): void;
  showGameOver(score: number, level: number, reason: GameOverReason): void;
  hide(): void;
}
