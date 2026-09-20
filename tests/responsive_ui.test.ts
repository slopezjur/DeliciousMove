import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateBoardLayout } from '../src/view/BoardLayout.ts';
import { BoardView } from '../src/view/BoardView.ts';
import { Board } from '../src/core/Board.ts';
import { SettingsView } from '../src/ui/SettingsView.ts';
import { HUDView } from '../src/ui/HUDView.ts';
import { LanguageService } from '../src/i18n/LanguageService.ts';
import { SoundManager } from '../src/audio/SoundManager.ts';

afterEach(() => vi.unstubAllGlobals());

describe('responsive board geometry', () => {
  it.each([[296, 296], [351, 351], [388, 388], [556, 556], [720, 720], [940, 940], [1040, 1040], [1800, 1800], [900, 300], [200, 140]])(
    'fits the frame and shadow inside a %s×%s region', (width, height) => {
      const layout = calculateBoardLayout(width, height, 8, 8);
      const { x, y, boardWidth, boardHeight, framePadding } = layout;
      expect(x - framePadding - 6).toBeGreaterThanOrEqual(0);
      expect(y - framePadding - 2).toBeGreaterThanOrEqual(0);
      expect(x + boardWidth + framePadding + 6).toBeLessThanOrEqual(width);
      expect(y + boardHeight + framePadding + 10).toBeLessThanOrEqual(height);
      expect(layout.tileSize).toBeLessThanOrEqual(124);
    },
  );

  it('grows beyond the old desktop cap without leaving an empty oversized canvas', () => {
    const regular = calculateBoardLayout(720, 720, 8, 8);
    const large = calculateBoardLayout(1040, 1040, 8, 8);
    expect(large.tileSize).toBeGreaterThan(regular.tileSize);
    expect(large.boardWidth / 1040).toBeGreaterThan(.94);
    expect(calculateBoardLayout(1800, 1800, 8, 8).tileSize).toBe(124);
  });

  it('fits rectangular boards by their actual row and column dimensions', () => {
    const layout = calculateBoardLayout(640, 320, 4, 12);
    expect(layout.tileSize).toBe(49);
    expect(layout.boardWidth).toBe(588);
    expect(layout.boardHeight).toBe(196);
  });

  it('keeps every cell addressable after phone, desktop, and landscape resizes', () => {
    const board = new Board(), view = new BoardView(board);
    try {
      for (const [width, height] of [[351, 351], [720, 720], [1040, 1040], [320, 280]]) {
        view.updateLayout(width, height);
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const local = view.gridToLocal(row, col);
            const global = view.toGlobal(local);
            const roundTrip = view.toLocal(global);
            expect(view.localToGrid(roundTrip.x, roundTrip.y)).toEqual({ row, col });
          }
        }
      }
    } finally { view.destroy({ children: true }); }
  });
});

describe('settings controls', () => {
  it('opens a native modal and leaves the top layer before other dialogs', () => {
    const handlers = new Map<string, (event?: unknown) => void>();
    const elements = new Map(['settings-dialog', 'settings-toggle-btn', 'settings-close-btn',
      'debug-toggle-btn', 'new-game-btn'].map(id => [id, {
      addEventListener: vi.fn((type, handler) => handlers.set(`${id}:${type}`, handler)),
      showModal: vi.fn(), close: vi.fn(),
      getBoundingClientRect: () => ({ left: 10, right: 200, top: 10, bottom: 300 }),
    }]));
    vi.stubGlobal('document', { getElementById: (id: string) => elements.get(id) ?? null });
    new SettingsView();
    const dialog = elements.get('settings-dialog')!;
    handlers.get('settings-toggle-btn:click')!();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    handlers.get('settings-dialog:click')!({ target: dialog, clientX: 40, clientY: 40 });
    expect(dialog.close).not.toHaveBeenCalled();
    handlers.get('settings-dialog:click')!({ target: dialog, clientX: 5, clientY: 40 });
    handlers.get('settings-close-btn:click')!();
    for (const id of ['debug-toggle-btn', 'new-game-btn']) {
      expect(elements.get(id)!.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), { capture: true });
      handlers.get(`${id}:click`)!();
    }
    expect(dialog.close).toHaveBeenCalledTimes(4);
  });

  it('keeps sound text and pressed state accurate across language changes', () => {
    let click = () => {};
    const button = { textContent: '', setAttribute: vi.fn(), addEventListener: (_: string, handler: () => void) => { click = handler; } };
    vi.stubGlobal('document', { getElementById: (id: string) => id === 'sound-toggle-btn' ? button : null });
    const language = new LanguageService();
    new HUDView(new SoundManager(), language);
    expect(button.textContent).toBe('On');
    click();
    expect(button.textContent).toBe('Off');
    expect(button.setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');
    language.toggle();
    expect(button.textContent).toBe('Silenciado');
    click();
    expect(button.textContent).toBe('Activado');
    expect(button.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
  });
});
