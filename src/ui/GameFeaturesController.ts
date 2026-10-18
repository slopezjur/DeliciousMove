import type { Board } from '../core/Board.ts';
import type { ICollectionPreferences } from '../core/Collection.ts';
import { GameState, type IGameSession } from '../core/GameSession.ts';
import type { ILocalization } from '../i18n/ILanguageService.ts';
import { lessonMove } from '../modes/Laboratory.ts';
import type { IModeProgress } from '../modes/ModeProgress.ts';
import type { PlayMode } from '../modes/PlayMode.ts';
import type { IBoardView } from '../view/IBoardViewContracts.ts';
import { CollectionView } from './CollectionView.ts';
import { JourneyView, type IJourneyChooser } from './JourneyView.ts';
import { PlayModesView } from './PlayModesView.ts';
import type { IClipboardService } from './IClipboardService.ts';

interface FeatureDependencies {
  language: ILocalization;
  mode: PlayMode;
  collection: ICollectionPreferences;
  progress: Pick<IModeProgress, 'lessonDone'>;
  session: Pick<IGameSession, 'getState' | 'isBonusPhase' | 'getSnapshot' | 'getLevelConfig'>;
  board: Pick<Board, 'mechanics' | 'getCells'>;
  boardView: Pick<IBoardView, 'setTileSelected'>;
  clipboard?: IClipboardService;
  isPlaying(): boolean;
  onRestart(): void;
  onFinishBonus(): void;
  onLayoutChanged(): void;
}

/** Owns feature controls and adapts domain snapshots to presentation-only status data. */
export class GameFeaturesController {
  private journeyChooser?: IJourneyChooser;
  private modes?: PlayModesView;

  constructor(private readonly deps: FeatureDependencies) {}

  get journey(): IJourneyChooser | undefined { return this.journeyChooser; }

  init(): void {
    if (!document.getElementById('play-modes-btn')) return;
    const { language, mode, collection, onRestart, onLayoutChanged } = this.deps;
    this.journeyChooser = new JourneyView(language);
    this.modes = new PlayModesView(language, mode, collection, onRestart, this.deps.clipboard);
    const recipes = new CollectionView(language, collection, theme => {
      collection.chooseTheme(theme);
      document.body.dataset.boardTheme = collection.snapshot().theme;
      onLayoutChanged();
    });
    document.body.dataset.boardTheme = collection.snapshot().theme;
    for (const id of ['play-modes-btn', 'modal-modes-btn']) {
      document.getElementById(id)?.addEventListener('click', () => { if (!this.deps.isPlaying()) this.modes!.open(); });
    }
    document.getElementById('recipe-book-btn')?.addEventListener('click', () => { if (!this.deps.isPlaying()) recipes.open(); });
    document.getElementById('finish-bonus-btn')?.addEventListener('click', () => {
      if (!this.canFinishBonus()) return;
      (document.getElementById('bonus-info-dialog') as HTMLDialogElement | null)?.close();
      this.deps.onFinishBonus();
    });
    if (mode.kind !== 'campaign') {
      document.body.dataset.playMode = mode.kind;
      document.getElementById('new-game-btn')?.setAttribute('data-i18n', 'retryLesson');
    }
  }

  highlightLesson(): void {
    if (this.deps.mode.kind === 'lab') this.deps.boardView.setTileSelected(lessonMove(this.deps.mode.lesson).from, true);
  }

  refresh(): void {
    if (typeof document === 'undefined') return;
    const busy = this.deps.isPlaying();
    const finish = document.getElementById('finish-bonus-btn') as HTMLButtonElement | null;
    if (finish) finish.disabled = !this.canFinishBonus();
    for (const id of ['play-modes-btn', 'modal-modes-btn', 'recipe-book-btn']) {
      const control = document.getElementById(id) as HTMLButtonElement | null;
      if (control) control.disabled = busy;
    }
    const { board, session, progress } = this.deps;
    const mechanics = board.mechanics;
    const bossCountdown = mechanics?.boss && board.getCells().some(cell => cell.bossShielded !== undefined)
      ? mechanics.boss.period - mechanics.turns % mechanics.boss.period : undefined;
    this.modes?.update(session.getSnapshot(), session.getLevelConfig(), { lessonDone: progress.lessonDone, bossCountdown });
  }

  private canFinishBonus(): boolean {
    return !this.deps.isPlaying() && this.deps.session.getState() === GameState.Ready && this.deps.session.isBonusPhase();
  }
}
