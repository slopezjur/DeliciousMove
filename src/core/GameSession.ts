import {
  ILevelProgression,
  InfiniteLevelProgression,
  LevelConfig,
  LevelDifficulty,
} from './LevelProgression.ts';
import { ObjectiveEvent, ObjectiveProgress } from './BoardFeatures.ts';
import { ObjectiveTracker } from './ObjectiveTracker.ts';

export enum GameState {
  Ready = 'ready',
  Resolving = 'resolving',
  Victory = 'victory',
  GameOver = 'game_over',
}

export enum GameOverReason {
  OutOfMoves = 'out_of_moves',
  Deadlock = 'deadlock',
}

/** Immutable view of the session handed to listeners on every state transition. */
export interface SessionSnapshot {
  levelMovesLeft?: number;
  objectives?: ObjectiveProgress[];
  level: number;
  score: number;
  targetScore: number;
  movesLeft: number;
  shufflesLeft: number;
  accumulatedMoves?: number;
  difficulty?: LevelDifficulty;
  reason?: GameOverReason;
  globalScore?: number;
  isBonusPhase?: boolean;
  isTargetReached?: boolean;
}

export interface GameSessionListener {
  onObjectivesUpdated?: (objectives: ObjectiveProgress[]) => void;
  onLevelStarted?: (config: LevelConfig) => void;
  onScoreUpdated?: (currentScore: number, added: number, globalScore: number, isBonusPhase: boolean) => void;
  onMovesUpdated?: (movesLeft: number, isFrozen?: boolean) => void;
  onShufflesUpdated?: (shufflesLeft: number) => void;
  onStateChanged?: (newState: GameState, snapshot: SessionSnapshot) => void;
}

export interface SessionSaveState {
  levelMovesLeft?: number;
  objectiveProgress?: number[];
  config: LevelConfig;
  score: number;
  globalScore: number;
  movesLeft: number;
  shufflesLeft: number;
  accumulatedMoves: number;
  state: GameState.Ready | GameState.Victory | GameState.GameOver;
  reason?: GameOverReason;
}

export interface IGameSession {
  getLevelMovesLeft(): number;
  reconcileBank(remainingBank: number): void;
  retryLevel(): void;
  failAttempt(reason: GameOverReason): GameState;
  recordObjectiveEvents(events: readonly ObjectiveEvent[]): void;
  getObjectives(): ObjectiveProgress[];
  exportState(): SessionSaveState;
  restore(saved: SessionSaveState): void;
  addListener(listener: GameSessionListener): () => void;
  restart(): void;
  advanceLevel(): void;
  startLevel(level: number, carriedMoves?: number): void;
  getLevelConfig(): LevelConfig;
  getLevel(): number;
  getScore(): number;
  getGlobalScore(): number;
  getMovesLeft(): number;
  getShufflesLeft(): number;
  getAccumulatedMoves(): number;
  getTargetScore(): number;
  isTargetReached(): boolean;
  isBonusPhase(): boolean;
  completeWithVictory(): GameState;
  getState(): GameState;
  getGameOverReason(): GameOverReason | undefined;
  getSnapshot(): SessionSnapshot;
  canMakeMove(): boolean;
  onMoveInitiated(): void;
  addPoints(points: number): void;
  consumeShuffle(): boolean;
  endWithDeadlock(): GameState;
  onTurnCompleted(): GameState;
}

export class GameSession implements IGameSession {
  private readonly progression: ILevelProgression;

  private config: LevelConfig;
  private objectives: ObjectiveTracker;
  private currentScore: number = 0;
  private globalScore: number = 0;
  private movesLeft: number;
  private levelMovesLeft: number;
  private shufflesLeft: number;
  private accumulatedMoves: number = 0;
  private state: GameState = GameState.Ready;
  private gameOverReason?: GameOverReason;
  private listeners: GameSessionListener[] = [];

  constructor(progression: ILevelProgression = new InfiniteLevelProgression(), startLevel = 1) {
    this.progression = progression;
    this.config = this.progression.getConfig(startLevel);
    this.objectives = this.createObjectives();
    this.movesLeft = this.config.moves;
    this.levelMovesLeft = this.config.moves;
    this.shufflesLeft = this.config.shuffles;
  }

