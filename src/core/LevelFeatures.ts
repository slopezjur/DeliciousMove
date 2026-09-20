import { Board } from './Board.ts';
import { LevelFeatures, Objective } from './BoardFeatures.ts';
import { SpecialType, TileColor } from './TileTypes.ts';

/** Small authored families repeat with different colors/shapes, not unbounded blocker counts. */
export function getLevelFeatures(level: number): { features?: LevelFeatures; objectives?: Objective[] } {
  if (level === 1) return {};
  const chapter = (level - 2) % 10;
  const features: LevelFeatures = { shape: 'rectangle', jelly: [], ice: [], blockers: [], ingredients: [] };
  const color = ((Math.floor((level - 2) / 10) + 2) % 6) as TileColor;
  let objectives: Objective[];
  switch (chapter) {
    case 0:
      objectives = [{ kind: 'color', color, target: 24 }];
      break;
    case 1:
      features.jelly = [2, 3, 4, 5].flatMap(row => [2, 3, 4, 5].map(col => ({ row, col })));
      objectives = [{ kind: 'jelly', target: features.jelly.length }];
      break;
    case 2:
      features.ice = [1, 3, 5, 6].map(col => ({ row: 4, col, layers: 2 }));
      objectives = [{ kind: 'blocker', blocker: 'ice', target: 4 }];
      break;
    case 3:
    case 4: {
      const kind = chapter === 3 ? 'frosting' : 'crate';
      features.blockers = [1, 3, 5, 6].map(col => ({ row: 5, col, kind, layers: chapter === 3 ? 2 : 3 }));
      objectives = [{ kind: 'blocker', blocker: kind, target: 4 }];
      break;
    }
    case 5:
      features.shape = ['notched', 'bridge', 'islands'][Math.floor((level - 2) / 10) % 3] as LevelFeatures['shape'];
      objectives = [{ kind: 'color', color, target: 24 }];
      break;
    case 6:
      features.ingredients = [1, 4, 6].map(col => ({ row: 0, col }));
      objectives = [{ kind: 'ingredient', target: 3 }];
      break;
    case 7:
      features.blockers = [2, 4, 6].map(col => ({ row: 5, col, kind: 'chocolate', layers: 1 }));
      objectives = [{ kind: 'blocker', blocker: 'chocolate', target: 3 }];
      break;
    case 8:
      features.shape = ['bridge', 'islands', 'notched'][Math.floor((level - 2) / 10) % 3] as LevelFeatures['shape'];
      features.ingredients = [{ row: 0, col: 1 }, { row: 0, col: 6 }];
      features.jelly = [1, 2, 5, 6].flatMap(row => [1, 6].map(col => ({ row, col })));
      features.blockers = [1, 6].map(col => ({ row: 5, col, kind: 'chocolate', layers: 1 }));
      objectives = [{ kind: 'jelly', target: 8 }, { kind: 'ingredient', target: 2 }];
      break;
    default: return {};
  }
  return { features, objectives };
}

/** Applies topology before population, then places authored objects on the filled board. */
export class LevelBoardSetup {
  public configure(board: Board, features?: LevelFeatures): void {
    board.resetTerrain();
    if (!features) return;
    for (const cell of board.getCells()) {
      const r = cell.row, c = cell.col;
      const gap = features.shape === 'notched' ? (r < 2 || r > 5) && (c === 0 || c === 7)
        : features.shape === 'bridge' ? (r === 3 || r === 4) && c !== 3 && c !== 4
        : features.shape === 'islands' ? c === 3 || c === 4 : false;
      board.getCell(r, c)!.playable = !gap;
    }
    for (const p of features.jelly) if (board.isValidPosition(p.row, p.col)) board.getCell(p.row, p.col)!.jelly = 1;
    for (const p of features.ice) if (board.isValidPosition(p.row, p.col)) board.getCell(p.row, p.col)!.ice = p.layers;
    if (features.ingredients.length > 0) {
      for (const cell of board.getCells()) {
        if (cell.playable && !board.isValidPosition(cell.row + 1, cell.col)) board.getCell(cell.row, cell.col)!.exit = true;
      }
    }
  }

  public placeObjects(board: Board, features?: LevelFeatures): void {
    if (!features) return;
    for (const object of features.blockers) {
      const tile = board.get(object.row, object.col);
      if (!tile) throw new Error('Blocker must occupy a playable cell.');
      Object.assign(tile, { kind: object.kind, layers: object.layers, special: SpecialType.None });
    }
    for (const p of features.ingredients) {
      const tile = board.get(p.row, p.col);
      if (!tile || tile.kind || board.getCell(p.row, p.col)!.ice) throw new Error('Ingredient source is obstructed.');
      tile.kind = 'ingredient';
      tile.special = SpecialType.None;
      // Every uninterrupted gravity segment has an exit; no ingredient is born stranded.
      let row = p.row;
      while (board.isValidPosition(row + 1, p.col)) row++;
      if (!board.getCell(row, p.col)?.exit) throw new Error('Ingredient source has no exit.');
    }
  }
}
