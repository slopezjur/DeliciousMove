import { afterEach, expect, it, vi } from 'vitest';
import { GameModalView } from '../src/ui/GameModalView.ts';
import { LivesView } from '../src/ui/LivesView.ts';
import { HUDView } from '../src/ui/HUDView.ts';
import { LanguageService } from '../src/i18n/LanguageService.ts';
import { SoundManager } from '../src/audio/SoundManager.ts';
import { GameOverReason } from '../src/core/GameSession.ts';

function dom(ids: string[]) {
  const elements = new Map(ids.map(id => {
    const classes = new Set<string>();
    return [id, { textContent: '', disabled: false, style: {}, showModal: vi.fn(), close: vi.fn(),
      addEventListener: vi.fn(), classList: { add: (s: string) => classes.add(s), remove: (s: string) => classes.delete(s),
        contains: (s: string) => classes.has(s), toggle: (s: string, value: boolean) => value ? classes.add(s) : classes.delete(s) } }];
  }));
  vi.stubGlobal('document', { getElementById: (id: string) => elements.get(id) ?? null });
  return (id: string) => elements.get(id)!;
}
afterEach(() => vi.unstubAllGlobals());

it('disables retry at zero, updates the countdown and enables retry after regeneration in either language', () => {
  const el = dom(['modal-title', 'modal-detail', 'modal-action-btn', 'game-modal', 'lives-value', 'lives-timer']);
  const language = new LanguageService(), modal = new GameModalView(vi.fn(), new SoundManager(), language);
  const lives = new LivesView(language);
  const empty = { lives: 0, maximum: 5, secondsToNext: 61 };
  modal.updateLives(empty); modal.showGameOver(400, 7, GameOverReason.OutOfMoves); lives.render(empty, 'available');
  expect(el('modal-action-btn').disabled).toBe(true);
  expect(el('modal-detail').textContent).toContain('1:01');
  expect(el('lives-timer').textContent).toBe('+1 in 1:01');
  language.setLocale('es');
  expect(el('modal-action-btn').textContent).toBe('Sin vidas');
  modal.updateLives({ ...empty, secondsToNext: 60 });
  expect(el('modal-detail').textContent).toContain('1:00');
  modal.updateLives({ lives: 1, maximum: 5, secondsToNext: 1800 });
  expect(el('modal-action-btn').disabled).toBe(false);
  expect(el('modal-action-btn').textContent).toBe('Reintentar nivel');
});

it('separates and highlights bank moves and opens bonus help without changing hint visibility', () => {
  const el = dom(['moves-value', 'bank-moves-value', 'bank-moves', 'bonus-phase-indicator', 'bonus-info-dialog', 'bonus-info-close', 'level-feature-hint']);
  const hud = new HUDView();
  hud.updateMoves(3, false, 0, 3);
  expect(el('moves-value').textContent).toBe('0');
  expect(el('bank-moves-value').textContent).toBe('3');
  expect(el('bank-moves').classList.contains('bank-active')).toBe(true);
  hud.updateObjectives([{ objective: { kind: 'score', target: 100 }, current: 100 }]);
  hud.updateMoves(3, true, 0, 3);
  expect(el('bank-moves').classList.contains('bank-active')).toBe(false);
  expect(el('level-feature-hint').classList.contains('hidden')).toBe(false);
  el('bonus-phase-indicator').addEventListener.mock.calls[0][1]();
  expect(el('bonus-info-dialog').showModal).toHaveBeenCalledOnce();
  el('bonus-info-close').addEventListener.mock.calls[0][1]();
  expect(el('bonus-info-dialog').close).toHaveBeenCalledOnce();
});
