import { Texture } from 'pixi.js';
import { TileColor, SpecialType } from '../core/TileTypes.ts';

export class AssetFactory {
  private static cache: Map<string, Texture> = new Map();
  private static readonly RESOLUTION = 128; // High DPI crisp texture

  /**
   * Generates or retrieves a cached PixiJS Texture for a given candy color & special status.
   */
  public static getCandyTexture(color: TileColor, special: SpecialType = SpecialType.None): Texture {
    const key = `candy_${color}_${special}`;
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.RESOLUTION;
    canvas.height = this.RESOLUTION;
    const ctx = canvas.getContext('2d')!;

    const cx = this.RESOLUTION / 2;
    const cy = this.RESOLUTION / 2;
    const r = this.RESOLUTION * 0.4;

    if (special === SpecialType.ColorBomb) {
      this.drawColorBomb(ctx, cx, cy, r);
    } else {
      this.drawCandyBase(ctx, color, cx, cy, r);

      // Draw special overlays
      if (special === SpecialType.StripedHorizontal) {
        this.drawStripesH(ctx, cx, cy, r);
      } else if (special === SpecialType.StripedVertical) {
        this.drawStripesV(ctx, cx, cy, r);
      } else if (special === SpecialType.Wrapped) {
        this.drawWrapper(ctx, cx, cy, r);
      }
    }

    const texture = Texture.from(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Grid cell background tile texture (frosted dark square)
   */
  public static getCellBgTexture(isAlt: boolean): Texture {
    const key = `cell_bg_${isAlt ? 'alt' : 'main'}`;
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.RESOLUTION;
    canvas.height = this.RESOLUTION;
    const ctx = canvas.getContext('2d')!;

    const pad = 4;
    const size = this.RESOLUTION - pad * 2;
    const radius = 16;

    ctx.fillStyle = isAlt ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.roundRect(pad, pad, size, size, radius);
    ctx.fill();

    // Subtle inner border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const texture = Texture.from(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  private static getColorPalette(color: TileColor): { top: string; mid: string; bottom: string; glow: string } {
    switch (color) {
      case TileColor.Red:
        return { top: '#ff5e7e', mid: '#ff1744', bottom: '#b2002f', glow: 'rgba(255, 23, 68, 0.4)' };
      case TileColor.Blue:
        return { top: '#40c4ff', mid: '#0091ea', bottom: '#005b9f', glow: 'rgba(0, 145, 234, 0.4)' };
      case TileColor.Green:
        return { top: '#69f0ae', mid: '#00c853', bottom: '#00701a', glow: 'rgba(0, 200, 83, 0.4)' };
      case TileColor.Yellow:
        return { top: '#ffff52', mid: '#ffd600', bottom: '#c79100', glow: 'rgba(255, 214, 0, 0.4)' };
      case TileColor.Purple:
        return { top: '#ea80fc', mid: '#aa00ff', bottom: '#6a0080', glow: 'rgba(170, 0, 255, 0.4)' };
      case TileColor.Orange:
        return { top: '#ffab40', mid: '#ff6d00', bottom: '#c43c00', glow: 'rgba(255, 109, 0, 0.4)' };
    }
  }

  private static drawCandyBase(
    ctx: CanvasRenderingContext2D,
    color: TileColor,
    cx: number,
    cy: number,
    r: number
  ): void {
    const palette = this.getColorPalette(color);

    // Outer glow / shadow
    ctx.save();
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;

    // Body Gradient
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    grad.addColorStop(0, palette.top);
    grad.addColorStop(0.55, palette.mid);
    grad.addColorStop(1, palette.bottom);

    ctx.fillStyle = grad;
    ctx.beginPath();
    this.drawDistinctShape(ctx, color, cx, cy, r);
    ctx.fill();
    ctx.restore();

    // Specular Highlight
    ctx.save();
    ctx.beginPath();
    this.drawDistinctShape(ctx, color, cx, cy, r);
    ctx.clip();

    const specGrad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 2, cx - r * 0.3, cy - r * 0.35, r * 0.55);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    specGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.35, r * 0.45, r * 0.25, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    // Bottom rim light
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.1, r * 0.75, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();

    ctx.restore();
  }

  private static drawDistinctShape(
    ctx: CanvasRenderingContext2D,
    color: TileColor,
    cx: number,
    cy: number,
    r: number
  ): void {
    switch (color) {
      case TileColor.Red: // Jelly bean
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 0.95, r * 0.75, 0, 0, Math.PI * 2);
        break;
      case TileColor.Blue: // Perfect Sphere
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
        break;
      case TileColor.Green: // Rounded Square Pillow
        ctx.roundRect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6, r * 0.35);
        break;
      case TileColor.Yellow: // Teardrop / Star Diamond
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.95);
        ctx.lineTo(cx + r * 0.9, cy);
        ctx.lineTo(cx, cy + r * 0.95);
        ctx.lineTo(cx - r * 0.9, cy);
        ctx.closePath();
        break;
      case TileColor.Purple: // Hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = cx + Math.cos(angle) * r * 0.9;
          const py = cy + Math.sin(angle) * r * 0.9;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      case TileColor.Orange: // Rounded Capsule
        ctx.beginPath();
        ctx.roundRect(cx - r * 0.9, cy - r * 0.65, r * 1.8, r * 1.3, r * 0.5);
        break;
    }
  }

  private static drawStripesH(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;

    const offsets = [-r * 0.45, 0, r * 0.45];
    for (const off of offsets) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy + off);
      ctx.lineTo(cx + r * 0.85, cy + off);
      ctx.stroke();
    }
    ctx.restore();
  }

  private static drawStripesV(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;

    const offsets = [-r * 0.45, 0, r * 0.45];
    for (const off of offsets) {
      ctx.beginPath();
      ctx.moveTo(cx + off, cy - r * 0.85);
      ctx.lineTo(cx + off, cy + r * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  private static drawWrapper(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    // Shiny packaging frills on corners
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;

    // Outer golden frame
    ctx.strokeRect(cx - r * 0.95, cy - r * 0.95, r * 1.9, r * 1.9);

    // Crinkle diagonals
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx - r * 0.5, cy - r * 0.5);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
    ctx.moveTo(cx - r, cy + r);
    ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
    ctx.moveTo(cx + r, cy + r);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
    ctx.stroke();

    ctx.restore();
  }

  private static drawColorBomb(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    // Chocolate truffle ball
    ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
    ctx.shadowBlur = 15;

    const chocGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 4, cx, cy, r);
    chocGrad.addColorStop(0, '#54301a');
    chocGrad.addColorStop(0.6, '#2e1509');
    chocGrad.addColorStop(1, '#110602');

    ctx.fillStyle = chocGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
    ctx.fill();

    // Rainbow sprinkles
    const sprinkleColors = ['#ff1744', '#00e676', '#ffea00', '#00e5ff', '#d500f9', '#ff9100', '#ffffff'];
    const sprinkleCount = 18;

    for (let i = 0; i < sprinkleCount; i++) {
      const angle = (Math.PI * 2 * i) / sprinkleCount + (i % 2) * 0.3;
      const dist = (r * 0.3) + ((i * 13) % (r * 0.5));
      const sx = cx + Math.cos(angle) * dist;
      const sy = cy + Math.sin(angle) * dist;
      const scolor = sprinkleColors[i % sprinkleColors.length];

      ctx.save();
      ctx.fillStyle = scolor;
      ctx.shadowColor = scolor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 5, 3, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }
}
