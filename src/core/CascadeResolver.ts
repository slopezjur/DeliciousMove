import { Board } from './Board.ts';
import { MatchDetector } from './MatchDetector.ts';
import { SpecialResolver } from './SpecialResolver.ts';
import {
  CascadeStep,
  DropMovement,
  Position,
  SpawnData,
  SwapResult,
  TileColor,
  TileData,
  ALL_TILE_COLORS,
} from './TileTypes.ts';

export class CascadeResolver {
  public static BASE_TILE_SCORE = 60;

  /**
   * Evaluates a player move between two positions.
   * If valid, returns the full sequence of cascade steps to animate.
   * If invalid, valid=false and steps will be empty.
   */
  public static resolveSwap(board: Board, posA: Position, posB: Position): SwapResult {
    if (!board.isAdjacent(posA, posB)) {
      return { valid: false, steps: [] };
    }

    const tileA = board.get(posA.row, posA.col);
    const tileB = board.get(posB.row, posB.col);
    if (!tileA || !tileB) {
      return { valid: false, steps: [] };
    }

    // 1. Check for special swap combos first (e.g. Color Bomb + anything, Striped + Striped)
    const specialCombo = SpecialResolver.resolveSpecialSwapCombo(board, posA, posB);
    if (specialCombo.executed) {
      // Execute cascade resulting from special combo
      const steps: CascadeStep[] = [];
      const firstStep = this.executeDestroyAndCollapse(
        board,
        specialCombo.destroyedTileIds,
        [],
        specialCombo.effects,
        1
      );
      steps.push(firstStep);

      // Continue cascading until stable
      this.continueCascades(board, steps, 2);
      return { valid: true, steps };
    }

    // 2. Perform test swap on a cloned board to see if it creates a match
    const testBoard = board.clone();
    testBoard.swap(posA, posB);
    const initialMatches = MatchDetector.detectMatches(testBoard, [posA, posB]);

    if (initialMatches.length === 0) {
      // Not a valid move
      return { valid: false, steps: [] };
    }

    // Move is valid! Apply swap to real board
    board.swap(posA, posB);

    const steps: CascadeStep[] = [];
    let comboMultiplier = 1;

    // First cascade step with player interaction positions
    const step = this.processMatchPass(board, [posA, posB], comboMultiplier);
    if (step) {
      steps.push(step);
      comboMultiplier++;
      this.continueCascades(board, steps, comboMultiplier);
    }

    return { valid: true, steps };
  }

  /**
   * Continues cascading passes until board has settled with zero matches.
   */
  private static continueCascades(board: Board, steps: CascadeStep[], startMultiplier: number): void {
    let combo = startMultiplier;
    const maxIterations = 25; // Safety limit against potential infinite loops
    let iteration = 0;

    while (iteration++ < maxIterations) {
      const step = this.processMatchPass(board, [], combo);
      if (!step) break;
      steps.push(step);
      combo++;
    }
  }

  /**
   * Evaluates one match pass, creates special candies, detonates specials, collapses grid, and refills.
   */
  public static processMatchPass(
    board: Board,
    interactionPositions: Position[],
    multiplier: number
  ): CascadeStep | null {
    const matchGroups = MatchDetector.detectMatches(board, interactionPositions);
    if (matchGroups.length === 0) return null;

    const destroyedIds = new Set<number>();
    const spawnedSpecials: TileData[] = [];
    const specialsToDetonate: TileData[] = [];

    for (const group of matchGroups) {
      if (group.spawnSpecial) {
        const { position, type, color } = group.spawnSpecial;
        // The tile at spawn position is upgraded to special candy, NOT destroyed
        const spawnTargetTile = group.tiles.find((t) => t.row === position.row && t.col === position.col);

        for (const t of group.tiles) {
          if (spawnTargetTile && t.id === spawnTargetTile.id) {
            // Upgrade tile
            t.special = type;
            t.color = color;
            spawnedSpecials.push(t);
          } else {
            destroyedIds.add(t.id);
            if (t.special !== 'none') {
              specialsToDetonate.push(t);
            }
          }
        }
      } else {
        for (const t of group.tiles) {
          destroyedIds.add(t.id);
          if (t.special !== 'none') {
            specialsToDetonate.push(t);
          }
        }
      }
    }

    // Detonate any special candies caught in the match
    const triggeredEffects: any[] = [];
    if (specialsToDetonate.length > 0) {
      SpecialResolver.collectSpecialEffects(board, specialsToDetonate, destroyedIds, triggeredEffects);
    }

    return this.executeDestroyAndCollapse(board, destroyedIds, spawnedSpecials, triggeredEffects, multiplier);
  }

  /**
   * Destroys matched tiles, drops hanging tiles down, spawns new tiles at top, and produces step data.
   */
  private static executeDestroyAndCollapse(
    board: Board,
    destroyedIds: Set<number>,
    spawnedSpecials: TileData[],
    triggeredEffects: any[],
    multiplier: number
  ): CascadeStep {
    // 1. Clear destroyed tiles from board
    board.forEachTile((t, r, c) => {
      if (destroyedIds.has(t.id)) {
        board.set(r, c, null);
      }
    });

    // 2. Drop tiles down per column
    const drops: DropMovement[] = [];
    for (let c = 0; c < board.cols; c++) {
      let emptyRow = board.rows - 1;
      for (let r = board.rows - 1; r >= 0; r--) {
        const tile = board.get(r, c);
        if (tile !== null) {
          if (r !== emptyRow) {
            board.set(r, c, null);
            board.set(emptyRow, c, tile);
            drops.push({
              id: tile.id,
              fromRow: r,
              toRow: emptyRow,
              col: c,
            });
          }
          emptyRow--;
        }
      }
    }

    // 3. Spawn new tiles in empty spaces at top of each column
    const spawns: SpawnData[] = [];
    for (let c = 0; c < board.cols; c++) {
      for (let r = board.rows - 1; r >= 0; r--) {
        if (board.get(r, c) === null) {
          const randomColor = ALL_TILE_COLORS[Math.floor(Math.random() * ALL_TILE_COLORS.length)];
          const newTile = board.createTile(r, c, randomColor);
          spawns.push({ tile: newTile });
        }
      }
    }

    const scoreGained = destroyedIds.size * this.BASE_TILE_SCORE * multiplier;

    return {
      matchedTileIds: Array.from(destroyedIds),
      spawnedSpecials,
      triggeredSpecials: triggeredEffects,
      drops,
      spawns,
      scoreGained,
    };
  }
}
