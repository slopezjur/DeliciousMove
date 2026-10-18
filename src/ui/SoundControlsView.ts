import type { ILocalization } from '../i18n/ILanguageService.ts';
import { ISoundService } from '../audio/ISoundService.ts';

export type SoundPreferences = Pick<ISoundService, 'toggleMute' | 'isMuted'>;

/** Owns the settings toggle independently of gameplay metrics and audio playback. */
export class SoundControlsView {
  private readonly button: HTMLElement | null;

  constructor(private readonly sound: SoundPreferences, private readonly language: ILocalization) {
    this.button = typeof document === 'undefined' ? null : document.getElementById('sound-toggle-btn');
    this.button?.addEventListener('click', () => {
      this.sound.toggleMute();
      this.render();
    });
    language.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    if (!this.button) return;
    const enabled = !this.sound.isMuted();
    this.button.textContent = this.language.t(enabled ? 'soundOn' : 'soundOff');
    this.button.setAttribute('aria-pressed', String(enabled));
    this.button.setAttribute('aria-label', this.language.t('soundTip'));
  }
}
