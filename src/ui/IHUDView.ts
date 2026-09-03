import { LevelConfig } from '../core/LevelProgression.ts';
import { GameOverReason } from '../core/GameSession.ts';

export interface IHUDView {
  initLevel(config: LevelConfig, bonusMoves?: number): void;
  updateMoves(moves: number): void;
  updateShuffles(shuffles: number): void;
  addScore(amount: number): void;
  showVictory(score: number, level: number, movesSaved?: number): void;
  showGameOver(score: number, level: number, reason: GameOverReason): void;
}
