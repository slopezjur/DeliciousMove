import gsap from 'gsap';
import { IBoardViewAnimator } from './IBoardViewContracts.ts';
import { IAnimationSequencer } from './IAnimationSequencer.ts';
import { TileSprite } from './TileSprite.ts';
import { CascadeStep, Position } from '../core/TileTypes.ts';
import { ISoundService } from '../audio/ISoundService.ts';
import { soundManagerInstance } from '../audio/SoundManager.ts';
import { IEffectPresenterRegistry } from './vfx/IEffectPresenter.ts';
import { EffectPresenterRegistry } from './vfx/EffectPresenterRegistry.ts';

const COMBO_PRAISE_THRESHOLD = 4;
const COMBO_PRAISES = ['DELICIOUS!', 'TASTY!', 'SUGAR CRUSH!', 'SWEET!'];

export class AnimationQueue implements IAnimationSequencer {
  private boardView: IBoardViewAnimator;
  private soundService: ISoundService;
  private effectPresenters: IEffectPresenterRegistry;

  constructor(
    boardView: IBoardViewAnimator,
    soundService: ISoundService = soundManagerInstance,
    effectPresenters: IEffectPresenterRegistry = new EffectPresenterRegistry()
  ) {
    this.boardView = boardView;
    this.soundService = soundService;
    this.effectPresenters = effectPresenters;
  }

  /**
   * Animates two sprites swapping positions.
   */
  public animateSwap(
    spriteA: TileSprite,
    spriteB: TileSprite,
    posA: Position,
    posB: Position
  ): Promise<void> {
    return new Promise((resolve) => {
      gsap.killTweensOf(spriteA);
      gsap.killTweensOf(spriteA.scale);
      gsap.killTweensOf(spriteB);
      gsap.killTweensOf(spriteB.scale);

      const pixelA = this.boardView.gridToLocal(posA.row, posA.col);
      const pixelB = this.boardView.gridToLocal(posB.row, posB.col);

      this.soundService.playSwap();

      const tl = gsap.timeline({
        onComplete: () => {
          spriteA.x = pixelB.x;
          spriteA.y = pixelB.y;
          spriteA.tileData.row = posB.row;
          spriteA.tileData.col = posB.col;
          spriteA.zIndex = posB.row;
          spriteB.x = pixelA.x;
          spriteB.y = pixelA.y;
          spriteB.tileData.row = posA.row;
          spriteB.tileData.col = posA.col;
          spriteB.zIndex = posA.row;
          resolve();
        },
      });
      tl.to(spriteA, { x: pixelB.x, y: pixelB.y, duration: 0.2, ease: 'power2.out' }, 0);
      tl.to(spriteB, { x: pixelA.x, y: pixelA.y, duration: 0.2, ease: 'power2.out' }, 0);
    });
  }

