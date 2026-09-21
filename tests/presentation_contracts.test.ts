import { afterEach, describe, expect, it, vi } from 'vitest';
import gsap from 'gsap';
import { LanguageService } from '../src/i18n/LanguageService.ts';
import { SaveStatusView } from '../src/ui/SaveStatusView.ts';
import { RecordsView } from '../src/ui/RecordsView.ts';
import { SaveStatus } from '../src/persistence/SaveStore.ts';
import { ITileVisual } from '../src/view/ITileVisual.ts';
import { IBoardViewAnimator } from '../src/view/IBoardViewContracts.ts';
import { AnimationQueue } from '../src/view/AnimationQueue.ts';
import { SpecialType, TileColor } from '../src/core/TileTypes.ts';
import { GameSession } from '../src/core/GameSession.ts';

afterEach(() => vi.unstubAllGlobals());

describe('segregated presentation contracts', () => {
  it('shows save warnings when needed and removes their occupied row after recovery', () => {
    const badge = { textContent: '', title: '', hidden: true, dataset: { warning: '' } };
    const detail = { textContent: '' };
    vi.stubGlobal('document', { getElementById: (id: string) => id === 'save-status' ? badge : detail });
    const language = new LanguageService(), view = new SaveStatusView(language);
    view.render('unavailable');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe(language.t('save_unavailable'));
    view.render('saved');
    expect(badge.hidden).toBe(true);
    expect(badge.textContent).toBe('');
    expect(detail.textContent).toBe(language.t('save_saved'));
  });

  it.each<SaveStatus>(['none', 'saved', 'unavailable', 'invalid', 'newer', 'incompatible', 'recovered'])(
    'renders %s checkpoint status and refreshes it when language changes', status => {
      const badge = { textContent: '', title: '', hidden: false, dataset: { warning: '' } }, detail = { textContent: '' };
      vi.stubGlobal('document', { getElementById: (id: string) => id === 'save-status' ? badge : detail });
      const language = new LanguageService(), view = new SaveStatusView(language);
      view.render(status);
      const warning = status !== 'none' && status !== 'saved';
      for (let i = 0; i < 2; i++) {
        expect(detail.textContent).toBe(language.t(`save_${status}`));
        expect(badge.title).toBe(detail.textContent);
        expect(badge.dataset.warning).toBe(String(warning));
        expect(badge.textContent).toBe(warning ? detail.textContent : '');
        expect(badge.hidden).toBe(!warning);
        language.toggle();
      }
    },
  );

  it('renders records from a read-only provider without storage or write methods', () => {
    const level = { textContent: '' }, score = { textContent: '' };
    const settingsLevel = { textContent: '' }, settingsScore = { textContent: '' };
    vi.stubGlobal('document', { getElementById: (id: string) =>
      id === 'best-level-value' ? level : id === 'best-score-value' ? score
        : id === 'settings-best-level-value' ? settingsLevel : id === 'settings-best-score-value' ? settingsScore : null });
    const language = new LanguageService();
    const view = new RecordsView({ status: 'available', getSnapshot: () => ({ bestLevel: 12, bestScore: 12345 }) }, language);
    view.render();
    expect(level.textContent).toBe('12');
    expect(score.textContent).toBe((12345).toLocaleString(language.locale));
    expect(settingsLevel.textContent).toBe(level.textContent);
    expect(settingsScore.textContent).toBe(score.textContent);
    language.toggle();
    expect(score.textContent).toBe((12345).toLocaleString(language.locale));
    expect(settingsScore.textContent).toBe(score.textContent);
  });

  it('animates structural tile visuals without Pixi sprites or a domain board', async () => {
    const tile = (id: number, col: number): ITileVisual => ({
      tileData: { id, row: 0, col, color: TileColor.Red, special: SpecialType.None },
      x: col * 64, y: 0, alpha: 1, visible: true, zIndex: 0, rotation: 0,
      scale: { x: 1, y: 1, set(x, y = x) { this.x = x; this.y = y; } },
      graphic: { tint: 0xffffff }, updateTexture: vi.fn(),
    });
    const tiles = new Map([[1, tile(1, 0)], [2, tile(2, 1)]]);
    const board: IBoardViewAnimator = {
      tileSize: 64, boardPixelWidth: 128, boardPixelHeight: 64,
      gridToLocal: (row, col) => ({ x: col * 64, y: row * 64 }),
      getTileSprite: id => tiles.get(id), getTileSpritesMap: () => tiles,
      addTileSprite: data => { const visual = tile(data.id, data.col); tiles.set(data.id, visual); return visual; },
      removeTileSprite: id => { tiles.delete(id); }, screenShake: vi.fn(), syncSpritesWithBoard: vi.fn(),
      vfx: { createParticleBurst: vi.fn(), createLaserBeam: vi.fn(), createShockwave: vi.fn(),
        createFloatingText: vi.fn(), screenShake: vi.fn(), launchAirplane: async () => {} },
    };
    const speed = gsap.globalTimeline.timeScale();
    gsap.globalTimeline.timeScale(30);
    try {
      await new AnimationQueue(board).animateSwap(1, 2, { row: 0, col: 0 }, { row: 0, col: 1 });
      expect(tiles.get(1)).toMatchObject({ x: 64, tileData: { col: 1 } });
      expect(tiles.get(2)).toMatchObject({ x: 0, tileData: { col: 0 } });
    } finally { gsap.globalTimeline.timeScale(speed); }
  });
});

describe('session bank reconciliation', () => {
  it('only lowers banked moves, preserving base moves, objectives, score and phase', () => {
    const session = new GameSession();
    session.startLevel(1, 5);
    session.addPoints(100);
    const before = session.exportState(), updated = vi.fn();
    session.addListener({ onMovesUpdated: updated });
    session.reconcileBank(3);
    expect(session.exportState()).toEqual({ ...before, accumulatedMoves: 3, movesLeft: before.movesLeft - 2 });
    expect(updated).toHaveBeenCalledOnce();
    session.reconcileBank(10);
    expect(session.getAccumulatedMoves()).toBe(3);
    expect(updated).toHaveBeenCalledOnce();
  });

  it.each([-1, NaN, 1.5, Infinity])('rejects an invalid persisted balance: %s', balance => {
    const session = new GameSession(), before = session.exportState();
    expect(() => session.reconcileBank(balance)).toThrow(RangeError);
    expect(session.exportState()).toEqual(before);
  });
});
