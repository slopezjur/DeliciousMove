import { Board } from '../core/Board.ts';
import { GameOverReason, GameState, IGameSession } from '../core/GameSession.ts';
import { IRandomSource, isStatefulRandomSource } from '../core/random/IRandomSource.ts';
import { GameSave, GAME_RULES_VERSION, SAVE_SCHEMA_VERSION } from './SaveCodec.ts';
import { IPlayerResources } from './PlayerResources.ts';
import { IRecordsStore } from './RecordsStore.ts';
import { ISaveStore } from './SaveStore.ts';

/** Coordinates completed checkpoints with the separately persisted attempt ledger. */
export class RunProgress {
  readonly savedRun: GameSave | null;
  private checkpoint: string;
  private restoring = false;

  constructor(
    private readonly saves: ISaveStore,
    private readonly records: IRecordsStore,
    private readonly resources: IPlayerResources,
    private readonly now: () => number = Date.now
  ) {
    this.savedRun = saves.load();
    this.checkpoint = this.savedRun ? `${this.savedRun.savedAt}:${this.savedRun.session.config.level}` : 'new';
    if (this.savedRun) records.recordCompletedLevel(this.savedRun.session);
  }

  restore(board: Board, random: IRandomSource, session: Pick<IGameSession, 'restore'>): boolean {
    const save = this.savedRun;
    if (!save) return false;
    if (!isStatefulRandomSource(random) || save.board.rows !== board.rows || save.board.cols !== board.cols) {
      this.saves.suspend();
      return false;
    }
    board.restore(save.board);
    random.restore(save.random);
    session.restore(save.session);
    return true;
  }

  /** Presentation restoration runs before attempt reconciliation, as on an ordinary reload. */
  resume(session: IGameSession, initialLevel: number, restore: () => boolean): void {
    const attempt = this.resources.getAttempt(this.checkpoint);
    this.restoring = true;
    try {
      const restored = restore();
      const level = this.savedRun
        ? this.savedRun.session.config.level + (this.savedRun.session.state === GameState.Victory ? 1 : 0)
        : initialLevel;
      if (attempt && attempt.level === level) {
        if (restored && this.savedRun?.session.state !== GameState.Victory) session.reconcileBank(attempt.bank);
        else session.startLevel(attempt.level, attempt.bank);
        if (attempt.failed) session.failAttempt(attempt.failed);
        else if (session.getState() === GameState.Ready) session.onTurnCompleted();
      } else if (!restored) {
        if (initialLevel === 1) session.restart();
        else session.startLevel(initialLevel);
      }
    } finally { this.restoring = false; }
    if (session.getState() === GameState.Ready) this.beginAttempt(session);
  }

  beginAttempt(session: Pick<IGameSession, 'getLevel' | 'getAccumulatedMoves' | 'reconcileBank'>): void {
    if (this.restoring) return;
    const bank = this.resources.beginAttempt(this.checkpoint, session.getLevel(), session.getAccumulatedMoves());
    session.reconcileBank(bank);
  }

  recordBank(session: Pick<IGameSession, 'getLevel' | 'getAccumulatedMoves'>): void {
    if (!this.restoring) this.resources.spendBank(this.checkpoint, session.getLevel(), session.getAccumulatedMoves());
  }

  fail(session: Pick<IGameSession, 'getLevel' | 'getAccumulatedMoves'>, reason: GameOverReason): void {
    this.resources.fail(this.checkpoint, session.getLevel(), session.getAccumulatedMoves(), reason);
  }

  saveVictory(board: Board, random: IRandomSource, session: Pick<IGameSession, 'getState' | 'exportState'>): boolean {
    if (session.getState() !== GameState.Victory) return false;
    const state = session.exportState();
    this.records.recordCompletedLevel(state);
    if (!isStatefulRandomSource(random)) { this.saves.suspend(); return false; }
    const savedAt = new Date(this.now()).toISOString();
    const saved = this.saves.save({ schemaVersion: SAVE_SCHEMA_VERSION, rulesVersion: GAME_RULES_VERSION,
      savedAt, board: board.getSnapshot(), session: state, random: random.getSnapshot() });
    if (saved) {
      this.checkpoint = `${savedAt}:${state.config.level}`;
      this.resources.clearAttempt();
    }
    return saved;
  }

  beginNewRun(): void {
    this.saves.beginNewRun();
    this.checkpoint = 'new';
    this.resources.clearAttempt();
  }
}
