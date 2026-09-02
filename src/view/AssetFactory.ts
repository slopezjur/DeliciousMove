import { GraphicsContext } from 'pixi.js';
import { TileColor, SpecialType } from '../core/TileTypes.ts';

export class AssetFactory {
  private static candyCache: Map<string, GraphicsContext> = new Map();
  private static cellBgCache: Map<string, GraphicsContext> = new Map();

  /**
   * Generates or retrieves a cached native PixiJS GraphicsContext for a given candy color & special status.
   */
  public static getCandyContext(color: TileColor, special: SpecialType = SpecialType.None): GraphicsContext {
    const key = `candy_${color}_${special}`;
    if (this.candyCache.has(key)) {
      return this.candyCache.get(key)!;
    }

    const ctx = new GraphicsContext();

    if (special === SpecialType.ColorBomb) {
      this.drawColorBomb(ctx);
    } else {
      this.drawCandyBase(ctx, color);

      // Draw special overlays
      if (special === SpecialType.StripedHorizontal) {
        this.drawStripesH(ctx);
      } else if (special === SpecialType.StripedVertical) {
        this.drawStripesV(ctx);
      } else if (special === SpecialType.Wrapped) {
        this.drawWrapper(ctx);
      }
    }

    this.candyCache.set(key, ctx);
    return ctx;
  }

  /**
   * Grid cell background tile GraphicsContext (frosted dark square)
   */
  public static getCellBgContext(isAlt: boolean): GraphicsContext {
    const key = `cell_bg_${isAlt ? 'alt' : 'main'}`;
    if (this.cellBgCache.has(key)) {
      return this.cellBgCache.get(key)!;
    }

    const ctx = new GraphicsContext();
    ctx.roundRect(-48, -48, 96, 96, 16);
    ctx.fill({ color: 0x000000, alpha: isAlt ? 0.32 : 0.20 });
    ctx.stroke({ color: 0xffffff, width: 2, alpha: 0.1 });

    this.cellBgCache.set(key, ctx);
    return ctx;
  }

  private static drawCandyBase(ctx: GraphicsContext, color: TileColor): void {
    switch (color) {
      case TileColor.Red: {
        // Jelly bean / Heart ruby
        ctx.ellipse(0, 0, 42, 33);
        ctx.fill({ color: 0xff1744 });
        ctx.ellipse(0, 3, 38, 28);
        ctx.stroke({ color: 0xb2002f, width: 3 });
        // Specular highlight
        ctx.ellipse(-12, -10, 16, 7);
        ctx.fill({ color: 0xffffff, alpha: 0.75 });
        break;
      }

      case TileColor.Blue: {
        // Glossy sphere
        ctx.circle(0, 0, 40);
        ctx.fill({ color: 0x0091ea });
        ctx.circle(0, 3, 36);
        ctx.stroke({ color: 0x005b9f, width: 3 });
        // Specular highlight
        ctx.ellipse(-12, -12, 12, 8);
        ctx.fill({ color: 0xffffff, alpha: 0.75 });
        break;
      }

      case TileColor.Green: {
        // Rounded square pillow
        ctx.roundRect(-36, -36, 72, 72, 18);
        ctx.fill({ color: 0x00c853 });
        ctx.roundRect(-32, -32, 64, 64, 14);
        ctx.stroke({ color: 0x00701a, width: 3 });
        // Specular highlight
        ctx.roundRect(-24, -24, 20, 12, 6);
        ctx.fill({ color: 0xffffff, alpha: 0.75 });
        break;
      }

      case TileColor.Yellow: {
        // 4-pointed star / diamond
        ctx.star(0, 0, 4, 44, 24);
        ctx.fill({ color: 0xffd600 });
        ctx.star(0, 2, 4, 38, 20);
        ctx.stroke({ color: 0xc79100, width: 2.5 });
        // Specular highlight
        ctx.circle(-8, -10, 8);
        ctx.fill({ color: 0xffffff, alpha: 0.8 });
        break;
      }

      case TileColor.Purple: {
        // Hexagon jewel
        const points = [-38, 0, -19, -36, 19, -36, 38, 0, 19, 36, -19, 36];
        ctx.poly(points);
        ctx.fill({ color: 0xaa00ff });
        const innerPoints = [-32, 0, -16, -30, 16, -30, 32, 0, 16, 30, -16, 30];
        ctx.poly(innerPoints);
        ctx.stroke({ color: 0x6a0080, width: 2.5 });
        // Specular highlight
        ctx.circle(-10, -14, 8);
        ctx.fill({ color: 0xffffff, alpha: 0.75 });
        break;
      }

      case TileColor.Orange: {
        // Rounded capsule
        ctx.roundRect(-42, -26, 84, 52, 26);
        ctx.fill({ color: 0xff6d00 });
        ctx.roundRect(-38, -22, 76, 44, 22);
        ctx.stroke({ color: 0xc43c00, width: 2.5 });
        // Specular highlight
        ctx.ellipse(-14, -8, 18, 6);
        ctx.fill({ color: 0xffffff, alpha: 0.75 });
        break;
      }
    }
  }

  private static drawStripesH(ctx: GraphicsContext): void {
    ctx.rect(-38, -14, 76, 7);
    ctx.fill({ color: 0xffffff, alpha: 0.95 });
    ctx.rect(-38, 7, 76, 7);
    ctx.fill({ color: 0xffffff, alpha: 0.95 });
  }

  private static drawStripesV(ctx: GraphicsContext): void {
    ctx.rect(-14, -38, 7, 76);
    ctx.fill({ color: 0xffffff, alpha: 0.95 });
    ctx.rect(7, -38, 7, 76);
    ctx.fill({ color: 0xffffff, alpha: 0.95 });
  }

  private static drawWrapper(ctx: GraphicsContext): void {
    ctx.roundRect(-44, -44, 88, 88, 12);
    ctx.stroke({ color: 0xffd700, width: 4.5, alpha: 0.95 });

    // Diagonal crinkles
    ctx.poly([-44, -44, -24, -24]);
    ctx.stroke({ color: 0xffffff, width: 3, alpha: 0.8 });
    ctx.poly([44, -44, 24, -24]);
    ctx.stroke({ color: 0xffffff, width: 3, alpha: 0.8 });
    ctx.poly([-44, 44, -24, 24]);
    ctx.stroke({ color: 0xffffff, width: 3, alpha: 0.8 });
    ctx.poly([44, 44, 24, 24]);
    ctx.stroke({ color: 0xffffff, width: 3, alpha: 0.8 });
  }

  private static drawColorBomb(ctx: GraphicsContext): void {
    // Chocolate truffle ball
    ctx.circle(0, 0, 42);
    ctx.fill({ color: 0x2e1509 });
    ctx.circle(0, 0, 42);
    ctx.stroke({ color: 0xffd700, width: 2.5, alpha: 0.7 });

    // Rainbow sprinkles
    const sprinkleColors = [0xff1744, 0x00e676, 0xffea00, 0x00e5ff, 0xd500f9, 0xff9100, 0xffffff];
    const sprinkleCount = 14;

    for (let i = 0; i < sprinkleCount; i++) {
      const angle = (Math.PI * 2 * i) / sprinkleCount + (i % 2) * 0.3;
      const dist = 14 + ((i * 9) % 22);
      const sx = Math.cos(angle) * dist;
      const sy = Math.sin(angle) * dist;
      const scolor = sprinkleColors[i % sprinkleColors.length];

      ctx.circle(sx, sy, 4.5);
      ctx.fill({ color: scolor });
    }
  }
}
