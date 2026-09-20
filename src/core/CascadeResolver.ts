import { Board } from './Board.ts';
import { IMatchDetector, MatchDetector } from './MatchDetector.ts';
import { isProductiveColorSwap } from './matching/MatchEligibility.ts';
import { TerrainResolver } from './TerrainResolver.ts';
import {
  ISpecialResolver,
  SpecialResolver,
  SpecialDetonationBatch,
  SpecialTriggerEffect,
} from './SpecialResolver.ts';
import { ScoreCalculator, IScoreCalculator } from './ScoreCalculator.ts';
import { BoardGravitySystem, IGravitySystem } from './BoardGravitySystem.ts';
import { TileSpawner, ITileSpawner } from './TileSpawner.ts';
import {
  CascadeStep,
  MatchGroup,
  Position,
  SwapResult,
  TileData,
  SpecialType,
  SpecialEvolution,
} from './TileTypes.ts';

/** Guards against a pathological board feeding cascades forever. */
const MAX_CASCADE_ITERATIONS = 25;

interface SpawnTargetSelection {
  target: TileData;
  /** Special that the spawn overwrote and that must still detonate, if any. */
  displaced: TileData | null;
}

export interface ICascadeResolver {
  resolveSwap(board: Board, posA: Position, posB: Position, avoidMatches?: boolean): SwapResult;
  resolveActivation(board: Board, pos: Position, avoidMatches?: boolean): SwapResult;
}

export class CascadeResolver implements ICascadeResolver {
  private readonly scoreCalculator: IScoreCalculator;
  private readonly gravitySystem: IGravitySystem;
  private readonly tileSpawner: ITileSpawner;
  private readonly matchDetector: IMatchDetector;
  private readonly specialResolver: ISpecialResolver;

  constructor(
    scoreCalculator: IScoreCalculator = new ScoreCalculator(),
    gravitySystem: IGravitySystem = new BoardGravitySystem(),
    tileSpawner: ITileSpawner = new TileSpawner(),
    matchDetector: IMatchDetector = new MatchDetector(),
    specialResolver: ISpecialResolver = new SpecialResolver(),
    private readonly terrain: TerrainResolver = new TerrainResolver()
  ) {
    this.scoreCalculator = scoreCalculator;
    this.gravitySystem = gravitySystem;
    this.tileSpawner = tileSpawner;
    this.matchDetector = matchDetector;
    this.specialResolver = specialResolver;
  }

  /**
   * Direct detonation of a clicked special candy.
   */
  public resolveActivation(board: Board, pos: Position, avoidMatches = false): SwapResult {
    const tile = board.get(pos.row, pos.col);
    if (!tile || !board.canActivate(pos)) {
      return { valid: false, steps: [] };
    }

    const destroyedTileIds = new Set<number>();
    const effects: SpecialTriggerEffect[] = [];
    this.specialResolver.detonate(board, [{ specials: [tile] }], destroyedTileIds, effects);

    const steps: CascadeStep[] = [];
    steps.push(
      this.executeDestroyAndCollapse(board, destroyedTileIds, [], [], effects, 1, avoidMatches)
    );
    this.continueCascades(board, steps, 2, avoidMatches);
    return this.finishTurn(board, steps);
  }

