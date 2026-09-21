import { LanguageService } from '../i18n/LanguageService.ts';
import { IGameTelemetryReader, TelemetryMoveRecord, TelemetryStateSnapshot } from '../core/telemetry/IGameTelemetry.ts';
import { DebugOverlayView, DebugOverlayCallbacks } from '../ui/DebugOverlayView.ts';
import { IDebugOverlayView } from '../ui/IDebugOverlayView.ts';
import { IClipboardService } from '../ui/IClipboardService.ts';

export interface GameDebugApi {
  getHistory(n?: number): TelemetryMoveRecord[];
  getState(): TelemetryStateSnapshot;
  dump(): TelemetryStateSnapshot;
  copyReport(): Promise<boolean>;
  unlockInput(): void;
  forceShuffle(): void;
  toggleOverlay(): void;
}

declare global {
  interface Window { __GAME_DEBUG__?: GameDebugApi; }
}

/** Owns browser diagnostics and the optional overlay, independently of game lifecycle. */
export class GameDebugController {
  private readonly overlay?: IDebugOverlayView;

  constructor(
    telemetry: IGameTelemetryReader,
    actions: DebugOverlayCallbacks,
    clipboard: IClipboardService,
    overlay?: IDebugOverlayView,
    language = new LanguageService()
  ) {
    this.overlay = overlay ?? (
      typeof document !== 'undefined' && document.getElementById('debug-overlay')
        ? new DebugOverlayView(telemetry, actions, clipboard, language)
        : undefined
    );

    if (typeof window !== 'undefined') {
      window.__GAME_DEBUG__ = {
        getHistory: (n) => telemetry.getRecentMoves(n),
        getState: () => telemetry.getSnapshot(),
        dump: () => {
          const snapshot = telemetry.getSnapshot();
          console.log('[DeliciousMove]', snapshot);
          console.table(snapshot.recentMoves.slice(-10));
          return snapshot;
        },
        copyReport: () => this.overlay
          ? this.overlay.copyToClipboard()
          : clipboard.copyText(telemetry.exportDiagnosticJson()),
        unlockInput: actions.onUnlockInput,
        forceShuffle: actions.onForceShuffle,
        toggleOverlay: () => this.overlay?.toggle(),
      };
    }
  }

  public refresh(): void {
    this.overlay?.refresh();
  }
}
