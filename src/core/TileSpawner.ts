import { Board } from './Board.ts';
import { SpawnData, TileColor, ALL_TILE_COLORS } from './TileTypes.ts';
import { IRandomSource, MathRandomSource } from './random/IRandomSource.ts';
import { IRefillPolicy, RandomRefillPolicy, BonusRefillPolicy } from './refill/RefillPolicy.ts';

export interface ITileSpawner {
  refillEmptySlots(board: Board, avoidMatches?: boolean): SpawnData[];
}

export interface RefillPolicies {
  normal: IRefillPolicy;
  bonus: IRefillPolicy;
}

/** Fills empty cells; injected policies decide which tiles each phase produces. */
export class TileSpawner implements ITileSpawner {
  private readonly policies: RefillPolicies;

  constructor(
    availableColors: readonly TileColor[] = ALL_TILE_COLORS,
    random: IRandomSource = new MathRandomSource(),
    policies?: RefillPolicies
  ) {
    this.policies = policies ?? {
      normal: new RandomRefillPolicy(availableColors, random),
      bonus: new BonusRefillPolicy(availableColors, random),
    };
  }

  public refillEmptySlots(board: Board, avoidMatches = false): SpawnData[] {
    const spawns: SpawnData[] = [];
    const wave = (avoidMatches ? this.policies.bonus : this.policies.normal).beginWave();
    for (let col = 0; col < board.cols; col++) {
      for (let row = board.rows - 1; row >= 0; row--) {
        if (!board.isValidPosition(row, col) || board.get(row, col) !== null) continue;
        const { color, special } = wave.nextTile(board, row, col);
        let segmentTop = row;
        while (segmentTop > 0 && !board.isGravityBarrier(segmentTop - 1, col)) segmentTop--;
        spawns.push({ tile: board.createTile(row, col, color, special), ...(segmentTop > 0 ? { segmentTop } : {}) });
      }
    }
    return spawns;
  }
}
