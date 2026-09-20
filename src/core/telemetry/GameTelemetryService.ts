import { Board } from '../Board.ts';
import { IGameSession } from '../GameSession.ts';
import { IDeadlockResolver } from '../ShuffleEngine.ts';
import { Position, SpecialType, TileColor } from '../TileTypes.ts';
import {
  IGameTelemetryService,
  TelemetryActionType,
  TelemetryMoveRecord,
  TelemetryStateSnapshot,
  TurnReplayDetails,
} from './IGameTelemetry.ts';

const MAX_HISTORY_SIZE = 25;

export interface GameTelemetryDependencies {
  board: Board;
  session: IGameSession;
  deadlockResolver: IDeadlockResolver;
  isInputLocked: () => boolean;
}

export class GameTelemetryService implements IGameTelemetryService {
  private readonly deps: GameTelemetryDependencies;
  private readonly history: TelemetryMoveRecord[] = [];
  private sequenceCounter = 0;
  private lastTurn?: TurnReplayDetails;

  constructor(deps: GameTelemetryDependencies) {
    this.deps = deps;
  }

  public recordTurnDetails(details: TurnReplayDetails): void {
    this.lastTurn = structuredClone(details);
  }

  public recordSwap(
    from: Position,
    to: Position,
    valid: boolean,
    scoreGained: number,
    stepsCount: number,
    specialsFormed: string[] = [],
    specialsTriggered: string[] = []
  ): void {
    const replay = valid && this.lastTurn?.from.row === from.row && this.lastTurn?.from.col === from.col
      && this.lastTurn.to?.row === to.row && this.lastTurn.to?.col === to.col ? this.lastTurn : undefined;
    const tileFrom = replay?.boardBefore.tiles.find((tile) => tile.row === from.row && tile.col === from.col)
      ?? this.deps.board.get(from.row, from.col);
    this.pushRecord({
      id: ++this.sequenceCounter,
      timestamp: new Date().toISOString().substring(11, 23),
      action: 'swap',
      from: { ...from },
      to: { ...to },
      tileColor: tileFrom?.color,
      specialType: tileFrom?.special,
      valid,
      scoreGained,
      cascadeStepsCount: stepsCount,
      specialsFormed,
      specialsTriggered,
    });
  }

  public recordActivation(
    pos: Position,
    specialType: SpecialType,
    scoreGained: number,
    stepsCount: number,
    specialsTriggered: string[] = []
  ): void {
    this.pushRecord({
      id: ++this.sequenceCounter,
      timestamp: new Date().toISOString().substring(11, 23),
      action: 'activate',
      from: { ...pos },
      specialType,
      valid: true,
      scoreGained,
      cascadeStepsCount: stepsCount,
      specialsFormed: [],
      specialsTriggered,
    });
  }

  public recordShuffle(reason: string, success: boolean): void {
    this.pushRecord({
      id: ++this.sequenceCounter,
      timestamp: new Date().toISOString().substring(11, 23),
      action: 'shuffle',
      valid: success,
      scoreGained: 0,
      cascadeStepsCount: 0,
      specialsFormed: [],
      specialsTriggered: [],
      notes: reason,
    });
  }

  public recordStateTransition(action: TelemetryActionType, notes?: string): void {
    if (action === 'level_start') this.lastTurn = undefined;
    this.pushRecord({
      id: ++this.sequenceCounter,
      timestamp: new Date().toISOString().substring(11, 23),
      action,
      valid: true,
      scoreGained: 0,
      cascadeStepsCount: 0,
      specialsFormed: [],
      specialsTriggered: [],
      notes,
    });
  }

  public getRecentMoves(count: number = 10): TelemetryMoveRecord[] {
    return this.history.slice(-count);
  }

  public getSnapshot(): TelemetryStateSnapshot {
    const { board, session, deadlockResolver, isInputLocked } = this.deps;
    const config = session.getLevelConfig();

    const specialsOnBoard: Record<string, number> = {};
    const blockersOnBoard: Record<string, number> = {};
    board.forEachTile((t) => {
      if (t.kind) blockersOnBoard[t.kind] = (blockersOnBoard[t.kind] ?? 0) + 1;
      if ((board.getCell(t.row, t.col)?.ice ?? 0) > 0) blockersOnBoard.ice = (blockersOnBoard.ice ?? 0) + 1;
      if (t.special !== SpecialType.None) {
        specialsOnBoard[t.special] = (specialsOnBoard[t.special] || 0) + 1;
      }
    });

    let possibleMovesCount = 0;
    try {
      possibleMovesCount = deadlockResolver.findPossibleMoves(board).length;
    } catch {
      possibleMovesCount = -1;
    }

    return {
      timestamp: new Date().toISOString(),
      board: board.getSnapshot(), objectives: session.getObjectives?.(), blockersOnBoard,
      lastTurn: this.lastTurn ? structuredClone(this.lastTurn) : undefined,
      level: session.getLevel(),
      difficulty: config.difficulty,
      state: session.getState(),
      isInputLocked: isInputLocked(),
      score: session.getScore(),
      targetScore: session.getTargetScore(),
      movesLeft: session.getMovesLeft(),
      accumulatedBonusMoves: session.getAccumulatedMoves(),
      shufflesLeft: session.getShufflesLeft(),
      possibleMovesCount,
      specialsOnBoard,
      boardAscii: this.buildBoardAscii(board),
      recentMoves: this.getRecentMoves(15),
    };
  }

  public exportDiagnosticJson(): string {
    return JSON.stringify(this.getSnapshot(), null, 2);
  }

  private pushRecord(record: TelemetryMoveRecord): void {
    this.history.push(record);
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history.shift();
    }
  }

  private buildBoardAscii(board: Board): string {
    const COLOR_LETTERS: Record<number, string> = {
      [TileColor.Red]: 'R',
      [TileColor.Blue]: 'B',
      [TileColor.Green]: 'G',
      [TileColor.Yellow]: 'Y',
      [TileColor.Purple]: 'P',
      [TileColor.Orange]: 'O',
    };

    const rows: string[] = [];
    for (let r = 0; r < board.rows; r++) {
      const cells: string[] = [];
      for (let c = 0; c < board.cols; c++) {
        if (!board.isValidPosition(r, c)) { cells.push('###'); continue; }
        const t = board.get(r, c);
        if (!t) {
          cells.push(' . ');
          continue;
        }
        const colInitial = t.kind ? { ingredient: 'C', frosting: 'F', crate: 'K', chocolate: 'H' }[t.kind]
          : t.special === SpecialType.Rock ? 'X' : COLOR_LETTERS[t.color] || '?';
        let specChar = ' ';
        if (t.special === SpecialType.StripedHorizontal) specChar = '-';
        else if (t.special === SpecialType.StripedVertical) specChar = '|';
        else if (t.special === SpecialType.Wrapped) specChar = '*';
        else if (t.special === SpecialType.ColorBomb) specChar = '@';
        else if (t.special === SpecialType.Airplane) specChar = '^';
        const cell = board.getCell(r, c)!;
        cells.push(`${colInitial}${specChar}${cell.ice ? 'I' : cell.jelly ? '~' : cell.exit ? 'v' : ' '}`);
      }
      rows.push(`R${r}: | ${cells.join('')}|`);
    }
    return rows.join('\n');
  }
}
