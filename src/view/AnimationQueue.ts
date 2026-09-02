import gsap from 'gsap';
import { BoardView } from './BoardView.ts';
import { CascadeStep, Position } from '../core/TileTypes.ts';
import { SoundManager } from '../audio/SoundManager.ts';

export class AnimationQueue {
  private boardView: BoardView;

  constructor(boardView: BoardView) {
    this.boardView = boardView;
  }

  public animateSwap(posA: Position, posB: Position, revert = false): Promise<void> {
    return new Promise((resolve) => {
      const tileA = this.boardView.board.get(posA.row, posA.col);
      const tileB = this.boardView.board.get(posB.row, posB.col);

      const spriteA = tileA ? this.boardView.getTileSprite(tileA.id) : null;
      const spriteB = tileB ? this.boardView.getTileSprite(tileB.id) : null;

      if (!spriteA || !spriteB) {
        resolve();
        return;
      }

      const pixelA = this.boardView.gridToLocal(posA.row, posA.col);
      const pixelB = this.boardView.gridToLocal(posB.row, posB.col);

      SoundManager.playSwap();

      const tl = gsap.timeline({
        onComplete: () => resolve(),
      });

      tl.to(spriteA, { x: pixelB.x, y: pixelB.y, duration: 0.22, ease: 'power2.out' }, 0);
      tl.to(spriteB, { x: pixelA.x, y: pixelA.y, duration: 0.22, ease: 'power2.out' }, 0);

      if (revert) {
        tl.to(spriteA, { x: pixelA.x, y: pixelA.y, duration: 0.18, ease: 'power2.inOut', delay: 0.05 });
        tl.to(spriteB, { x: pixelB.x, y: pixelB.y, duration: 0.18, ease: 'power2.inOut' }, '<');
      }
    });
  }

