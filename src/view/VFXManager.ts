import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import gsap from 'gsap';
import { TileColor } from '../core/TileTypes.ts';

export class VFXManager {
  private container: Container;

  constructor(container: Container) {
    this.container = container;
  }

  private getColorHex(color: TileColor): number {
    switch (color) {
      case TileColor.Red:
        return 0xff1744;
      case TileColor.Blue:
        return 0x0091ea;
      case TileColor.Green:
        return 0x00e676;
      case TileColor.Yellow:
        return 0xffd600;
      case TileColor.Purple:
        return 0xaa00ff;
      case TileColor.Orange:
        return 0xff6d00;
    }
  }

  public createParticleBurst(x: number, y: number, color: TileColor, count = 12): void {
    const hexColor = this.getColorHex(color);

    for (let i = 0; i < count; i++) {
      const p = new Graphics();
      const radius = 3 + Math.random() * 5;
      p.circle(0, 0, radius);
      p.fill({ color: hexColor, alpha: 0.95 });
      p.x = x;
      p.y = y;
      this.container.addChild(p);

      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 65;
      const targetX = x + Math.cos(angle) * dist;
      const targetY = y + Math.sin(angle) * dist;

      gsap.to(p, {
        x: targetX,
        y: targetY,
        alpha: 0,
        width: 1,
        height: 1,
        duration: 0.45 + Math.random() * 0.25,
        ease: 'power2.out',
        onComplete: () => {
          this.container.removeChild(p);
          p.destroy();
        },
      });
    }
  }

  public createLaserBeam(x: number, y: number, length: number, isHorizontal: boolean): void {
    const beam = new Graphics();
    if (isHorizontal) {
      beam.rect(-length / 2, -6, length, 12);
    } else {
      beam.rect(-6, -length / 2, 12, length);
    }
    beam.fill({ color: 0xffffff, alpha: 0.9 });
    beam.x = x;
    beam.y = y;
    this.container.addChild(beam);

    gsap.timeline({
      onComplete: () => {
        this.container.removeChild(beam);
        beam.destroy();
      },
    })
      .fromTo(beam.scale, { x: 0.1, y: 0.1 }, { x: 1, y: 1.5, duration: 0.15, ease: 'power2.out' })
      .to(beam, { alpha: 0, duration: 0.2, ease: 'power2.in' });
  }

  public createShockwave(x: number, y: number, radius: number): void {
    const wave = new Graphics();
    wave.circle(0, 0, 10);
    wave.stroke({ width: 6, color: 0xffd700, alpha: 1 });
    wave.x = x;
    wave.y = y;
    this.container.addChild(wave);

    gsap.to(wave, {
      width: radius * 2,
      height: radius * 2,
      alpha: 0,
      duration: 0.45,
      ease: 'power2.out',
      onComplete: () => {
        this.container.removeChild(wave);
        wave.destroy();
      },
    });
  }

  public createFloatingText(x: number, y: number, message: string, color = 0xffffff): void {
    const style = new TextStyle({
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 24,
      fontWeight: 'bold',
      fill: color,
      stroke: { color: 0x000000, width: 4 },
      dropShadow: {
        alpha: 0.5,
        angle: Math.PI / 6,
        blur: 4,
        color: 0x000000,
        distance: 3,
      },
    });

    const textObj = new Text({ text: message, style });
    textObj.anchor.set(0.5);
    textObj.x = x;
    textObj.y = y;
    this.container.addChild(textObj);

    gsap.timeline({
      onComplete: () => {
        this.container.removeChild(textObj);
        textObj.destroy();
      },
    })
      .fromTo(textObj.scale, { x: 0.5, y: 0.5 }, { x: 1.2, y: 1.2, duration: 0.2, ease: 'back.out(2)' })
      .to(textObj, { y: y - 45, alpha: 0, duration: 0.6, ease: 'power1.out' });
  }

  public screenShake(target: Container, intensity = 8): void {
    const originalX = target.x;
    const originalY = target.y;

    gsap.timeline({
      onComplete: () => {
        target.x = originalX;
        target.y = originalY;
      },
    })
      .to(target, { x: originalX + intensity, y: originalY - intensity, duration: 0.04 })
      .to(target, { x: originalX - intensity, y: originalY + intensity, duration: 0.04 })
      .to(target, { x: originalX + intensity * 0.5, y: originalY - intensity * 0.5, duration: 0.04 })
      .to(target, { x: originalX, y: originalY, duration: 0.04 });
  }
}