  public async playCascadeSteps(
    steps: CascadeStep[],
    onScoreGained: (score: number) => void
  ): Promise<void> {
    let combo = 1;

    for (const step of steps) {
      onScoreGained(step.scoreGained);

      // 1. Delegate each special detonation to its registered presenter and await impact (OCP)
      for (const spec of step.triggeredSpecials ?? []) {
        await this.effectPresenters.present(spec, {
          boardView: this.boardView,
          sound: this.soundService,
          position: this.boardView.gridToLocal(spec.sourceTile.row, spec.sourceTile.col),
        });
      }

      // 2. Play match sound & floating text
      this.soundService.playMatch(combo);

      if (combo >= COMBO_PRAISE_THRESHOLD) {
        const center = this.getBoardCenter();
        const word = COMBO_PRAISES[(combo - COMBO_PRAISE_THRESHOLD) % COMBO_PRAISES.length];
        this.boardView.vfx.createFloatingText(center.x, center.y, word, 0xffd700);
        this.boardView.screenShake(8);
      }

      // 3. Animate matched tiles and special candy evolutions
      await new Promise<void>((resolve) => {
        const tl = gsap.timeline({ onComplete: resolve });
        const handledIds = new Set<number>();

        // A. Handle special candy evolutions (companion tiles merge into target cell)
        if (step.evolutions && step.evolutions.length > 0) {
          for (const evo of step.evolutions) {
            const specialSprite = this.boardView.getTileSprite(evo.specialTile.id);
            const spawnPos = evo.spawnPosition ?? { row: evo.specialTile.row, col: evo.specialTile.col };
            const targetPos = this.boardView.gridToLocal(spawnPos.row, spawnPos.col);

            handledIds.add(evo.specialTile.id);

            // Animate companion tiles converging and merging into targetPos
            for (const sourceId of evo.sourceTileIds) {
              handledIds.add(sourceId);
              const sourceSprite = this.boardView.getTileSprite(sourceId);
              if (sourceSprite) {
                gsap.killTweensOf(sourceSprite);
                gsap.killTweensOf(sourceSprite.scale);
                tl.to(
                  sourceSprite,
                  {
                    x: targetPos.x,
                    y: targetPos.y,
                    alpha: 0.1,
                    duration: 0.22,
                    ease: 'power2.in',
                    onComplete: () => this.boardView.removeTileSprite(sourceId),
                  },
                  0
                ).to(
                  sourceSprite.scale,
                  {
                    x: 0.1,
                    y: 0.1,
                    duration: 0.22,
                    ease: 'power2.in',
                  },
                  0
                );
              }
            }

            // Animate special candy evolving:
            // 1. If not already at targetPos, smoothly glide it to targetPos alongside companion tiles
            // 2. Elevate zIndex so companion tiles converge underneath rather than in front
            if (specialSprite) {
              gsap.killTweensOf(specialSprite);
              gsap.killTweensOf(specialSprite.scale);
              specialSprite.zIndex = spawnPos.row + 0.5;

              if (Math.abs(specialSprite.x - targetPos.x) > 1 || Math.abs(specialSprite.y - targetPos.y) > 1) {
                tl.to(
                  specialSprite,
                  {
                    x: targetPos.x,
                    y: targetPos.y,
                    duration: 0.22,
                    ease: 'power2.in',
                  },
                  0
                );
              }

              // 3. At the exact moment companion tiles converge (t = 0.22s), transform and pop!
              tl.add(() => {
                specialSprite.x = targetPos.x;
                specialSprite.y = targetPos.y;
                specialSprite.tileData.row = spawnPos.row;
                specialSprite.tileData.col = spawnPos.col;
                specialSprite.tileData.special = evo.specialTile.special;
                specialSprite.tileData.color = evo.specialTile.color;
                specialSprite.updateTexture();
                this.soundService.playSpecialLaser();
                this.boardView.vfx.createParticleBurst(targetPos.x, targetPos.y, evo.specialTile.color);
              }, 0.22);

              tl.fromTo(
                specialSprite.scale,
                { x: 0.3, y: 0.3 },
                { x: 1, y: 1, duration: 0.28, ease: 'back.out(2.2)' },
                0.22
              );
            }
          }
        }

        // B. Handle normal matched tiles not part of an evolution
        step.matchedTileIds.forEach((id) => {
          if (handledIds.has(id)) return;
          handledIds.add(id);

          const sprite = this.boardView.getTileSprite(id);
          if (sprite) {
            gsap.killTweensOf(sprite);
            gsap.killTweensOf(sprite.scale);
            this.boardView.vfx.createParticleBurst(sprite.x, sprite.y, sprite.tileData.color);

            tl.to(
              sprite.scale,
              {
                x: 1.25,
                y: 1.25,
                duration: 0.12,
                ease: 'power1.out',
              },
              0
            ).to(
              sprite,
              {
                alpha: 0,
                duration: 0.14,
                ease: 'power2.in',
                onComplete: () => this.boardView.removeTileSprite(id),
              },
              0.06
            );
          }
        });
      });

      // Ensure all destroyed tiles are explicitly removed before gravity drops begin
      step.matchedTileIds.forEach((id) => this.boardView.removeTileSprite(id));

      // 4. Animate drops and spawns with constant-velocity lockstep column waterfall
      await new Promise<void>((resolve) => {
        const tl = gsap.timeline({ onComplete: resolve });
        const CELL_FALL_TIME = 0.065;

        // Existing tiles falling down
        step.drops.forEach((drop) => {
          const sprite = this.boardView.getTileSprite(drop.id);
          if (sprite) {
            gsap.killTweensOf(sprite);
            gsap.killTweensOf(sprite.scale);

            const fromPos = this.boardView.gridToLocal(drop.fromRow, drop.col);
            const targetPos = this.boardView.gridToLocal(drop.toRow, drop.col);
            const distance = drop.toRow - drop.fromRow;
            const fallDuration = Math.max(0.08, distance * CELL_FALL_TIME);

            sprite.x = fromPos.x;
            sprite.y = fromPos.y;
            sprite.scale.set(1, 1);
            sprite.alpha = 1;
            sprite.visible = true;
            sprite.tileData.row = drop.toRow;
            sprite.tileData.col = drop.col;
            sprite.zIndex = drop.toRow;

            tl.to(
              sprite,
              {
                y: targetPos.y,
                duration: fallDuration,
                ease: 'none',
              },
              0
            );

            // Crisp tactile landing squash and settle starting strictly on impact
            tl.to(
              sprite.scale,
              {
                x: 1.08,
                y: 0.92,
                duration: 0.05,
                ease: 'power1.out',
              },
              fallDuration
            ).to(
              sprite.scale,
              {
                x: 1,
                y: 1,
                duration: 0.07,
                ease: 'power1.inOut',
              },
              fallDuration + 0.05
            );
          }
        });

        // Group spawns by column to stack above the grid in exact waterfall order
        const spawnsByCol = new Map<number, typeof step.spawns>();
        step.spawns.forEach((spawn) => {
          const list = spawnsByCol.get(spawn.tile.col) || [];
          list.push(spawn);
          spawnsByCol.set(spawn.tile.col, list);
        });

        spawnsByCol.forEach((colSpawns, col) => {
          const colCount = colSpawns.length;
          const fallDuration = Math.max(0.08, colCount * CELL_FALL_TIME);

          colSpawns.forEach((spawn) => {
            const sprite = this.boardView.addTileSprite(spawn.tile);
            gsap.killTweensOf(sprite);
            gsap.killTweensOf(sprite.scale);

            const targetPos = this.boardView.gridToLocal(spawn.tile.row, col);

            // Stagger position outside the board directly above destination:
            // Every spawned tile in this column starts at `spawn.tile.row - colCount`
            // and falls by exactly `colCount` rows, perfectly preserving 1-tile spacing!
            const startRow = spawn.tile.row - colCount;
            const startPos = this.boardView.gridToLocal(startRow, col);

            sprite.x = targetPos.x;
            sprite.y = startPos.y;
            sprite.scale.set(1, 1);
            sprite.alpha = 1;
            sprite.visible = true;
            sprite.zIndex = spawn.tile.row;

            tl.to(
              sprite,
              {
                y: targetPos.y,
                duration: fallDuration,
                ease: 'none',
              },
              0
            );

            // Crisp tactile landing squash and settle starting strictly on impact
            tl.to(
              sprite.scale,
              {
                x: 1.08,
                y: 0.92,
                duration: 0.05,
                ease: 'power1.out',
              },
              fallDuration
            ).to(
              sprite.scale,
              {
                x: 1,
                y: 1,
                duration: 0.07,
                ease: 'power1.inOut',
              },
              fallDuration + 0.05
            );
          });
        });
      });

      // Intermediate step-local alignment: guarantee only this step's discrete movements are snapped
      step.matchedTileIds.forEach((id) => this.boardView.removeTileSprite(id));

      step.drops.forEach((drop) => {
        const sprite = this.boardView.getTileSprite(drop.id);
        if (sprite) {
          gsap.killTweensOf(sprite);
          gsap.killTweensOf(sprite.scale);
          const pos = this.boardView.gridToLocal(drop.toRow, drop.col);
          sprite.x = pos.x;
          sprite.y = pos.y;
          sprite.scale.set(1, 1);
          sprite.alpha = 1;
          sprite.visible = true;
          sprite.zIndex = drop.toRow;
          sprite.tileData.row = drop.toRow;
          sprite.tileData.col = drop.col;
        }
      });

      step.spawns.forEach((spawn) => {
        const sprite = this.boardView.getTileSprite(spawn.tile.id);
        if (sprite) {
          gsap.killTweensOf(sprite);
          gsap.killTweensOf(sprite.scale);
          const pos = this.boardView.gridToLocal(spawn.tile.row, spawn.tile.col);
          sprite.x = pos.x;
          sprite.y = pos.y;
          sprite.scale.set(1, 1);
          sprite.alpha = 1;
          sprite.visible = true;
          sprite.zIndex = spawn.tile.row;
          sprite.tileData.row = spawn.tile.row;
          sprite.tileData.col = spawn.tile.col;
        }
      });

      if (step.evolutions) {
        step.evolutions.forEach((evo) => {
          const sprite = this.boardView.getTileSprite(evo.specialTile.id);
          if (sprite) {
            gsap.killTweensOf(sprite);
            gsap.killTweensOf(sprite.scale);
            const pos = this.boardView.gridToLocal(evo.specialTile.row, evo.specialTile.col);
            sprite.x = pos.x;
            sprite.y = pos.y;
            sprite.scale.set(1, 1);
            sprite.alpha = 1;
            sprite.visible = true;
            sprite.zIndex = evo.specialTile.row;
            sprite.tileData.row = evo.specialTile.row;
            sprite.tileData.col = evo.specialTile.col;
            sprite.tileData.special = evo.specialTile.special;
            sprite.tileData.color = evo.specialTile.color;
            sprite.updateTexture();
          }
        });
      }

      combo++;
      // Brief pause between cascade steps for visual rhythm
      await new Promise((r) => setTimeout(r, 70));
    }

    // 5. Final reconciliation: ensure every sprite exactly aligns with domain board state
    this.boardView.syncSpritesWithBoard();
  }

