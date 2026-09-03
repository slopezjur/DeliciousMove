import { Position, SpecialType, TileColor } from '../TileTypes.ts';
import { GameState } from '../GameSession.ts';
import { LevelDifficulty } from '../LevelProgression.ts';

export type TelemetryActionType =
  | 'swap'
  | 'activate'
  | 'shuffle'
  | 'level_start'
  | 'victory'
  | 'game_over';

export interface TelemetryMoveRecord {
  id: number;
  timestamp: string;
  action: TelemetryActionType;
  from?: Position;
  to?: Position;
  specialType?: SpecialType;
  tileColor?: TileColor;
  valid: boolean;
  scoreGained: number;
  cascadeStepsCount: number;
  specialsFormed: string[];
  specialsTriggered: string[];
  notes?: string;
}

export interface TelemetryStateSnapshot {
  timestamp: string;
  level: number;
  difficulty: LevelDifficulty;
  state: GameState;
  isInputLocked: boolean;
  score: number;
  targetScore: number;
  movesLeft: number;
  accumulatedBonusMoves: number;
  shufflesLeft: number;
  possibleMovesCount: number;
  specialsOnBoard: Record<string, number>;
  boardAscii: string;
  recentMoves: TelemetryMoveRecord[];
}

export interface IGameTelemetryService {
  recordSwap(from: Position, to: Position, valid: boolean, scoreGained: number, stepsCount: number, specialsFormed?: string[], specialsTriggered?: string[]): void;
  recordActivation(pos: Position, specialType: SpecialType, scoreGained: number, stepsCount: number, specialsTriggered?: string[]): void;
  recordShuffle(reason: string, success: boolean): void;
  recordStateTransition(action: TelemetryActionType, notes?: string): void;
  getRecentMoves(count?: number): TelemetryMoveRecord[];
  getSnapshot(): TelemetryStateSnapshot;
  exportDiagnosticJson(): string;
}
