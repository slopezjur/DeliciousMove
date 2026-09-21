import { describe, it, expect, vi } from 'vitest';
import { GameSession, GameState } from '../src/core/GameSession.ts';
import { Objective, ObjectiveEvent, ObjectiveProgress } from '../src/core/BoardFeatures.ts';
import { RecordsStore, RECORDS_KEY } from '../src/persistence/RecordsStore.ts';
import { LanguageService } from '../src/i18n/LanguageService.ts';
import { LanguageControls } from '../src/i18n/LanguageControls.ts';
import { HUDView } from '../src/ui/HUDView.ts';
import { SoundManager } from '../src/audio/SoundManager.ts';
import { Board } from '../src/core/Board.ts';
import { BoardInitializer } from '../src/core/BoardInitializer.ts';
import { TileColor, SpecialType } from '../src/core/TileTypes.ts';
import { SeededRandomSource } from '../src/core/random/IRandomSource.ts';
import { AirplaneTargetSelector } from '../src/core/specials/AirplaneTargetSelector.ts';
import { SpecialRegistry } from '../src/core/specials/SpecialRegistry.ts';
import { BoardView } from '../src/view/BoardView.ts';
import { AirplaneFlightPresenter } from '../src/view/vfx/AirplaneFlightPresenter.ts';

function storage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: (key: string) => { data.delete(key); } };
}

describe('lifetime records', () => {
  it('ignores unfinished levels, preserves independent maxima and survives new runs', () => {
    const store = storage(), records = new RecordsStore(store), session = new GameSession();
    session.addPoints(4000);
    records.recordCompletedLevel(session.exportState());
    expect(store.setItem).not.toHaveBeenCalled();
    session.completeWithVictory(); records.recordCompletedLevel(session.exportState());
    expect(records.getSnapshot()).toEqual({ bestLevel: 1, bestScore: 4000 });
    session.restart();
    expect(new RecordsStore(store).getSnapshot()).toEqual(records.getSnapshot());
    const completed = session.exportState(); completed.state = GameState.Victory;
    completed.config.level = 10; completed.globalScore = 3000;
    records.recordCompletedLevel(completed);
    expect(records.getSnapshot()).toEqual({ bestLevel: 10, bestScore: 4000 });
    const staleTab = new RecordsStore(store);
    completed.config.level = 11; completed.globalScore = 9000; records.recordCompletedLevel(completed);
    completed.config.level = 2; completed.globalScore = 5000; staleTab.recordCompletedLevel(completed);
    expect(new RecordsStore(store).getSnapshot()).toEqual({ bestLevel: 11, bestScore: 9000 });
  });

  it.each(['bad json', '{"version":2,"bestLevel":9,"bestScore":99999}', '{"version":1,"bestLevel":-1,"bestScore":0}'])(
    'preserves unsupported records: %s', raw => {
      const store = storage(); store.data.set(RECORDS_KEY, raw);
      const records = new RecordsStore(store), session = new GameSession();
      session.addPoints(4000); session.completeWithVictory();
      records.recordCompletedLevel(session.exportState());
      expect(store.getItem(RECORDS_KEY)).toBe(raw);
      expect(records.status).toBe('preserved');
    });

  it('does not crash when storage is unavailable', () => {
    const records = new RecordsStore({ getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() {} });
    const session = new GameSession(); session.addPoints(4000); session.completeWithVictory();
    expect(() => records.recordCompletedLevel(session.exportState())).not.toThrow();
    expect(records.status).toBe('unavailable');
  });
});

describe('combined goals and bonus state', () => {
  const events: ObjectiveEvent[] = [{ kind: 'jelly', amount: 16 }];
  it.each(['score-first', 'objective-first'])('requires both conditions: %s', order => {
    const session = new GameSession(undefined, 3);
    const addScore = () => session.addPoints(session.getTargetScore());
    const addJelly = () => session.recordObjectiveEvents(events);
    (order === 'score-first' ? addScore : addJelly)();
    expect(session.isBonusPhase()).toBe(false);
    expect(session.completeWithVictory()).toBe(GameState.Ready);
    const before = session.getMovesLeft(); session.onMoveInitiated(); session.onTurnCompleted();
    expect(session.getMovesLeft()).toBe(before - 1);
    (order === 'score-first' ? addJelly : addScore)();
    expect(session.isBonusPhase()).toBe(true);
    session.onMoveInitiated(); session.onTurnCompleted();
    expect(session.getMovesLeft()).toBe(before - 1);
  });

  it('shows the bonus explanation only after every goal and clears it for the next level', () => {
    const makeElement = () => { const classes = new Set<string>(); return {
      textContent: '', style: {}, addEventListener: vi.fn(), classList: { add: (s: string) => classes.add(s), remove: (s: string) => classes.delete(s),
        toggle: (s: string, force: boolean) => force ? classes.add(s) : classes.delete(s), contains: (s: string) => classes.has(s) } }; };
    const banner = makeElement();
    vi.stubGlobal('document', { getElementById: (id: string) => id === 'bonus-phase-indicator' ? banner : null });
    const language = new LanguageService(), hud = new HUDView(language);
    const session = new GameSession(undefined, 3); hud.initLevel(session.getLevelConfig());
    session.addPoints(99999); hud.addScore(99999); hud.updateObjectives(session.getObjectives());
    expect(banner.classList.contains('hidden')).toBe(true);
    session.recordObjectiveEvents(events); hud.updateObjectives(session.getObjectives());
    expect(banner.classList.contains('hidden')).toBe(false);
    language.toggle(); expect(banner.classList.contains('hidden')).toBe(false);
    expect(language.t('bonusExplanation')).toContain('Sigue combinando');
    hud.initLevel(session.getLevelConfig()); expect(banner.classList.contains('hidden')).toBe(true);
  });
});

