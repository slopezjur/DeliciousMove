import {
  ILevelProgression,
  InfiniteLevelProgression,
  LevelConfig,
} from './LevelProgression.ts';

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
  level: number;
  score: number;
  targetScore: number;
  movesLeft: number;
  shufflesLeft: number;
  reason?: GameOverReason;
}

export interface GameSessionListener {
  onLevelStarted?: (config: LevelConfig) => void;
  onScoreUpdated?: (currentScore: number, added: number) => void;
  onMovesUpdated?: (movesLeft: number) => void;
  onShufflesUpdated?: (shufflesLeft: number) => void;
  onStateChanged?: (newState: GameState, snapshot: SessionSnapshot) => void;
}

export class GameSession {
  private readonly progression: ILevelProgression;

  private config: LevelConfig;
  private currentScore: number = 0;
  private movesLeft: number;
  private shufflesLeft: number;
  private state: GameState = GameState.Ready;
  private gameOverReason?: GameOverReason;
  private listeners: GameSessionListener[] = [];

  constructor(progression: ILevelProgression = new InfiniteLevelProgression(), startLevel = 1) {
    this.progression = progression;
    this.config = this.progression.getConfig(startLevel);
    this.movesLeft = this.config.moves;
    this.shufflesLeft = this.config.shuffles;
  }

  public addListener(listener: GameSessionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Restarts the run from level 1. */
  public restart(): void {
    this.startLevel(1);
  }

  /** Moves on to the next level of the endless ladder. */
  public advanceLevel(): void {
    this.startLevel(this.config.level + 1);
  }

  public startLevel(level: number): void {
    this.config = this.progression.getConfig(level);
    this.currentScore = 0;
    this.movesLeft = this.config.moves;
    this.shufflesLeft = this.config.shuffles;
    this.gameOverReason = undefined;
    this.setState(GameState.Ready);

    this.listeners.forEach((l) => l.onLevelStarted?.(this.config));
    this.notifyScore(0);
    this.notifyMoves();
    this.notifyShuffles();
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

  public getMovesLeft(): number {
    return this.movesLeft;
  }

  public getShufflesLeft(): number {
    return this.shufflesLeft;
  }

  public getTargetScore(): number {
    return this.config.targetScore;
  }

  public getState(): GameState {
    return this.state;
  }

  public getGameOverReason(): GameOverReason | undefined {
    return this.gameOverReason;
  }

  public getSnapshot(): SessionSnapshot {
    return {
      level: this.config.level,
      score: this.currentScore,
      targetScore: this.config.targetScore,
      movesLeft: this.movesLeft,
      shufflesLeft: this.shufflesLeft,
      reason: this.gameOverReason,
    };
  }

  public canMakeMove(): boolean {
    return this.state === GameState.Ready && this.movesLeft > 0;
  }

  public onMoveInitiated(): void {
    if (!this.canMakeMove()) return;
    this.movesLeft--;
    this.setState(GameState.Resolving);
    this.notifyMoves();
  }

  public addPoints(points: number): void {
    if (points <= 0) return;
    this.currentScore += points;
    this.notifyScore(points);
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

  /** Ends the run because the board has no valid moves and no rescue left. */
  public endWithDeadlock(): GameState {
    this.gameOverReason = GameOverReason.Deadlock;
    this.setState(GameState.GameOver);
    return this.state;
  }

  public onTurnCompleted(): GameState {
    if (this.state === GameState.GameOver) return this.state;

    if (this.currentScore >= this.config.targetScore) {
      this.setState(GameState.Victory);
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
    this.listeners.forEach((l) => l.onScoreUpdated?.(this.currentScore, added));
  }

  private notifyMoves(): void {
    this.listeners.forEach((l) => l.onMovesUpdated?.(this.movesLeft));
  }

  private notifyShuffles(): void {
    this.listeners.forEach((l) => l.onShufflesUpdated?.(this.shufflesLeft));
  }
}