  public animateShuffle(tileMappings: Map<number, Position>): Promise<void> {
    return new Promise((resolve) => {
      this.soundService.playShuffle();
      const { x: centerX, y: centerY } = this.getBoardCenter();

      this.boardView.vfx.createFloatingText(centerX, centerY, 'SHUFFLE!', 0x00e5ff);

      const tl = gsap.timeline({ onComplete: resolve });

      // Gather towards center with swirl
      this.boardView.getTileSpritesMap().forEach((sprite) => {
        tl.to(
          sprite,
          {
            x: centerX + (Math.random() * 60 - 30),
            y: centerY + (Math.random() * 60 - 30),
            scale: 0.4,
            rotation: (Math.random() - 0.5) * Math.PI,
            duration: 0.35,
            ease: 'power2.inOut',
          },
          0
        );
      });

      // Distribute to new positions
      tileMappings.forEach((pos, id) => {
        const sprite = this.boardView.getTileSprite(id);
        if (sprite) {
          const pixel = this.boardView.gridToLocal(pos.row, pos.col);
          tl.to(
            sprite,
            {
              x: pixel.x,
              y: pixel.y,
              scale: 1,
              rotation: 0,
              duration: 0.45,
              ease: 'elastic.out(1, 0.75)',
            },
            0.4
          );
        }
      });
    });
  }

  /** Local pixel centre of the board, independent of grid dimensions. */
  private getBoardCenter(): { x: number; y: number } {
    return {
      x: this.boardView.boardPixelWidth / 2,
      y: this.boardView.boardPixelHeight / 2,
    };
  }
}
