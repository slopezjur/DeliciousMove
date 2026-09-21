import { GameOverReason } from '../core/GameSession.ts';
import { LivesSnapshot } from '../persistence/PlayerResources.ts';

export interface IGameModalView {
  updateLives?(snapshot: LivesSnapshot): void;
  showNoLives?(): void;
  showVictory(score: number, level: number, movesSaved?: number, globalScore?: number): void;
  showGameOver(score: number, level: number, reason: GameOverReason): void;
  hide(): void;
}
