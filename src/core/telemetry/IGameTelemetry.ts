import { Position, SpecialType, TileColor, CascadeStep } from '../TileTypes.ts';
import { GameState, SessionSnapshot } from '../GameSession.ts';
import { LevelDifficulty } from '../LevelProgression.ts';

export type TelemetryActionType =
  | 'swap'
  | 'activate'
  | 'last_chance'
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

export interface TurnReplayDetails {
  activationContext?: 'last_chance';
  boardBefore: import('../Board.ts').BoardSnapshot;
  boardAfter: import('../Board.ts').BoardSnapshot;
  sessionBefore: SessionSnapshot;
  randomBefore?: import('../random/IRandomSource.ts').RandomSnapshot;
  from: Position;
  to?: Position;
  steps: CascadeStep[];
}

export interface TelemetryStateSnapshot {
  board?: import('../Board.ts').BoardSnapshot;
  objectives?: import('../BoardFeatures.ts').ObjectiveProgress[];
  blockersOnBoard?: Record<string, number>;
  lastTurn?: TurnReplayDetails;
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
  recordTurnDetails?(details: TurnReplayDetails): void;
  recordSwap(from: Position, to: Position, valid: boolean, scoreGained: number, stepsCount: number, specialsFormed?: string[], specialsTriggered?: string[]): void;
  recordActivation(pos: Position, specialType: SpecialType, scoreGained: number, stepsCount: number, specialsTriggered?: string[], context?: 'player' | 'last_chance'): void;
  recordShuffle(reason: string, success: boolean): void;
  recordStateTransition(action: TelemetryActionType, notes?: string): void;
  getRecentMoves(count?: number): TelemetryMoveRecord[];
  getSnapshot(): TelemetryStateSnapshot;
  exportDiagnosticJson(): string;
}

export type IGameTelemetryReader = Pick<IGameTelemetryService,
  'getRecentMoves' | 'getSnapshot' | 'exportDiagnosticJson'>;