  public async playCascadeSteps(
    steps: CascadeStep[],
    onScoreGained: (score: number) => void
  ): Promise<void> {
    let combo = 1;

    for (const step of steps) {
      onScoreGained(step.scoreGained);

      // 1. Trigger special effects if any
      if (step.triggeredSpecials && step.triggeredSpecials.length > 0) {
        for (const spec of step.triggeredSpecials) {
          const pos = this.boardView.gridToLocal(spec.sourceTile.row, spec.sourceTile.col);
          if (spec.effectType === 'striped_h') {
            this.boardView.vfx.createLaserBeam(pos.x, pos.y, this.boardView.boardPixelWidth, true);
            SoundManager.playSpecialLaser();
          } else if (spec.effectType === 'striped_v') {
            this.boardView.vfx.createLaserBeam(pos.x, pos.y, this.boardView.boardPixelHeight, false);
            SoundManager.playSpecialLaser();
          } else if (spec.effectType === 'wrapped' || spec.effectType === 'combo_giant_wrapped') {
            this.boardView.vfx.createShockwave(pos.x, pos.y, this.boardView.tileSize * 2.5);
            SoundManager.playBombExplosion();
          } else if (spec.effectType === 'color_bomb' || spec.effectType.includes('combo')) {
            this.boardView.vfx.screenShake(this.boardView, 12);
            SoundManager.playBombExplosion();
          }
        }
      }

      // 2. Play match sound & floating text
      SoundManager.playMatch(combo);

      if (combo >= 4) {
        const centerPos = this.boardView.gridToLocal(3, 3);
        const praises = ['DELICIOUS!', 'TASTY!', 'SUGAR CRUSH!', 'SWEET!'];
        const word = praises[(combo - 4) % praises.length];
        this.boardView.vfx.createFloatingText(centerPos.x, centerPos.y, word, 0xffd700);
        this.boardView.vfx.screenShake(this.boardView, 8);
      }

      // 3. Animate destruction of matched tiles
      await new Promise<void>((resolve) => {
        const tl = gsap.timeline({ onComplete: resolve });

        step.matchedTileIds.forEach((id) => {
          const sprite = this.boardView.getTileSprite(id);
          if (sprite) {
            // Particle burst
            this.boardView.vfx.createParticleBurst(sprite.x, sprite.y, sprite.tileData.color);

            tl.to(
              sprite.scale,
              {
                x: 1.3,
                y: 1.3,
                duration: 0.12,
                ease: 'power1.out',
              },
              0
            ).to(
              sprite,
              {
                alpha: 0,
                duration: 0.15,
                ease: 'power2.in',
                onComplete: () => this.boardView.removeTileSprite(id),
              },
              0.08
            );
          }
        });

        // Also update any upgraded special candies
        step.spawnedSpecials.forEach((specialTile) => {
          const sprite = this.boardView.getTileSprite(specialTile.id);
          if (sprite) {
            sprite.tileData = specialTile;
            sprite.updateTexture();
            tl.fromTo(
              sprite.scale,
              { x: 0.2, y: 0.2 },
              { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' },
              0.1
            );
          }
        });
      });

      // 4. Animate drops and spawns
      await new Promise<void>((resolve) => {
        const tl = gsap.timeline({ onComplete: resolve });

        // Existing tiles falling down
        step.drops.forEach((drop) => {
          const sprite = this.boardView.getTileSprite(drop.id);
          if (sprite) {
            const targetPos = this.boardView.gridToLocal(drop.toRow, drop.col);
            const distance = drop.toRow - drop.fromRow;
            const duration = 0.2 + distance * 0.05;

            tl.to(
              sprite,
              {
                y: targetPos.x !== undefined ? targetPos.y : sprite.y,
                duration,
                ease: 'bounce.out',
              },
              0
            );
          }
        });

        // New tiles falling into place from top
        step.spawns.forEach((spawn) => {
          const sprite = this.boardView.addTileSprite(spawn.tile);
          const targetPos = this.boardView.gridToLocal(spawn.tile.row, spawn.tile.col);

          // Position starting above top row
          sprite.x = targetPos.x;
          sprite.y = -(this.boardView.board.rows - spawn.tile.row) * this.boardView.tileSize;

          const duration = 0.35 + spawn.tile.row * 0.05;
          tl.to(
            sprite,
            {
              y: targetPos.y,
              duration,
              ease: 'bounce.out',
            },
            0.05
          );
        });
      });

      combo++;
      // Brief pause between cascade steps for visual rhythm
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  public animateShuffle(tileMappings: Map<number, Position>): Promise<void> {
    return new Promise((resolve) => {
      SoundManager.playShuffle();
      const centerX = this.boardView.boardPixelWidth / 2;
      const centerY = this.boardView.boardPixelHeight / 2;

      this.boardView.vfx.createFloatingText(centerX, centerY, 'SHUFFLE!', 0x00e5ff);

      const tl = gsap.timeline({ onComplete: resolve });

      // Gather towards center with swirl
      this.boardView.getTileSpritesMap().forEach((sprite) => {
        tl.to(
          sprite,
          {
            x: centerX + (Math.random() - 0.5) * 80,
            y: centerY + (Math.random() - 0.5) * 80,
            rotation: (Math.random() - 0.5) * Math.PI,
            duration: 0.35,
            ease: 'power2.inOut',
          },
          0
        );
      });

      // Distribute to new positions
      this.boardView.getTileSpritesMap().forEach((sprite) => {
        const newPos = tileMappings.get(sprite.tileData.id);
        if (newPos) {
          sprite.tileData.row = newPos.row;
          sprite.tileData.col = newPos.col;
          const targetPix = this.boardView.gridToLocal(newPos.row, newPos.col);

          tl.to(
            sprite,
            {
              x: targetPix.x,
              y: targetPix.y,
              rotation: 0,
              duration: 0.4,
              ease: 'back.out(1.2)',
            },
            0.4
          );
        }
      });
    });
  }
}
