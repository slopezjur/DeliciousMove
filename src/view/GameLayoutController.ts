import type { Application } from 'pixi.js';
import type { IBoardView } from './IBoardViewContracts.ts';

/** Owns viewport observation and defers renderer resizing until turn playback settles. */
export class GameLayoutController {
  private viewport: HTMLElement | null = null;
  private observer?: ResizeObserver;
  private pending = false;
  private readonly requestResize = () => this.resize();

  constructor(
    private readonly app: Pick<Application, 'canvas' | 'stage' | 'renderer'>,
    private readonly view: Pick<IBoardView, 'displayObject' | 'updateLayout'>,
    private readonly isPlaying: () => boolean
  ) {}

  attach(container: HTMLElement): void {
    this.viewport = document.getElementById('board-viewport');
    (this.viewport ?? container).appendChild(this.app.canvas);
    this.app.stage.addChild(this.view.displayObject);
    window.addEventListener('resize', this.requestResize);
    document.addEventListener('fullscreenchange', this.requestResize);
    window.visualViewport?.addEventListener('resize', this.requestResize);
    if (this.viewport && typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.requestResize);
      this.observer.observe(this.viewport);
    }
  }

  resize(): void {
    if (this.isPlaying()) { this.pending = true; return; }
    this.pending = false;
    const width = this.viewport?.clientWidth ?? window.innerWidth;
    const height = this.viewport?.clientHeight ?? window.innerHeight;
    if (width <= 0 || height <= 0) return;
    this.app.renderer?.resize(width, height);
    this.view.updateLayout(width, height);
  }

  flush(): void { if (this.pending) this.resize(); }

  dispose(): void {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.requestResize);
    document.removeEventListener('fullscreenchange', this.requestResize);
    window.visualViewport?.removeEventListener('resize', this.requestResize);
  }
}
