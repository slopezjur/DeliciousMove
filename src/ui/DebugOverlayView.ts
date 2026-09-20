import { LanguageService } from '../i18n/LanguageService.ts';
import { IGameTelemetryService } from '../core/telemetry/IGameTelemetry.ts';
import { IDebugOverlayView } from './IDebugOverlayView.ts';
import { IClipboardService } from './IClipboardService.ts';
import { BrowserClipboardService } from './ClipboardService.ts';
import { objectiveLabel } from './ObjectivesView.ts';

export interface DebugOverlayCallbacks {
  onUnlockInput: () => void;
  onForceShuffle: () => void;
}

export class DebugOverlayView implements IDebugOverlayView {
  private readonly telemetry: IGameTelemetryService;
  private readonly callbacks: DebugOverlayCallbacks;
  private readonly clipboardService: IClipboardService;

  private overlayEl: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private isOpen = false;

  constructor(
    telemetry: IGameTelemetryService,
    callbacks: DebugOverlayCallbacks,
    clipboardService: IClipboardService = new BrowserClipboardService(),
    private readonly language = new LanguageService()
  ) {
    this.telemetry = telemetry;
    this.callbacks = callbacks;
    this.clipboardService = clipboardService;

    language.subscribe(() => this.refresh());
    this.initElements();
    this.bindKeyboardShortcut();
  }

  private initElements(): void {
    if (typeof document === 'undefined') return;

    this.overlayEl = document.getElementById('debug-overlay');
    this.toggleBtn = document.getElementById('debug-toggle-btn');
    this.contentEl = document.getElementById('debug-overlay-content');

    this.toggleBtn?.addEventListener('click', () => this.toggle());

    document.getElementById('debug-btn-close')?.addEventListener('click', () => this.hide());
    document.getElementById('debug-btn-copy')?.addEventListener('click', async () => {
      const success = await this.copyToClipboard();
      const btn = document.getElementById('debug-btn-copy');
      if (btn) {

        btn.textContent = this.language.t(success ? 'copied' : 'copyFailed');
        setTimeout(() => {
          btn.textContent = this.language.t('copy');
        }, 1500);
      }
    });

    document.getElementById('debug-btn-unlock')?.addEventListener('click', () => {
      this.callbacks.onUnlockInput();
      this.refresh();
    });

    document.getElementById('debug-btn-shuffle')?.addEventListener('click', () => {
      this.callbacks.onForceShuffle();
      this.refresh();
    });
  }

  private bindKeyboardShortcut(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') {
        this.toggle();
      }
    });
  }

  public async copyToClipboard(): Promise<boolean> {
    return this.clipboardService.copyText(this.telemetry.exportDiagnosticJson());
  }

  public toggle(): void {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  public show(): void {
    this.isOpen = true;
    this.overlayEl?.classList.remove('hidden');
    this.refresh();
  }

  public hide(): void {
    this.isOpen = false;
    this.overlayEl?.classList.add('hidden');
  }

  public refresh(): void {
    if (!this.isOpen || !this.contentEl) return;
    const snap = this.telemetry.getSnapshot();

    const specialsStr = Object.entries(snap.specialsOnBoard)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ') || this.language.t('none');

    const recentRows = snap.recentMoves
      .slice(-8)
      .reverse()
      .map((m) => {
        const posStr = m.from
          ? m.to
            ? `(${m.from.row},${m.from.col})→(${m.to.row},${m.to.col})`
            : `(${m.from.row},${m.from.col})`
          : '-';
        const specialsEvent = [
          ...m.specialsFormed.map((s) => `+${s}`),
          ...m.specialsTriggered.map((s) => `💥${s}`),
        ].join(' ');

        return `<tr>
          <td>${m.timestamp}</td>
          <td><span class="dbg-action dbg-${m.action}">${m.action.toUpperCase()}</span></td>
          <td>${posStr}</td>
          <td>${m.valid ? '✅' : '❌'}</td>
          <td>+${m.scoreGained}</td>
          <td>${m.cascadeStepsCount}</td>
          <td>${specialsEvent || '-'}</td>
        </tr>`;
      })
      .join('');

    this.contentEl.innerHTML = `
      <div class="dbg-grid">
        <div class="dbg-card">
          <span class="dbg-label">${this.language.t('state')}</span>
          <span class="dbg-val ${snap.isInputLocked ? 'dbg-warn' : ''}">${snap.state} (${this.language.t('locked')}: ${snap.isInputLocked})</span>
        </div>
        <div class="dbg-card">
          <span class="dbg-label">${this.language.t('levelDifficulty')}</span>
          <span class="dbg-val">L${snap.level} (${this.language.t(snap.difficulty)})</span>
        </div>
        <div class="dbg-card">
          <span class="dbg-label">${this.language.t('movesLeft')}</span>
          <span class="dbg-val">${snap.movesLeft} (${this.language.t('bank')}: ${snap.accumulatedBonusMoves})</span>
        </div>
        <div class="dbg-card">
          <span class="dbg-label">${this.language.t('possibleMoves')}</span>
          <span class="dbg-val ${snap.possibleMovesCount === 0 ? 'dbg-danger' : ''}">${snap.possibleMovesCount}</span>
        </div>
        <div class="dbg-card" style="grid-column: span 2;">
          <span class="dbg-label">${this.language.t('scoreTarget')}</span>
          <span class="dbg-val">${snap.score.toLocaleString(this.language.locale)} / ${snap.targetScore.toLocaleString(this.language.locale)}</span>
        </div>
        <div class="dbg-card" style="grid-column: span 2;">
          <span class="dbg-label">${this.language.t('boardSpecials')}</span>
          <span class="dbg-val">${specialsStr}</span>
        </div>
      </div>

      <div class="dbg-section">
        <div class="dbg-section-title">${this.language.t('objectives')}</div>
        <div>${(snap.objectives ?? []).map(p => `${objectiveLabel(this.language, p.objective)}: ${p.current}/${p.objective.target}`).join(' · ')}</div>
        <div>${Object.entries(snap.blockersOnBoard ?? {}).map(([kind, count]) => `${kind}: ${count}`).join(' · ')}</div>
      </div>

      <div class="dbg-section">
        <div class="dbg-section-title">${this.language.t('recentMoves')}</div>
        <div class="dbg-table-wrap">
          <table class="dbg-table">
            <thead>
              <tr>
                <th>${this.language.t('time')}</th>
                <th>${this.language.t('action')}</th>
                <th>${this.language.t('position')}</th>
                <th>OK</th>
                <th>${this.language.t('score')}</th>
                <th>${this.language.t('steps')}</th>
                <th>${this.language.t('specials')}</th>
              </tr>
            </thead>
            <tbody>
              ${recentRows || '<tr><td colspan="7" style="text-align:center;">' + this.language.t('noMoves') + '</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="dbg-section">
        <div class="dbg-section-title">${this.language.t('boardDump')}</div>
        <pre class="dbg-ascii">${snap.boardAscii}</pre>
      </div>
    `;
  }
}
