export interface ISoundEffects {
  playSwap(): void;
  playMatch(combo?: number): void;
  playSpecialLaser(): void;
  playBombExplosion(): void;
  playVictory(): void;
  playShuffle(): void;
  playAirplaneFly(): void;
}

export interface ISoundPreferences {
  toggleMute(): boolean;
  isMuted(): boolean;
}

export interface ISoundService extends ISoundEffects, ISoundPreferences {}
