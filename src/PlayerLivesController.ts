import type { IGameSession } from './core/GameSession.ts';
import type { IInputController } from './input/InputController.ts';
import type { IIdleHintController } from './input/IIdleHintController.ts';
import type { ILivesReader, LivesSnapshot, ResourceStatus } from './persistence/PlayerResources.ts';
import type { IGameModalView } from './ui/IGameModalView.ts';

interface LivesDisplay { render(snapshot: LivesSnapshot, status: ResourceStatus): void }

/** Refreshes regenerated lives and keeps the controls, hints, HUD, and modal in sync. */
export class PlayerLivesController {
  private timer?: ReturnType<typeof setInterval>;
  private readonly onRefresh = () => this.refresh();

  constructor(
    private readonly resources: ILivesReader,
    private readonly session: Pick<IGameSession, 'canMakeMove'>,
    private readonly view: LivesDisplay,
    private readonly modal: Pick<IGameModalView, 'updateLives'>,
    private readonly input: IInputController,
    private readonly hints: Pick<IIdleHintController, 'start' | 'stop'>,
    private readonly isPlaying: () => boolean
  ) {}

  canPlay(): boolean { return this.resources.snapshot().lives > 0 && this.session.canMakeMove(); }

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(this.onRefresh, 1000);
    document.addEventListener('visibilitychange', this.onRefresh);
  }

  refresh(): void {
    const snapshot = this.resources.snapshot();
    this.view.render(snapshot, this.resources.status);
    this.modal.updateLives(snapshot);
    if (this.isPlaying()) return;
    const playable = snapshot.lives > 0 && this.session.canMakeMove();
    const wasLocked = this.input.isLocked();
    if (wasLocked === playable) this.input.setLocked(!playable);
    if (!playable) this.hints.stop();
    else if (wasLocked) this.hints.start();
  }

  dispose(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    document.removeEventListener('visibilitychange', this.onRefresh);
  }
}
