import { BoardSnapshot } from '../core/Board.ts';
import { GameState, GameOverReason, SessionSaveState } from '../core/GameSession.ts';
import { LevelDifficulty } from '../core/LevelProgression.ts';
import { RandomSnapshot } from '../core/random/IRandomSource.ts';
import { SpecialType, TileColor } from '../core/TileTypes.ts';

export const SAVE_SCHEMA_VERSION = 1;
export const GAME_RULES_VERSION = 1;

export interface GameSave {
  schemaVersion: number;
  rulesVersion: number;
  savedAt: string;
  board: BoardSnapshot;
  session: SessionSaveState;
  random: RandomSnapshot;
}

export type SaveMigration = (input: Record<string, unknown>) => Record<string, unknown>;
export type MigrationRegistry = ReadonlyMap<number, SaveMigration>;

export class SaveError extends Error {
  constructor(public readonly kind: 'invalid' | 'newer' | 'incompatible', message: string) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SaveError('invalid', 'Expected an object.');
  }
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new SaveError('invalid', 'Invalid integer.');
  }
  return value;
}
function requireValue(condition: boolean): void {
  if (!condition) throw new SaveError('invalid', 'Invalid save state.');
}

/** Migrations are pure, sequential transforms. Missing upgrade paths preserve the original save. */
export class SaveCodec {
  constructor(
    private readonly schemaMigrations: MigrationRegistry = new Map(),
    private readonly rulesMigrations: MigrationRegistry = new Map(),
    private readonly schemaVersion = SAVE_SCHEMA_VERSION,
    private readonly rulesVersion = GAME_RULES_VERSION
  ) {}

  private migrate(input: Record<string, unknown>, field: 'schemaVersion' | 'rulesVersion',
    current: number, migrations: MigrationRegistry): Record<string, unknown> {
    let version = integer(input[field]);
    if (version > current) throw new SaveError('newer', 'This save requires a newer game.');
    while (version < current) {
      const migrate = migrations.get(version);
      if (!migrate) throw new SaveError('incompatible', 'No migration path for this save.');
      input = record(migrate(structuredClone(input)));
      requireValue(input[field] === version + 1);
      version++;
    }
    return input;
  }

  public decode(raw: string): GameSave {
    if (raw.length > 1_000_000) throw new SaveError('invalid', 'Save is too large.');
    let data: Record<string, unknown>;
    try { data = record(JSON.parse(raw)); }
    catch { throw new SaveError('invalid', 'Invalid save JSON.'); }
    data = this.migrate(data, 'schemaVersion', this.schemaVersion, this.schemaMigrations);
    data = this.migrate(data, 'rulesVersion', this.rulesVersion, this.rulesMigrations);
    this.validate(data);
    return structuredClone(data) as unknown as GameSave;
  }

  private validate(data: Record<string, unknown>): void {
    requireValue(typeof data.savedAt === 'string' && Number.isFinite(Date.parse(data.savedAt)));
    const board = record(data.board);
    const rows = integer(board.rows, 3, 32), cols = integer(board.cols, 3, 32);
    const nextId = integer(board.nextId, 1);
    requireValue(Array.isArray(board.tiles) && board.tiles.length === rows * cols);
    const ids = new Set<number>(), cells = new Set<string>();
    for (const value of board.tiles as unknown[]) {
      const tile = record(value);
      const id = integer(tile.id, 1, nextId - 1);
      const row = integer(tile.row, 0, rows - 1), col = integer(tile.col, 0, cols - 1);
      integer(tile.color, TileColor.Red, TileColor.Orange);
      requireValue(Object.values(SpecialType).includes(tile.special as SpecialType));
      requireValue(!ids.has(id) && !cells.has(row + ',' + col));
      ids.add(id); cells.add(row + ',' + col);
    }
    const session = record(data.session), config = record(session.config);
    integer(config.level, 1); integer(config.moves, 1); integer(config.targetScore, 1);
    const budget = integer(config.shuffles, 1);
    requireValue(Object.values(LevelDifficulty).includes(config.difficulty as LevelDifficulty));
    const score = integer(session.score), global = integer(session.globalScore);
    const moves = integer(session.movesLeft), bank = integer(session.accumulatedMoves);
    integer(session.shufflesLeft, 0, budget);
    requireValue(global >= score && moves <= Number(config.moves) + bank);
    requireValue([GameState.Ready, GameState.Victory, GameState.GameOver].includes(session.state as GameState));
    const targetMet = score >= Number(config.targetScore);
    if (session.state === GameState.GameOver) {
      requireValue(Object.values(GameOverReason).includes(session.reason as GameOverReason));
      requireValue(!targetMet);
      if (session.reason === GameOverReason.OutOfMoves) requireValue(moves === 0);
    } else {
      requireValue(session.reason === undefined);
      if (session.state === GameState.Victory) requireValue(targetMet);
      if (session.state === GameState.Ready) requireValue(moves > 0 || targetMet);
    }
    const random = record(data.random);
    requireValue(random.algorithm === 'mulberry32');
    integer(random.state, 0, 0xffffffff);
  }

  public encode(save: GameSave): string {
    const raw = JSON.stringify(save);
    this.decode(raw);
    return raw;
  }
}
