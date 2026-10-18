import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../src/core/GameSession.ts';
import { LanguageService } from '../src/i18n/LanguageService.ts';
import { GAME_RULES_VERSION } from '../src/persistence/SaveCodec.ts';
import { PlayModesView } from '../src/ui/PlayModesView.ts';

interface ElementDouble {
  textContent: string;
  hidden: boolean;
  childNodes: ElementDouble[];
  onclick?: () => void | Promise<void>;
  append(...children: ElementDouble[]): void;
  replaceChildren(...children: ElementDouble[]): void;
}
function node(): ElementDouble {
  return { textContent: '', hidden: false, childNodes: [],
    append(...children) { this.childNodes.push(...children); },
    replaceChildren(...children) { this.childNodes = children; } };
}
function elements(root: ElementDouble): ElementDouble[] {
  return [root, ...root.childNodes.flatMap(elements)];
}
function environment() {
  const root = node(), moves = node(); moves.textContent = 'HUD-owned';
  vi.stubGlobal('document', { createElement: () => node(), getElementById: (id: string) =>
    id === 'feature-status' ? root : id === 'moves-value' ? moves : null });
  vi.stubGlobal('window', { location: { href: 'http://127.0.0.1:3000/' } });
  const reader = { snapshot: () => ({ version: 1 as const, theme: 'classic' as const, combos: [],
    tripleDelivery: false, bankless: false, daily: { [`2026-10-18:${GAME_RULES_VERSION}`]: { score: 9000, moves: 20 } } }) };
  return { root, moves, reader, language: new LanguageService(), session: new GameSession() };
}
afterEach(() => vi.unstubAllGlobals());

describe('mode view boundaries', () => {
  it.each([false, true])('shares through an injected clipboard and read-only collection provider (copied=%s)', async copied => {
    const env = environment(), clipboard = { copyText: vi.fn(async () => copied) };
    const view = new PlayModesView(env.language, { kind: 'daily', day: '2026-10-18', seed: 1 }, env.reader, vi.fn(), clipboard);
    view.update(env.session.getSnapshot(), env.session.getLevelConfig(), { lessonDone: false });
    const share = elements(env.root).find(element => element.textContent === env.language.t('shareResult'))!;
    await share.onclick!();
    expect(clipboard.copyText).toHaveBeenCalledWith(expect.stringContaining('mode=daily'));
    expect(clipboard.copyText).toHaveBeenCalledWith(expect.stringContaining('9000'));
    expect(elements(env.root).some(element => element.textContent.includes(env.language.t(copied ? 'shareCopied' : 'shareFailed')))).toBe(true);
  });

  it('renders projected lesson status without accessing or replacing the HUD moves counter', () => {
    const env = environment(), view = new PlayModesView(env.language, { kind: 'lab', lesson: 'four', seed: 1 }, env.reader, vi.fn());
    view.update(env.session.getSnapshot(), env.session.getLevelConfig(), { lessonDone: true });
    expect(elements(env.root).some(element => element.textContent === env.language.t('labSuccess'))).toBe(true);
    expect(env.moves.textContent).toBe('HUD-owned');
  });
});
