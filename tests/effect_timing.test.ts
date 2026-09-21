import { afterEach, describe, expect, it, vi } from 'vitest';
import gsap from 'gsap';
import { Board } from '../src/core/Board.ts';
import { SpecialType, TileColor } from '../src/core/TileTypes.ts';
import { BoardView } from '../src/view/BoardView.ts';
import { SoundManager } from '../src/audio/SoundManager.ts';
import { ColorBombPresenter, StripedBeamPresenter } from '../src/view/vfx/EffectPresenterRegistry.ts';
import { VFXManager } from '../src/view/VFXManager.ts';
import { Container } from 'pixi.js';

afterEach(() => vi.unstubAllGlobals());

describe('special effect timing', () => {
  it('awaits the entire vertical beam, centered across the column even from an edge source', async () => {
    const board = new Board(), source = board.createTile(7, 3, TileColor.Red, SpecialType.StripedVertical);
    const view = new BoardView(board); view.initFromBoard(); view.updateLayout(600, 600);
    let finish = () => {};
    const laser = vi.spyOn(view.vfx, 'createLaserBeam').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    try {
      let completed = false;
      const pos = view.gridToLocal(7, 3);
      const playing = new StripedBeamPresenter().present({ sourceTile: source, affectedTileIds: [source.id], effectType: source.special },
        { boardView: view, sound: new SoundManager(), position: pos }).then(() => { completed = true; });
      await Promise.resolve();
      expect(completed).toBe(false);
      expect(laser).toHaveBeenCalledWith(pos.x, view.boardPixelHeight / 2, view.boardPixelHeight, false);
      finish(); await playing;
      expect(completed).toBe(true);
    } finally { view.destroy({ children: true }); }
  });

  it('awaits color-bomb charge before the shockwave and uses current visual target positions', async () => {
    const board = new Board(), source = board.createTile(0, 0, TileColor.Red, SpecialType.ColorBomb), target = board.createTile(3, 3, TileColor.Blue);
    const view = new BoardView(board); view.initFromBoard();
    let finish = () => {};
    const charge = vi.spyOn(view.vfx as VFXManager, 'createColorBombCharge').mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const shock = vi.spyOn(view.vfx, 'createShockwave').mockImplementation(() => {});
    vi.spyOn(view, 'screenShake').mockImplementation(() => {});
    try {
      const sprite = view.getTileSprite(target.id)!; sprite.x = 123; sprite.y = 234;
      const pos = view.gridToLocal(0, 0);
      const playing = new ColorBombPresenter().present({ sourceTile: source, affectedTileIds: [target.id], effectType: SpecialType.ColorBomb },
        { boardView: view, sound: new SoundManager(), position: pos });
      expect(charge).toHaveBeenCalledWith(pos.x, pos.y, [{ x: 123, y: 234 }]);
      expect(shock).not.toHaveBeenCalled();
      finish(); await playing;
      expect(shock).toHaveBeenCalledOnce();
    } finally { view.destroy({ children: true }); }
  });

  it.each([false, true])('cleans up real charge graphics with reduced motion = %s', async reduced => {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
    const container = new Container(), vfx = new VFXManager(container);
    const speed = gsap.globalTimeline.timeScale(); gsap.globalTimeline.timeScale(30);
    try {
      const playing = vfx.createColorBombCharge(10, 10, [{ x: 100, y: 200 }, { x: 150, y: 300 }]);
      expect(container.children.length).toBe(reduced ? 1 : 3);
      await playing;
      expect(container.children).toHaveLength(0);
    } finally { gsap.globalTimeline.timeScale(speed); container.destroy({ children: true }); }
  });
});
