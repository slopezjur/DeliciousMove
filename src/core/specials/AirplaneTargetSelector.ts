import { Board } from '../Board.ts';
import { Objective, ObjectiveProgress, isCandy } from '../BoardFeatures.ts';
import { TileData, SpecialType } from '../TileTypes.ts';
import { IRandomSource, MathRandomSource } from '../random/IRandomSource.ts';

export interface IAirplaneTargetSelector {
  pick(board: Board, candidates: readonly TileData[]): TileData | undefined;
}

/** Random among useful targets, rather than a predictable solver. Shared by all plane effects. */
export class AirplaneTargetSelector implements IAirplaneTargetSelector {
  constructor(private readonly random: IRandomSource = new MathRandomSource(),
    private readonly getObjectives: () => readonly ObjectiveProgress[] = () => []) {}

  pick(board: Board, candidates: readonly TileData[]): TileData | undefined {
    const unfinished = this.getObjectives().filter(p => p.current < p.objective.target);
    const useful = candidates.filter(tile => unfinished.some(p => this.helps(board, tile, p.objective)));
    const specials = candidates.filter(tile => board.canActivate(tile));
    const pool = useful.length ? useful : specials.length ? specials : candidates;
    return pool.length ? pool[this.random.nextInt(pool.length)] : undefined;
  }

  private helps(board: Board, tile: TileData, objective: Objective): boolean {
    const cell = board.getCell(tile.row, tile.col)!;
    switch (objective.kind) {
      case 'score': return false;
      case 'color': return isCandy(tile) && cell.ice === 0 && tile.color === objective.color;
      case 'jelly': return cell.jelly > 0;
      case 'blocker': return objective.blocker === 'ice' ? cell.ice > 0 : tile.kind === objective.blocker;
      case 'ingredient':
        // Only clear in the cherry's uninterrupted gravity segment, never across a gap or rock.
        for (let row = tile.row - 1; row >= 0 && board.isValidPosition(row, tile.col); row--) {
          const above = board.get(row, tile.col);
          if (above?.kind === 'ingredient') return true;
          if (above?.special === SpecialType.Rock) break;
        }
        return false;
    }
  }
}
