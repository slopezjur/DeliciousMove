import { Board } from './Board.ts';
import { IMatchDetector, MatchDetector } from './MatchDetector.ts';
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
  resolveSwap(board: Board, posA: Position, posB: Position): SwapResult;
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
    specialResolver: ISpecialResolver = new SpecialResolver()
  ) {
    this.scoreCalculator = scoreCalculator;
    this.gravitySystem = gravitySystem;
    this.tileSpawner = tileSpawner;
    this.matchDetector = matchDetector;
    this.specialResolver = specialResolver;
  }

  /**
   * Evaluates a player move between two positions.
   * If valid, returns the full sequence of cascade steps to animate.
   */
  public resolveSwap(board: Board, posA: Position, posB: Position): SwapResult {
    if (!board.isAdjacent(posA, posB)) {
      return { valid: false, steps: [] };
    }

    if (!board.get(posA.row, posA.col) || !board.get(posB.row, posB.col)) {
      return { valid: false, steps: [] };
    }

    // Apply the swap up front so both combo effects and match detection see the tiles
    // in the cells the player actually dropped them into.
    board.swap(posA, posB);

    // 1. Direct special-on-special combos bypass color matching entirely.
    const specialCombo = this.specialResolver.resolveSpecialSwapCombo(board, posA, posB);
    if (specialCombo.executed) {
      const steps: CascadeStep[] = [];
      steps.push(
        this.executeDestroyAndCollapse(board, specialCombo.destroyedTileIds, [], [], specialCombo.effects, 1)
      );
      this.continueCascades(board, steps, 2);
      return { valid: true, steps };
    }

    // 2. Otherwise the swap must produce at least one color match.
    if (this.matchDetector.detectMatches(board, [posA, posB]).length === 0) {
      board.swap(posA, posB); // Revert
      return { valid: false, steps: [] };
    }

    const steps: CascadeStep[] = [];
    const step = this.processMatchPass(board, [posA, posB], 1);
    if (step) {
      steps.push(step);
      this.continueCascades(board, steps, 2);
    }

    return { valid: true, steps };
  }

  private continueCascades(board: Board, steps: CascadeStep[], startMultiplier: number): void {
    let combo = startMultiplier;
    let iteration = 0;

    while (iteration++ < MAX_CASCADE_ITERATIONS) {
      const step = this.processMatchPass(board, [], combo);
      if (!step) break;
      steps.push(step);
      combo++;
    }
  }

  public processMatchPass(
    board: Board,
    interactionPositions: Position[],
    multiplier: number
  ): CascadeStep | null {
    const matchGroups = this.matchDetector.detectMatches(board, interactionPositions);
    if (matchGroups.length === 0) return null;

    const destroyedIds = new Set<number>();
    const spawnedSpecials: TileData[] = [];
    const evolutions: SpecialEvolution[] = [];
    const detonationBatches: SpecialDetonationBatch[] = [];

    for (const group of matchGroups) {
      const caughtSpecials: TileData[] = [];

      if (group.spawnSpecial) {
        const { target, displaced } = this.selectSpawnTarget(group);
        if (displaced) caughtSpecials.push(displaced);

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
        evolutions.push({ specialTile: target, sourceTileIds: convergingIds });
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

    const triggeredEffects: SpecialTriggerEffect[] = [];
    if (detonationBatches.length > 0) {
      this.specialResolver.detonate(board, detonationBatches, destroyedIds, triggeredEffects);
    }

    // Newly spawned specials always survive their own pass, even when a chained blast
    // sweeps the cell they were created in. Applied after detonation so the chain
    // cannot re-add them to the destruction set.
    this.protectSpawnedSpecials(spawnedSpecials, destroyedIds, triggeredEffects);

    return this.executeDestroyAndCollapse(
      board,
      destroyedIds,
      spawnedSpecials,
      evolutions,
      triggeredEffects,
      multiplier
    );
  }

  /**
   * Picks the tile a match evolves into. A plain tile is preferred so an existing special
   * inside the match is not silently overwritten; when the whole group is special, the
   * displaced candy is reported so it still detonates.
   */
  private selectSpawnTarget(group: MatchGroup): SpawnTargetSelection {
    const { position } = group.spawnSpecial!;
    const preferred = group.tiles.find((t) => t.row === position.row && t.col === position.col);

    if (preferred && preferred.special === SpecialType.None) {
      return { target: preferred, displaced: null };
    }

    const plain = group.tiles.find((t) => t.special === SpecialType.None);
    if (plain) {
      return { target: plain, displaced: null };
    }

    // Whole group is special: snapshot the candy being overwritten so its blast still
    // fires. It keeps the target id so the blast does not re-detonate the new special,
    // which protectSpawnedSpecials then rescues from the destruction set.
    const target = preferred ?? group.tiles[0];
    return { target, displaced: { ...target } };
  }

  private protectSpawnedSpecials(
    spawnedSpecials: TileData[],
    destroyedIds: Set<number>,
    triggeredEffects: SpecialTriggerEffect[]
  ): void {
    if (spawnedSpecials.length === 0) return;

    const protectedIds = new Set(spawnedSpecials.map((s) => s.id));
    protectedIds.forEach((id) => destroyedIds.delete(id));

    // Keep the VFX payload consistent with what actually gets destroyed.
    for (const effect of triggeredEffects) {
      effect.affectedTileIds = effect.affectedTileIds.filter((id) => !protectedIds.has(id));
    }
  }

  private executeDestroyAndCollapse(
    board: Board,
    destroyedIds: Set<number>,
    spawnedSpecials: TileData[],
    evolutions: SpecialEvolution[],
    triggeredEffects: SpecialTriggerEffect[],
    multiplier: number
  ): CascadeStep {
    // 1. Remove destroyed tiles
    board.forEachTile((t, r, c) => {
      if (destroyedIds.has(t.id)) {
        board.set(r, c, null);
      }
    });

    // 2. Delegate gravity simulation to BoardGravitySystem (SRP)
    const drops = this.gravitySystem.applyGravity(board);

    // 3. Delegate top tile refill to TileSpawner (SRP)
    const spawns = this.tileSpawner.refillEmptySlots(board);

    // 4. Delegate score evaluation to ScoreCalculator (SRP)
    const scoreGained = this.scoreCalculator.calculateStepScore(destroyedIds.size, multiplier);

    return {
      matchedTileIds: Array.from(destroyedIds),
      spawnedSpecials,
      evolutions,
      triggeredSpecials: triggeredEffects,
      drops,
      spawns,
      scoreGained,
    };
  }
}
