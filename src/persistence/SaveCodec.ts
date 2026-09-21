import { BoardSnapshot } from '../core/Board.ts';
import { GameState, GameOverReason, SessionSaveState } from '../core/GameSession.ts';
import { LevelDifficulty } from '../core/LevelProgression.ts';
import { RandomSnapshot } from '../core/random/IRandomSource.ts';
import { SpecialType, TileColor } from '../core/TileTypes.ts';

export const SAVE_SCHEMA_VERSION = 3;
export const GAME_RULES_VERSION = 4;

export interface GameSave {
  schemaVersion: number;
  rulesVersion: number;
  savedAt: string;
  board: BoardSnapshot;
  session: SessionSaveState;
  random: RandomSnapshot;
}

export interface ISaveCodec {
  encode(save: GameSave): string;
  decode(raw: string): GameSave;
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

/** Legacy checkpoints retain their original score objective until the next level starts. */
const SCHEMA_MIGRATIONS: MigrationRegistry = new Map<number, SaveMigration>([[1, input => {
  const session = record(input.session), config = record(session.config);
  const target = integer(config.targetScore, 1), score = integer(session.score);
  return { ...input, schemaVersion: 2, session: { ...session,
    config: { ...config, objectives: [{ kind: 'score', target }] },
    objectiveProgress: [Math.min(score, target)] } };
}], [2, input => {
  const session = record(input.session);
  const total = integer(session.movesLeft), bank = integer(session.accumulatedMoves);
  return { ...input, schemaVersion: 3, session: { ...session,
    levelMovesLeft: Math.max(0, total - bank), accumulatedMoves: Math.min(bank, total) } };
}]]);
// Saved levels retain their original requirements; the next level uses current rules.
const RULES_MIGRATIONS: MigrationRegistry = new Map([
  [1, input => ({ ...input, rulesVersion: 2 })],
  [2, input => ({ ...input, rulesVersion: 3 })],
  [3, input => ({ ...input, rulesVersion: 4 })],
]);

/** Migrations are pure, sequential transforms. Missing upgrade paths preserve the original save. */
export class SaveCodec implements ISaveCodec {
  constructor(
    private readonly schemaMigrations: MigrationRegistry = SCHEMA_MIGRATIONS,
    private readonly rulesMigrations: MigrationRegistry = RULES_MIGRATIONS,
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
    const terrain = new Map<string, Record<string, unknown>>();
    if (board.cells !== undefined) {
      requireValue(Array.isArray(board.cells) && board.cells.length === rows * cols);
      for (const raw of board.cells as unknown[]) {
        const cell = record(raw), row = integer(cell.row, 0, rows - 1), col = integer(cell.col, 0, cols - 1);
        requireValue(typeof cell.playable === 'boolean' && typeof cell.exit === 'boolean');
        integer(cell.jelly, 0, 2); integer(cell.ice, 0, 3);
        requireValue(!terrain.has(`${row},${col}`));
        if (!cell.playable) requireValue(cell.jelly === 0 && cell.ice === 0 && cell.exit === false);
        terrain.set(`${row},${col}`, cell);
      }
      for (const cell of terrain.values()) if (cell.exit) {
        requireValue(terrain.get(`${Number(cell.row) + 1},${cell.col}`)?.playable !== true);
      }
    }
    const playable = terrain.size ? [...terrain.values()].filter(cell => cell.playable).length : rows * cols;
    requireValue(playable >= 9 && Array.isArray(board.tiles) && board.tiles.length === playable);
    const ids = new Set<number>(), cells = new Set<string>();
    for (const value of board.tiles as unknown[]) {
      const tile = record(value);
      const id = integer(tile.id, 1, nextId - 1);
      const row = integer(tile.row, 0, rows - 1), col = integer(tile.col, 0, cols - 1);
      integer(tile.color, TileColor.Red, TileColor.Orange);
      requireValue(Object.values(SpecialType).includes(tile.special as SpecialType));
      const cell = terrain.get(`${row},${col}`);
      requireValue(cell?.playable !== false);
      if (tile.kind !== undefined) {
        requireValue(['ingredient', 'crate', 'frosting', 'chocolate'].includes(String(tile.kind)));
        requireValue(tile.special === SpecialType.None && !(Number(cell?.ice ?? 0) > 0));
        if (tile.kind === 'ingredient') requireValue(tile.layers === undefined && [...terrain.values()].some(c => c.exit));
        else integer(tile.layers, 1, tile.kind === 'chocolate' ? 1 : 3);
      } else requireValue(tile.layers === undefined);
      requireValue(!ids.has(id) && !cells.has(row + ',' + col));
      ids.add(id); cells.add(row + ',' + col);
    }
    const session = record(data.session), config = record(session.config);
    integer(config.level, 1); integer(config.moves, 1); integer(config.targetScore, 1);
    const budget = integer(config.shuffles, 1);
    requireValue(Object.values(LevelDifficulty).includes(config.difficulty as LevelDifficulty));
    const score = integer(session.score), global = integer(session.globalScore);
    const moves = integer(session.movesLeft), bank = integer(session.accumulatedMoves);
    const levelMoves = integer(session.levelMovesLeft, 0, Number(config.moves));
    integer(session.shufflesLeft, 0, budget);
    requireValue(global >= score && moves === levelMoves + bank);
    requireValue([GameState.Ready, GameState.Victory, GameState.GameOver].includes(session.state as GameState));
    const objectives = config.objectives ?? [{ kind: 'score', target: config.targetScore }];
    requireValue(Array.isArray(objectives) && objectives.length > 0 && objectives.length <= 3);
    const progress = session.objectiveProgress;
    if (progress !== undefined) requireValue(Array.isArray(progress) && progress.length === (objectives as unknown[]).length);
    const completed: boolean[] = [];
    for (const [index, raw] of (objectives as unknown[]).entries()) {
      const objective = record(raw), target = integer(objective.target, 1);
      requireValue(['score', 'color', 'jelly', 'ingredient', 'blocker'].includes(String(objective.kind)));
      if (objective.kind === 'color') integer(objective.color, TileColor.Red, TileColor.Orange);
      if (objective.kind === 'blocker') requireValue(['ice', 'frosting', 'crate', 'chocolate'].includes(String(objective.blocker)));
      if (objective.kind !== 'score') requireValue(progress !== undefined);
      const current = objective.kind === 'score' ? Math.min(score, target) : integer((progress as unknown[])[index], 0, target);
      if (progress !== undefined) integer((progress as unknown[])[index], 0, target);
      completed.push(current >= target);
      if (objective.kind === 'jelly') requireValue(current + [...terrain.values()].reduce((sum, c) => sum + Number(c.jelly), 0) === target);
      if (objective.kind === 'ingredient') requireValue(current + (board.tiles as Record<string, unknown>[]).filter(t => t.kind === 'ingredient').length === target);
      if (objective.kind === 'blocker' && objective.blocker !== 'chocolate') {
        const remaining = objective.blocker === 'ice' ? [...terrain.values()].filter(c => Number(c.ice) > 0).length
          : (board.tiles as Record<string, unknown>[]).filter(t => t.kind === objective.blocker).length;
        requireValue(current + remaining === target);
      }
    }
    if (config.features !== undefined) this.validateFeatures(record(config.features), rows, cols);
    const targetMet = completed.every(Boolean);
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

  private validateFeatures(features: Record<string, unknown>, rows: number, cols: number): void {
    requireValue(['rectangle', 'notched', 'bridge', 'islands'].includes(String(features.shape)));
    for (const key of ['jelly', 'ice', 'blockers', 'ingredients']) {
      const values = features[key];
      requireValue(Array.isArray(values) && values.length <= rows * cols);
      const seen = new Set<string>();
      for (const raw of values as unknown[]) {
        const p = record(raw), row = integer(p.row, 0, rows - 1), col = integer(p.col, 0, cols - 1);
        requireValue(!seen.has(`${row},${col}`)); seen.add(`${row},${col}`);
        if (key === 'ice' || key === 'blockers') integer(p.layers, 1, 3);
        if (key === 'blockers') requireValue(['crate', 'frosting', 'chocolate'].includes(String(p.kind)));
      }
    }
  }
}
