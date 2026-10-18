import { Board } from '../core/Board.ts';
import { Position, SpecialType, TileColor, type SwapResult } from '../core/TileTypes.ts';
import type { IRandomSource } from '../core/random/IRandomSource.ts';
import { COMBOS, comboId } from '../core/SpecialCombinations.ts';
export const LESSON_IDS = ['four', 'five', 'square', 'ice', ...COMBOS.map(c => c.id)] as const;
export type LessonId = typeof LESSON_IDS[number];

export function lessonMove(id: LessonId): { from: Position; to: Position } {
  if (id === 'four' || id === 'five') return { from: { row: 2, col: 3 }, to: { row: 3, col: 3 } };
  if (id === 'square') return { from: { row: 4, col: 5 }, to: { row: 4, col: 4 } };
  if (id === 'ice') return { from: { row: 2, col: 6 }, to: { row: 3, col: 6 } };
  return { from: { row: 3, col: 3 }, to: { row: 3, col: 4 } };
}

export function populateLesson(board: Board, _random: IRandomSource, id: LessonId): void {
  for (let row = 0; row < board.rows; row++) for (let col = 0; col < board.cols; col++) {
    if (board.isValidPosition(row, col)) board.createTile(row, col, ((row * 2 + col) % 6) as TileColor);
  }
  const candy = (row: number, col: number, color: TileColor) => { board.get(row, col)!.color = color; };
  const combo = COMBOS.find(c => c.id === id);
  if (combo) {
    board.get(3, 3)!.special = combo.first; board.get(3, 4)!.special = combo.second;
    candy(3, 3, TileColor.Red); candy(3, 4, TileColor.Blue);
  } else if (id === 'four' || id === 'five') {
    [1, 2, 4, ...(id === 'five' ? [5] : [])].forEach(col => candy(3, col, TileColor.Red));
    candy(3, id === 'five' ? 6 : 5, TileColor.Green);
    candy(3, 0, TileColor.Green); candy(3, 3, TileColor.Blue); candy(2, 3, TileColor.Red);
  } else if (id === 'square') {
    for (const p of [{ row: 3, col: 3 }, { row: 3, col: 4 }, { row: 4, col: 3 }, { row: 4, col: 5 }]) candy(p.row, p.col, TileColor.Red);
    candy(4, 4, TileColor.Blue);
    candy(2, 3, TileColor.Green); candy(2, 4, TileColor.Green); candy(3, 2, TileColor.Blue); candy(3, 5, TileColor.Blue);
    candy(5, 3, TileColor.Blue); candy(5, 4, TileColor.Green); candy(4, 2, TileColor.Green);
  } else {
    candy(3, 4, TileColor.Red); candy(3, 5, TileColor.Red); candy(3, 6, TileColor.Blue); candy(2, 6, TileColor.Red);
  }
}

export function lessonCompleted(id: LessonId, result: SwapResult, pair?: readonly [SpecialType, SpecialType]): boolean {
  if (COMBOS.some(c => c.id === id)) return !!pair && comboId(pair[0], pair[1]) === id;
  if (id === 'ice') return result.steps.some(s => s.objectiveEvents?.some(e => e.kind === 'blocker' && e.blocker === 'ice'));
  const special = id === 'four' ? SpecialType.StripedVertical : id === 'five' ? SpecialType.ColorBomb : SpecialType.Airplane;
  return result.steps.some(s => s.spawnedSpecials.some(t => t.special === special));
}
