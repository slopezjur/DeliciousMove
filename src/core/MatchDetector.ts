import { Board } from './Board.ts';
import { TileData, TileColor, SpecialType, Position, MatchGroup } from './TileTypes.ts';

export interface RawRun {
  orientation: 'horizontal' | 'vertical';
  color: TileColor;
  tiles: TileData[];
}

export class MatchDetector {
  /**
   * Finds all raw horizontal and vertical runs of 3 or more matching colors.
   */
  public static findRawRuns(board: Board): RawRun[] {
    const runs: RawRun[] = [];

    // Horizontal scan
    for (let r = 0; r < board.rows; r++) {
      let currentRun: TileData[] = [];
      for (let c = 0; c < board.cols; c++) {
        const tile = board.get(r, c);
        if (!tile) {
          if (currentRun.length >= 3) {
            runs.push({ orientation: 'horizontal', color: currentRun[0].color, tiles: [...currentRun] });
          }
          currentRun = [];
          continue;
        }

        if (currentRun.length === 0 || currentRun[0].color === tile.color) {
          currentRun.push(tile);
        } else {
          if (currentRun.length >= 3) {
            runs.push({ orientation: 'horizontal', color: currentRun[0].color, tiles: [...currentRun] });
          }
          currentRun = [tile];
        }
      }
      if (currentRun.length >= 3) {
        runs.push({ orientation: 'horizontal', color: currentRun[0].color, tiles: [...currentRun] });
      }
    }

    // Vertical scan
    for (let c = 0; c < board.cols; c++) {
      let currentRun: TileData[] = [];
      for (let r = 0; r < board.rows; r++) {
        const tile = board.get(r, c);
        if (!tile) {
          if (currentRun.length >= 3) {
            runs.push({ orientation: 'vertical', color: currentRun[0].color, tiles: [...currentRun] });
          }
          currentRun = [];
          continue;
        }

        if (currentRun.length === 0 || currentRun[0].color === tile.color) {
          currentRun.push(tile);
        } else {
          if (currentRun.length >= 3) {
            runs.push({ orientation: 'vertical', color: currentRun[0].color, tiles: [...currentRun] });
          }
          currentRun = [tile];
        }
      }
      if (currentRun.length >= 3) {
        runs.push({ orientation: 'vertical', color: currentRun[0].color, tiles: [...currentRun] });
      }
    }

    return runs;
  }

  /**
   * Evaluates runs into composite match groups, identifying special candy triggers (4-line, T/L, 5-line).
   * @param board The board
   * @param interactionPositions Optional positions involved in user move (for placing spawned special candy at player's target)
   */
  public static detectMatches(board: Board, interactionPositions: Position[] = []): MatchGroup[] {
    const rawRuns = this.findRawRuns(board);
    if (rawRuns.length === 0) return [];

    const hRuns = rawRuns.filter((r) => r.orientation === 'horizontal');
    const vRuns = rawRuns.filter((r) => r.orientation === 'vertical');

    const matchedGroups: MatchGroup[] = [];
    const consumedH = new Set<RawRun>();
    const consumedV = new Set<RawRun>();

    // Helper to determine spawn position (preference for player's move, else center/intersection)
    const chooseSpawnPos = (tiles: TileData[], fallback: Position): Position => {
      for (const pos of interactionPositions) {
        if (tiles.some((t) => t.row === pos.row && t.col === pos.col)) {
          return { row: pos.row, col: pos.col };
        }
      }
      return fallback;
    };

    // 1. Check for 5-in-a-row (Color Bomb) first
    for (const h of hRuns) {
      if (h.tiles.length >= 5) {
        consumedH.add(h);
        const centerTile = h.tiles[Math.floor(h.tiles.length / 2)];
        const spawnPos = chooseSpawnPos(h.tiles, { row: centerTile.row, col: centerTile.col });
        matchedGroups.push({
          tiles: h.tiles,
          color: h.color,
          spawnSpecial: {
            type: SpecialType.ColorBomb,
            position: spawnPos,
            color: h.color,
          },
        });
      }
    }

    for (const v of vRuns) {
      if (v.tiles.length >= 5) {
        consumedV.add(v);
        const centerTile = v.tiles[Math.floor(v.tiles.length / 2)];
        const spawnPos = chooseSpawnPos(v.tiles, { row: centerTile.row, col: centerTile.col });
        matchedGroups.push({
          tiles: v.tiles,
          color: v.color,
          spawnSpecial: {
            type: SpecialType.ColorBomb,
            position: spawnPos,
            color: v.color,
          },
        });
      }
    }

    // 2. Check for intersections (T, L, + shapes) -> Wrapped Candy
    for (const h of hRuns) {
      if (consumedH.has(h)) continue;
      for (const v of vRuns) {
        if (consumedV.has(v)) continue;

        if (h.color === v.color) {
          // Check intersection
          const intersection = h.tiles.find((ht) => v.tiles.some((vt) => vt.id === ht.id));
          if (intersection) {
            consumedH.add(h);
            consumedV.add(v);
            const combinedTilesMap = new Map<number, TileData>();
            h.tiles.forEach((t) => combinedTilesMap.set(t.id, t));
            v.tiles.forEach((t) => combinedTilesMap.set(t.id, t));
            const combinedTiles = Array.from(combinedTilesMap.values());

            const spawnPos = chooseSpawnPos(combinedTiles, {
              row: intersection.row,
              col: intersection.col,
            });

            matchedGroups.push({
              tiles: combinedTiles,
              color: h.color,
              spawnSpecial: {
                type: SpecialType.Wrapped,
                position: spawnPos,
                color: h.color,
              },
            });
            break;
          }
        }
      }
    }

    // 3. Process remaining unconsumed horizontal runs
    for (const h of hRuns) {
      if (consumedH.has(h)) continue;
      consumedH.add(h);

      if (h.tiles.length === 4) {
        const centerTile = h.tiles[1];
        const spawnPos = chooseSpawnPos(h.tiles, { row: centerTile.row, col: centerTile.col });
        matchedGroups.push({
          tiles: h.tiles,
          color: h.color,
          spawnSpecial: {
            type: SpecialType.StripedHorizontal,
            position: spawnPos,
            color: h.color,
          },
        });
      } else {
        matchedGroups.push({
          tiles: h.tiles,
          color: h.color,
        });
      }
    }

    // 4. Process remaining unconsumed vertical runs
    for (const v of vRuns) {
      if (consumedV.has(v)) continue;
      consumedV.add(v);

      if (v.tiles.length === 4) {
        const centerTile = v.tiles[1];
        const spawnPos = chooseSpawnPos(v.tiles, { row: centerTile.row, col: centerTile.col });
        matchedGroups.push({
          tiles: v.tiles,
          color: v.color,
          spawnSpecial: {
            type: SpecialType.StripedVertical,
            position: spawnPos,
            color: v.color,
          },
        });
      } else {
        matchedGroups.push({
          tiles: v.tiles,
          color: v.color,
        });
      }
    }

    return matchedGroups;
  }
}
