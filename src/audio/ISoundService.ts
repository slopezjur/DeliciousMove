export interface ISoundService {
  playSwap(): void;
  playMatch(combo?: number): void;
  playSpecialLaser(): void;
  playBombExplosion(): void;
  playVictory(): void;
  playShuffle(): void;
  playAirplaneFly(): void;
  toggleMute(): boolean;
  isMuted(): boolean;
}
