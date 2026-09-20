import { Graphics } from 'pixi.js';
import { CellState } from '../core/BoardFeatures.ts';

/** Cell overlays are driven by step snapshots, never by the already-resolved future board. */
export class TerrainView extends Graphics {
  public renderCells(cells: readonly CellState[], size: number): void {
    this.clear();
    for (const cell of cells) {
      if (!cell.playable) continue;
      const x = cell.col * size, y = cell.row * size;
      if (cell.jelly > 0) {
        this.roundRect(x + 3, y + 3, size - 6, size - 6, size * .16)
          .stroke({ color: 0xff7ce4, width: Math.max(3, size * .06), alpha: .9 });
      }
      if (cell.ice > 0) {
        this.roundRect(x + 2, y + 2, size - 4, size - 4, size * .1)
          .fill({ color: 0xb5efff, alpha: .48 }).stroke({ color: 0xdaf8ff, width: 3 });
        this.moveTo(x + size * .15, y + size * .15).lineTo(x + size * .85, y + size * .85)
          .moveTo(x + size * .85, y + size * .15).lineTo(x + size * .15, y + size * .85)
          .stroke({ color: 0xffffff, width: 2, alpha: .7 });
        for (let i = 0; i < cell.ice; i++) this.circle(x + size * (.4 + i * .2), y + size * .15, size * .05).fill(0x095586);
      }
      if (cell.exit) {
        this.roundRect(x + size * .12, y + size * .83, size * .76, size * .14, 3).fill({ color: 0x122e29, alpha: .95 });
        this.moveTo(x + size * .36, y + size * .85).lineTo(x + size * .5, y + size * .97)
          .lineTo(x + size * .64, y + size * .85).fill(0x7affb4);
      }
    }
  }
}
