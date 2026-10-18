import { Board } from './Board.ts';
import { isBlocker, type CellState } from './BoardFeatures.ts';
import { CascadeStep, Position } from './TileTypes.ts';

export interface BossDefinition { weakSpots: Position[]; period: number }
export interface BoardMechanicsState { turns: number; boss?: BossDefinition; stripeUsed?: boolean }

export interface IBoardMechanicsResolver {
  advance(board: Board): CascadeStep | null;
  refresh(board: Board): CellState[] | undefined;
}

/** Replaceable mechanics policy shared by level setup and cascade resolution. */
export class BoardMechanicsResolver implements IBoardMechanicsResolver {
  advance(board: Board): CascadeStep | null { return advanceMechanics(board); }
  refresh(board: Board): CellState[] | undefined {
    updateBossShields(board);
    return board.mechanics?.boss ? board.getCells() : undefined;
  }
}

const key = (p: Position) => `${p.row},${p.col}`;

/** Directed gravity paths join portal entrances to the top of another segment. */
export function gravityPaths(board: Board): Position[][] {
  const cells = board.getCells().filter(p => !board.isGravityBarrier(p.row, p.col));
  const next = new Map<string, Position>(), incoming = new Set<string>();
  for (const cell of cells) {
    const target = cell.portalTo ?? { row: cell.row + 1, col: cell.col };
    if (!board.isGravityBarrier(target.row, target.col)) {
      next.set(key(cell), target);
      incoming.add(key(target));
    }
  }
  const visited = new Set<string>(), paths: Position[][] = [];
  const visit = (start: Position) => {
    const path: Position[] = [];
    let cell: Position | undefined = start;
    while (cell && !visited.has(key(cell))) {
      visited.add(key(cell)); path.push(cell); cell = next.get(key(cell));
    }
    if (path.length) paths.push(path);
  };
  cells.filter(p => !incoming.has(key(p))).forEach(visit);
  cells.filter(p => !visited.has(key(p))).forEach(visit);
  return paths;
}

/** Belts move simultaneously once per player turn; a locked belt waits intact. */
export function advanceMechanics(board: Board): CascadeStep | null {
  const transports: NonNullable<CascadeStep['transports']> = [];
  const seen = new Set<string>();
  for (const start of board.getCells()) {
    if (!start.conveyorTo || seen.has(key(start))) continue;
    const cycle: Position[] = [];
    let cell = board.getCell(start.row, start.col);
    while (cell?.conveyorTo && !seen.has(key(cell))) {
      seen.add(key(cell)); cycle.push(cell); cell = board.getCell(cell.conveyorTo.row, cell.conveyorTo.col);
    }
    if (!cell || key(cell) !== key(start) || cycle.some(p => !board.canSwap(p))) continue;
    const tiles = cycle.map(p => board.get(p.row, p.col)!);
    cycle.forEach(p => board.set(p.row, p.col, null));
    cycle.forEach((p, i) => {
      const to = board.getCell(p.row, p.col)!.conveyorTo!;
      board.set(to.row, to.col, tiles[i]);
      transports.push({ id: tiles[i].id, from: { row: p.row, col: p.col }, to: { ...to } });
    });
  }
  if (board.mechanics) board.mechanics.turns++;
  updateBossShields(board);
  if (!transports.length && !board.mechanics?.boss) return null;
  return { matchedTileIds: [], spawnedSpecials: [], drops: [], spawns: [], scoreGained: 0,
    transports, cellsAfter: board.getCells() };
}

export function updateBossShields(board: Board): void {
  const boss = board.mechanics?.boss;
  if (!boss) return;
  const live = boss.weakSpots.filter(p => {
    const tile = board.get(p.row, p.col);
    return tile && isBlocker(tile);
  });
  const exposed = live.length ? live[Math.floor(board.mechanics!.turns / boss.period) % live.length] : undefined;
  for (const p of boss.weakSpots) {
    const cell = board.getCell(p.row, p.col);
    if (!cell) continue;
    if (live.some(q => key(q) === key(p))) cell.bossShielded = !!exposed && key(p) !== key(exposed);
    else delete cell.bossShielded;
  }
}