  /**
   * Evaluates a player move between two positions.
   * If valid, returns the full sequence of cascade steps to animate.
   */
  public resolveSwap(board: Board, posA: Position, posB: Position, avoidMatches = false): SwapResult {
    if (!board.isAdjacent(posA, posB)) {
      return { valid: false, steps: [] };
    }

    const tileA = board.get(posA.row, posA.col);
    const tileB = board.get(posB.row, posB.col);
    if (!tileA || !tileB) {
      return { valid: false, steps: [] };
    }

    // Rocks are completely static obstacles: swaps involving rocks are invalid at the model level
    if (!board.canSwap(posA) || !board.canSwap(posB)) {
      return { valid: false, steps: [] };
    }

    // Apply the swap up front so both combo effects and match detection see the tiles
    // in the cells the player actually dropped them into.
    board.swap(posA, posB);

    // 1. Direct special combos (two specials swapped together)
    const specialCombo = this.specialResolver.resolveSpecialSwapCombo(board, posA, posB);
    if (specialCombo.executed) {
      const steps: CascadeStep[] = [];
      steps.push(
        this.executeDestroyAndCollapse(board, specialCombo.destroyedTileIds, [], [], specialCombo.effects, 1, avoidMatches)
      );
      this.continueCascades(board, steps, 2, avoidMatches);
      return this.finishTurn(board, steps);
    }

    const swappedA = board.get(posA.row, posA.col)!;
    const swappedB = board.get(posB.row, posB.col)!;
    const hasSpecialInvolved = swappedA.special !== SpecialType.None || swappedB.special !== SpecialType.None;

    const matches = this.matchDetector.detectMatches(board, [posA, posB]);

    // 2. If neither tile is special, the swap must produce at least one color match.
    if (!hasSpecialInvolved && !isProductiveColorSwap(matches, tileA, tileB)) {
      board.swap(posA, posB); // Revert
      return { valid: false, steps: [] };
    }

    const steps: CascadeStep[] = [];

    // 3. Single special swapped with normal candy
    if (hasSpecialInvolved && matches.length === 0) {
      const specialsToDetonate: TileData[] = [];
      if (swappedA.special !== SpecialType.None) specialsToDetonate.push(swappedA);
      if (swappedB.special !== SpecialType.None) specialsToDetonate.push(swappedB);

      const destroyedTileIds = new Set<number>();
      const effects: SpecialTriggerEffect[] = [];
      this.specialResolver.detonate(board, [{ specials: specialsToDetonate }], destroyedTileIds, effects);
      steps.push(
        this.executeDestroyAndCollapse(board, destroyedTileIds, [], [], effects, 1, avoidMatches)
      );
      this.continueCascades(board, steps, 2, avoidMatches);
      return this.finishTurn(board, steps);
    }

    // 4. Otherwise process matches, also including any swapped specials that were not in match groups
    const swappedSpecials: TileData[] = [];
    if (hasSpecialInvolved) {
      if (swappedA.special !== SpecialType.None) swappedSpecials.push(swappedA);
      if (swappedB.special !== SpecialType.None) swappedSpecials.push(swappedB);
    }

    const step = this.processMatchPass(board, [posA, posB], 1, swappedSpecials, avoidMatches);
    if (step) {
      steps.push(step);
      this.continueCascades(board, steps, 2, avoidMatches);
    }

    return this.finishTurn(board, steps);
  }

  private finishTurn(board: Board, steps: CascadeStep[]): SwapResult {
    const growth = this.terrain.spread(board, steps);
    if (growth) steps.push(growth);
    return { valid: true, steps };
  }

  private continueCascades(board: Board, steps: CascadeStep[], startMultiplier: number, avoidMatches = false): void {
    let combo = startMultiplier;
    let iteration = 0;

    while (iteration++ < MAX_CASCADE_ITERATIONS) {
      const deliveries = new Set<number>();
      board.forEachTile(tile => {
        if (tile.kind === 'ingredient' && board.getCell(tile.row, tile.col)?.exit) deliveries.add(tile.id);
      });
      if (deliveries.size > 0) {
        steps.push(this.executeDestroyAndCollapse(board, new Set(), [], [], [], combo, avoidMatches, [], deliveries));
        continue;
      }
      const step = this.processMatchPass(board, [], combo, [], avoidMatches);
      if (!step) break;
      steps.push(step);
      combo++;
    }
  }

  public processMatchPass(
    board: Board,
    interactionPositions: Position[],
    multiplier: number,
    additionalSpecials: TileData[] = [],
    avoidMatches = false
  ): CascadeStep | null {
    const matchGroups = this.matchDetector.detectMatches(board, interactionPositions);
    if (matchGroups.length === 0 && additionalSpecials.length === 0) return null;
    const matchedTiles = structuredClone(matchGroups.flatMap(group => group.tiles));

    const destroyedIds = new Set<number>();
    const spawnedSpecials: TileData[] = [];
    const evolutions: SpecialEvolution[] = [];
    const detonationBatches: SpecialDetonationBatch[] = [];

    for (const group of matchGroups) {
      const caughtSpecials: TileData[] = [];

      if (group.spawnSpecial) {
        const { target, displaced } = this.selectSpawnTarget(group);
        if (displaced) caughtSpecials.push(displaced);

        const spawnRow = target.row;
        const spawnCol = target.col;

        target.special = group.spawnSpecial.type;
        target.color = group.spawnSpecial.color;
        spawnedSpecials.push(target);

        const convergingIds: number[] = [];
        for (const t of group.tiles) {
          if (t.id === target.id) continue;
          destroyedIds.add(t.id);
          convergingIds.push(t.id);
          if (t.special !== SpecialType.None) caughtSpecials.push(t);
        }
        evolutions.push({
          specialTile: target,
          spawnPosition: { row: spawnRow, col: spawnCol },
          sourceTileIds: convergingIds,
        });
      } else {
        for (const t of group.tiles) {
          destroyedIds.add(t.id);
          if (t.special !== SpecialType.None) caughtSpecials.push(t);
        }
      }

      if (caughtSpecials.length > 0) {
        detonationBatches.push({ specials: caughtSpecials, triggerColor: group.color });
      }
    }

    // Include any additional specials (such as dragged special candies)
    if (additionalSpecials.length > 0) {
      const unhandled = additionalSpecials.filter((s) => !spawnedSpecials.some((sp) => sp.id === s.id));
      if (unhandled.length > 0) {
        detonationBatches.push({ specials: unhandled });
      }
    }

    const triggeredEffects: SpecialTriggerEffect[] = [];
    if (detonationBatches.length > 0) {
      this.specialResolver.detonate(board, detonationBatches, destroyedIds, triggeredEffects, {
        protectedTileIds: new Set(spawnedSpecials.map(tile => tile.id)),
      });
    }

    // Newly spawned specials always survive their own pass, even when a chained blast
    // sweeps the cell they were created in.
    this.protectSpawnedSpecials(spawnedSpecials, destroyedIds, triggeredEffects);

    return this.executeDestroyAndCollapse(
      board,
      destroyedIds,
      spawnedSpecials,
      evolutions,
      triggeredEffects,
      multiplier,
      avoidMatches,
      matchedTiles
    );
  }