  public exportState(): SessionSaveState {
    if (this.state === GameState.Resolving) throw new Error('Cannot save an unfinished turn.');
    return {
      objectiveProgress: this.getObjectives().map(p => p.current),
      config: { ...this.config }, score: this.currentScore, globalScore: this.globalScore,
      levelMovesLeft: this.levelMovesLeft,
      movesLeft: this.movesLeft, shufflesLeft: this.shufflesLeft,
      accumulatedMoves: this.accumulatedMoves, state: this.state, reason: this.gameOverReason,
    };
  }

  /** Restore silently; the application rebuilds presentation without starting a new level. */
  public restore(saved: SessionSaveState): void {
    this.config = { ...saved.config };
    this.objectives = this.createObjectives(saved.objectiveProgress);
    this.currentScore = saved.score;
    this.globalScore = saved.globalScore;
    this.movesLeft = saved.movesLeft;
    this.shufflesLeft = saved.shufflesLeft;
    this.accumulatedMoves = saved.accumulatedMoves;
    this.levelMovesLeft = saved.levelMovesLeft ?? Math.max(0, saved.movesLeft - saved.accumulatedMoves);
    this.state = saved.state;
    this.gameOverReason = saved.reason;
  }

  public addListener(listener: GameSessionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Restarts the run from level 1 and resets banked moves & global score. */
  public restart(): void {
    this.globalScore = 0;
    this.accumulatedMoves = 0;
    this.startLevel(1, 0);
  }

  /** Moves on to the next level, carrying over unused moves. */
  public advanceLevel(): void {
    const surplusMoves = Math.max(0, this.movesLeft);
    this.startLevel(this.config.level + 1, surplusMoves);
  }

  public startLevel(level: number, carriedMoves: number = 0): void {
    this.config = this.progression.getConfig(level);
    this.objectives = this.createObjectives();
    this.currentScore = 0;
    this.accumulatedMoves = carriedMoves;
    this.movesLeft = this.config.moves + carriedMoves;
    this.levelMovesLeft = this.config.moves;
    this.shufflesLeft = this.config.shuffles;
    this.gameOverReason = undefined;
    this.setState(GameState.Ready);

    this.listeners.forEach((l) => l.onLevelStarted?.(this.config));
    this.notifyScore(0);
    this.notifyMoves();
    this.notifyShuffles();
    this.notifyObjectives();
  }

  private createObjectives(restored?: readonly number[]): ObjectiveTracker {
    return new ObjectiveTracker(this.config.objectives ?? [{ kind: 'score', target: this.config.targetScore }], restored);
  }
  public getObjectives(): ObjectiveProgress[] { return this.objectives.snapshot(this.currentScore); }
  public recordObjectiveEvents(events: readonly ObjectiveEvent[]): void {
    this.objectives.record(events);
    this.notifyObjectives();
    this.notifyMoves();
  }
  private notifyObjectives(): void {
    const progress = this.getObjectives();
    this.listeners.forEach(listener => listener.onObjectivesUpdated?.(progress));
  }

  public getLevelConfig(): LevelConfig {
    return this.config;
  }

  public getLevel(): number {
    return this.config.level;
  }

  public getScore(): number {
    return this.currentScore;
  }

  public getGlobalScore(): number {
    return this.globalScore;
  }

  public getMovesLeft(): number {
    return this.movesLeft;
  }

  public getShufflesLeft(): number {
    return this.shufflesLeft;
  }

  public getAccumulatedMoves(): number {
    return this.accumulatedMoves;
  }

  public getLevelMovesLeft(): number { return this.levelMovesLeft; }

  /** Reconcile persisted spending without ever granting moves or changing base moves. */
  public reconcileBank(remainingBank: number): void {
    if (!Number.isSafeInteger(remainingBank) || remainingBank < 0) throw new RangeError('Invalid bank balance.');
    const bank = Math.min(this.accumulatedMoves, remainingBank);
    if (bank === this.accumulatedMoves) return;
    this.accumulatedMoves = bank;
    this.movesLeft = this.levelMovesLeft + bank;
    this.notifyMoves();
  }

  /** Failed-attempt points never inflate the run score; spent bank moves stay spent. */
  public retryLevel(): void {
    if (this.state !== GameState.GameOver) return;
    this.globalScore -= this.currentScore;
    this.startLevel(this.config.level, this.accumulatedMoves);
  }

  public failAttempt(reason: GameOverReason): GameState {
    if (this.state === GameState.GameOver || this.state === GameState.Victory) return this.state;
    this.gameOverReason = reason;
    this.setState(GameState.GameOver);
    return this.state;
  }

  public getTargetScore(): number {
    return this.config.targetScore;
  }

  public isTargetReached(): boolean {
    return this.objectives.complete(this.currentScore);
  }

  public isBonusPhase(): boolean {
    return this.isTargetReached() && this.state !== GameState.GameOver && this.state !== GameState.Victory;
  }

  public completeWithVictory(): GameState {
    if (!this.isTargetReached() || this.state === GameState.GameOver) return this.state;
    this.setState(GameState.Victory);
    return this.state;
  }

  public getState(): GameState {
    return this.state;
  }

  public getGameOverReason(): GameOverReason | undefined {
    return this.gameOverReason;
  }

  public getSnapshot(): SessionSnapshot {
    return {
      objectives: this.getObjectives(),
      level: this.config.level,
      score: this.currentScore,
      targetScore: this.config.targetScore,
      movesLeft: this.movesLeft,
      shufflesLeft: this.shufflesLeft,
      accumulatedMoves: this.accumulatedMoves,
      levelMovesLeft: this.levelMovesLeft,
      difficulty: this.config.difficulty,
      reason: this.gameOverReason,
      globalScore: this.globalScore,
      isBonusPhase: this.isBonusPhase(),
      isTargetReached: this.isTargetReached(),
    };
  }

  public canMakeMove(): boolean {
    return this.state === GameState.Ready && (this.movesLeft > 0 || this.isTargetReached());
  }

  public onMoveInitiated(): void {
    if (!this.canMakeMove()) return;
    // Moves are frozen once the minimum target is achieved so surplus moves are banked for next levels
    if (!this.isTargetReached()) {
      this.movesLeft--;
      if (this.levelMovesLeft > 0) this.levelMovesLeft--;
      else this.accumulatedMoves--;
      this.notifyMoves();
    }
    this.setState(GameState.Resolving);
  }

  public addPoints(points: number): void {
    if (points <= 0) return;
    this.currentScore += points;
    this.globalScore += points;
    this.notifyScore(points);
    this.notifyObjectives();
  }

  /**
   * Spends one rescue shuffle. Returns false when the budget for this level is exhausted,
   * which is the only way a deadlock becomes fatal.
   */
  public consumeShuffle(): boolean {
    if (this.shufflesLeft <= 0) return false;
    this.shufflesLeft--;
    this.notifyShuffles();
    return true;
  }

  /** Ends the attempt because the board has no valid moves and no rescue left. */
  public endWithDeadlock(): GameState {
    this.gameOverReason = GameOverReason.Deadlock;
    this.setState(GameState.GameOver);
    return this.state;
  }

  public onTurnCompleted(): GameState {
    if (this.state === GameState.GameOver || this.state === GameState.Victory) return this.state;

    if (this.isTargetReached()) {
      // Reaching the minimum target unlocks the bonus overtime phase; we remain ready until 0 possible moves remain
      this.setState(GameState.Ready);
    } else if (this.movesLeft <= 0) {
      this.gameOverReason = GameOverReason.OutOfMoves;
      this.setState(GameState.GameOver);
    } else {
      this.setState(GameState.Ready);
    }
    return this.state;
  }

  private setState(newState: GameState): void {
    this.state = newState;
    const snapshot = this.getSnapshot();
    this.listeners.forEach((l) => l.onStateChanged?.(newState, snapshot));
  }

  private notifyScore(added: number): void {
    this.listeners.forEach((l) =>
      l.onScoreUpdated?.(this.currentScore, added, this.globalScore, this.isBonusPhase())
    );
  }

  private notifyMoves(): void {
    const isFrozen = this.isTargetReached();
    this.listeners.forEach((l) => {
      if (isFrozen) {
        l.onMovesUpdated?.(this.movesLeft, true);
      } else {
        l.onMovesUpdated?.(this.movesLeft);
      }
    });
  }

  private notifyShuffles(): void {
    this.listeners.forEach((l) => l.onShufflesUpdated?.(this.shufflesLeft));
  }
}
