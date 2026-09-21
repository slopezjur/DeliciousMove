import { LanguageService } from '../i18n/LanguageService.ts';
import { LivesSnapshot, PlayerResources } from '../persistence/PlayerResources.ts';

export function lifeCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export class LivesView {
  constructor(private readonly language: LanguageService) {}
  render(snapshot: LivesSnapshot, status: PlayerResources['status']): void {
    if (typeof document === 'undefined') return;
    const value = document.getElementById('lives-value'), timer = document.getElementById('lives-timer');
    if (value) value.textContent = `♥ ${snapshot.lives}/${snapshot.maximum}`;
    if (timer) timer.textContent = snapshot.secondsToNext ? this.language.t('nextLife', { time: lifeCountdown(snapshot.secondsToNext) }) : '';
    const warning = document.getElementById('resources-warning');
    if (warning) {
      warning.classList.toggle('hidden', status === 'available');
      warning.textContent = status === 'available' ? '' : this.language.t(status === 'preserved' ? 'resourcesPreserved' : 'resourcesUnavailable');
    }
  }
}