  /**
   * Drops surviving tiles into empty space, refills top slots, and records the score.
   */
  private executeDestroyAndCollapse(
    board: Board,
    destroyedIds: Set<number>,
    spawnedSpecials: TileData[],
    evolutions: SpecialEvolution[],
    triggeredEffects: SpecialTriggerEffect[],
    multiplier: number,
    avoidMatches = false,
    matchedTiles: TileData[] = [],
    deliveries: ReadonlySet<number> = new Set()
  ): CascadeStep {
    // Capture blast origins before gravity can move any surviving source tiles.
    const effectSnapshots = structuredClone(triggeredEffects);
    const terrainChanges = this.terrain.applyHits(board, destroyedIds, matchedTiles);
    for (const id of deliveries) destroyedIds.add(id);
    if (deliveries.size) terrainChanges.objectiveEvents.push({ kind: 'ingredient', amount: deliveries.size });
    // Only genuinely removed sprites belong to blast playback (ice and durable blockers survive hits).
    for (const effect of effectSnapshots) effect.affectedTileIds = effect.affectedTileIds.filter(id => destroyedIds.has(id));

    // 1. Clear destroyed tiles from the board
    board.forEachTile((t, r, c) => {
      if (destroyedIds.has(t.id)) {
        board.set(r, c, null);
      }
    });

    const drops = this.gravitySystem.applyGravity(board);
    const spawns = this.tileSpawner.refillEmptySlots(board, avoidMatches);
    const scoreGained = this.scoreCalculator.calculateStepScore(destroyedIds.size, multiplier);

    // Playback must never observe mutations from later cascade steps.
    return structuredClone({
      ...terrainChanges,
      matchedTileIds: Array.from(destroyedIds),
      spawnedSpecials,
      evolutions: evolutions.length > 0 ? evolutions : undefined,
      drops,
      spawns,
      scoreGained,
      triggeredSpecials: effectSnapshots,
    });
  }

  /**
   * Determines which tile in a group becomes the upgraded special candy.
   * If that cell already held a special, reports it so the overwritten effect still fires.
   */
  private selectSpawnTarget(group: MatchGroup): SpawnTargetSelection {
    const desired = group.spawnSpecial!.position;
    const existing = group.tiles.find((t) => t.row === desired.row && t.col === desired.col);
    const plainTile = group.tiles.find((t) => t.special === SpecialType.None);

    const target =
      existing && existing.special === SpecialType.None
        ? existing
        : (plainTile ?? existing ?? group.tiles[0]);

    const displaced =
      target.special !== SpecialType.None
        ? {
            id: target.id,
            row: target.row,
            col: target.col,
            color: target.color,
            special: target.special,
          }
        : null;

    return { target, displaced };
  }

  /**
   * Newly spawned specials are protected from destruction during the pass that created them.
   */
  private protectSpawnedSpecials(
    spawnedSpecials: TileData[],
    destroyedIds: Set<number>,
    effects: SpecialTriggerEffect[]
  ): void {
    for (const spec of spawnedSpecials) {
      destroyedIds.delete(spec.id);
      for (const eff of effects) {
        eff.affectedTileIds = eff.affectedTileIds.filter((id) => id !== spec.id);
      }
    }
  }
}