describe('selected language control', () => {
  it('renders the saved selection, applies explicit choices and follows the shortcut', () => {
    let change = (_: unknown) => {};
    const select = { value: '', addEventListener: (_: string, handler: typeof change) => { change = handler; } };
    vi.stubGlobal('document', { documentElement: { lang: '' }, querySelectorAll: () => [],
      getElementById: (id: string) => id === 'language-select' ? select : null });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const store = storage(), language = new LanguageService(store, 'es');
    new LanguageControls(language, () => {});
    expect(select.value).toBe('es');
    change({ target: { value: 'en' } }); expect(select.value).toBe('en');
    expect(new LanguageService(store, 'es').locale).toBe('en');
    language.toggle(); expect(select.value).toBe('es');
    change({ target: { value: 'invalid' } }); expect(select.value).toBe('es');
  });
});

describe('objective-aware airplane targeting', () => {
  it('uses the particle renderer color contract for airplane impacts', async () => {
    const board = new Board(), source = board.createTile(0, 0, TileColor.Yellow);
    source.special = SpecialType.Airplane;
    const view = new BoardView(board); view.initFromBoard();
    vi.spyOn(view.vfx, 'createShockwave').mockImplementation(() => {});
    const burst = vi.spyOn(view.vfx, 'createParticleBurst').mockImplementation((_x, _y, color) => {
      expect(color).toBe(TileColor.Blue);
    });
    vi.spyOn(view.vfx, 'launchAirplane').mockImplementation(async (_x, _y, _tx, _ty, impact) => { impact(); });
    try {
      await new AirplaneFlightPresenter().present({ sourceTile: source, effectType: SpecialType.Airplane,
        affectedTileIds: [source.id], targetTile: { row: 2, col: 2, id: 99 } },
      { boardView: view, position: view.gridToLocal(0, 0), sound: new SoundManager() });
      expect(burst).toHaveBeenCalledOnce();
    } finally { view.destroy({ children: true }); }
  });
  const goals: Objective[] = [{ kind: 'jelly', target: 1 }, { kind: 'blocker', blocker: 'ice', target: 1 },
    { kind: 'blocker', blocker: 'crate', target: 1 }, { kind: 'color', color: TileColor.Red, target: 1 },
    { kind: 'ingredient', target: 1 }];
  it.each(goals)('prefers helpful targets for $kind over unrelated specials', objective => {
    const board = new Board(), target = board.createTile(5, 5, TileColor.Red), special = board.createTile(7, 7, TileColor.Blue);
    special.special = SpecialType.Wrapped;
    if (objective.kind === 'jelly') board.getCell(5, 5)!.jelly = 1;
    if (objective.kind === 'blocker' && objective.blocker === 'ice') board.getCell(5, 5)!.ice = 2;
    if (objective.kind === 'blocker' && objective.blocker === 'crate') { target.kind = 'crate'; target.layers = 3; }
    if (objective.kind === 'ingredient') board.createTile(1, 5, TileColor.Red).kind = 'ingredient';
    const progress: ObjectiveProgress = { objective, current: 0 };
    const selector = new AirplaneTargetSelector(new SeededRandomSource(20), () => [progress]);
    expect(selector.pick(board, [target, special])).toBe(target);
    progress.current = objective.target;
    expect(selector.pick(board, [target, special])).toBe(special);
  });

  it('randomizes useful targets deterministically and does not assist cherries across gaps', () => {
    const board = new Board(), a = board.createTile(2, 1, TileColor.Red), b = board.createTile(2, 2, TileColor.Red);
    const goal: ObjectiveProgress = { objective: { kind: 'color', color: TileColor.Red, target: 20 }, current: 0 };
    const picks = () => { const selector = new AirplaneTargetSelector(new SeededRandomSource(123), () => [goal]);
      return Array.from({ length: 20 }, () => selector.pick(board, [a, b])!.id); };
    expect(picks()).toEqual(picks()); expect(new Set(picks()).size).toBe(2);
    board.createTile(0, 1, TileColor.Red).kind = 'ingredient'; board.getCell(1, 1)!.playable = false;
    b.special = SpecialType.Wrapped;
    const selector = new AirplaneTargetSelector(new SeededRandomSource(1), () => [{ objective: { kind: 'ingredient', target: 1 }, current: 0 }]);
    expect(selector.pick(board, [a, b])).toBe(b);
  });

  it.each([SpecialType.Airplane, SpecialType.StripedHorizontal, SpecialType.Wrapped])('shares useful targeting with plane + %s', partner => {
    const board = new Board(), random = new SeededRandomSource(5); new BoardInitializer(random).populate(board);
    const a = board.get(0, 0)!, b = board.get(0, 1)!; a.special = SpecialType.Airplane; b.special = partner;
    board.getCell(6, 6)!.jelly = 1;
    const registry = new SpecialRegistry(random, new AirplaneTargetSelector(random,
      () => [{ objective: { kind: 'jelly', target: 1 }, current: 0 }]));
    const result = registry.findComboHandler(a, b)!.execute(board, a, b, new Set());
    expect(result.effects[0].targetTile).toMatchObject({ row: 6, col: 6 });
    const ids = [result.effects[0].targetTile, ...(result.effects[0].secondaryTargets ?? [])].map(t => t!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
