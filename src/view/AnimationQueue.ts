import gsap from 'gsap';
import { IBoardViewAnimator } from './IBoardViewContracts.ts';
import { IAnimationSequencer } from './IAnimationSequencer.ts';
import { TileSprite } from './TileSprite.ts';
import { CascadeStep, Position } from '../core/TileTypes.ts';
import { ISoundService } from '../audio/ISoundService.ts';
import { soundManagerInstance } from '../audio/SoundManager.ts';
import { EffectPresenterRegistry } from './vfx/EffectPresenterRegistry.ts';

const COMBO_PRAISE_THRESHOLD = 4;
const COMBO_PRAISES = ['DELICIOUS!', 'TASTY!', 'SUGAR CRUSH!', 'SWEET!'];

export class AnimationQueue implements IAnimationSequencer {
  private boardView: IBoardViewAnimator;
  private soundService: ISoundService;
  private effectPresenters: EffectPresenterRegistry;

  constructor(
    boardView: IBoardViewAnimator,
    soundService: ISoundService = soundManagerInstance,
    effectPresenters: EffectPresenterRegistry = new EffectPresenterRegistry()
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
      const pixelA = this.boardView.gridToLocal(posA.row, posA.col);
      const pixelB = this.boardView.gridToLocal(posB.row, posB.col);

      this.soundService.playSwap();

      const tl = gsap.timeline({ onComplete: () => resolve() });
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

      // 1. Delegate each special detonation to its registered presenter (OCP)
      for (const spec of step.triggeredSpecials ?? []) {
        this.effectPresenters.present(spec, {
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
            const targetPos = this.boardView.gridToLocal(evo.specialTile.row, evo.specialTile.col);

            handledIds.add(evo.specialTile.id);

            // Animate companion tiles converging and merging into targetPos
            for (const sourceId of evo.sourceTileIds) {
              handledIds.add(sourceId);
              const sourceSprite = this.boardView.getTileSprite(sourceId);
              if (sourceSprite) {
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

            // Animate special candy evolving with elastic pop
            if (specialSprite) {
              specialSprite.x = targetPos.x;
              specialSprite.y = targetPos.y;
              specialSprite.tileData = evo.specialTile;

              tl.add(() => {
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

      // 4. Animate drops and spawns with stacked positioning and soft transitions
      await new Promise<void>((resolve) => {
        const tl = gsap.timeline({ onComplete: resolve });

        // Existing tiles falling down
        step.drops.forEach((drop) => {
          const sprite = this.boardView.getTileSprite(drop.id);
          if (sprite) {
            const targetPos = this.boardView.gridToLocal(drop.toRow, drop.col);
            const distance = drop.toRow - drop.fromRow;
            const duration = 0.18 + distance * 0.04;

            sprite.x = targetPos.x;
            sprite.tileData.row = drop.toRow;
            sprite.tileData.col = drop.col;

            tl.to(
              sprite,
              {
                y: targetPos.y,
                duration,
                ease: 'bounce.out',
              },
              0
            );
          }
        });

        // Group spawns by column to stack neatly above the grid
        const spawnsByCol = new Map<number, typeof step.spawns>();
        step.spawns.forEach((spawn) => {
          const list = spawnsByCol.get(spawn.tile.col) || [];
          list.push(spawn);
          spawnsByCol.set(spawn.tile.col, list);
        });

        spawnsByCol.forEach((colSpawns, col) => {
          // Sort descending by row so the tile that ends lowest falls earliest
          colSpawns.sort((a, b) => b.tile.row - a.tile.row);
          const colCount = colSpawns.length;

          colSpawns.forEach((spawn, idx) => {
            const sprite = this.boardView.addTileSprite(spawn.tile);
            const targetPos = this.boardView.gridToLocal(spawn.tile.row, col);

            // Stack above row 0 (centered at tileSize / 2)
            const topRowCenter = this.boardView.tileSize / 2;
            const stackOffset = (colCount - idx) * this.boardView.tileSize;
            sprite.x = targetPos.x;
            sprite.y = topRowCenter - stackOffset;

            // Soft smooth appearance
            sprite.alpha = 0;
            sprite.scale.set(0.75);

            const fallDistance = targetPos.y - sprite.y;
            const duration = 0.28 + (fallDistance / (this.boardView.tileSize * 8)) * 0.18;
            const delay = 0.03 * (colCount - idx - 1);

            tl.to(
              sprite,
              {
                alpha: 1,
                duration: 0.12,
                ease: 'power1.out',
              },
              delay
            );

            tl.to(
              sprite.scale,
              {
                x: 1,
                y: 1,
                duration: 0.18,
                ease: 'back.out(1.5)',
              },
              delay
            );

            tl.to(
              sprite,
              {
                y: targetPos.y,
                duration,
                ease: 'bounce.out',
              },
              delay
            );
          });
        });
      });

      combo++;
      // Brief pause between cascade steps for visual rhythm
      await new Promise((r) => setTimeout(r, 70));
    }
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
