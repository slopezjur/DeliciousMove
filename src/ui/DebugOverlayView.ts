import { IGameTelemetryService } from '../core/telemetry/IGameTelemetry.ts';
import { IDebugOverlayView } from './IDebugOverlayView.ts';
import { IClipboardService } from './IClipboardService.ts';
import { BrowserClipboardService } from './ClipboardService.ts';

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
    clipboardService: IClipboardService = new BrowserClipboardService()
  ) {
    this.telemetry = telemetry;
    this.callbacks = callbacks;
    this.clipboardService = clipboardService;

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
        const orig = btn.textContent;
        btn.textContent = success ? '✅ Copied!' : '❌ Copy Failed';
        setTimeout(() => {
          btn.textContent = orig;
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
      .join(', ') || 'None';

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
          <span class="dbg-label">State</span>
          <span class="dbg-val ${snap.isInputLocked ? 'dbg-warn' : ''}">${snap.state} (Locked: ${snap.isInputLocked})</span>
        </div>
        <div class="dbg-card">
          <span class="dbg-label">Level / Diff</span>
          <span class="dbg-val">L${snap.level} (${snap.difficulty.toUpperCase()})</span>
        </div>
        <div class="dbg-card">
          <span class="dbg-label">Moves Left</span>
          <span class="dbg-val">${snap.movesLeft} (Banked: ${snap.accumulatedBonusMoves})</span>
        </div>
        <div class="dbg-card">
          <span class="dbg-label">Possible Moves</span>
          <span class="dbg-val ${snap.possibleMovesCount === 0 ? 'dbg-danger' : ''}">${snap.possibleMovesCount}</span>
        </div>
        <div class="dbg-card" style="grid-column: span 2;">
          <span class="dbg-label">Score / Target</span>
          <span class="dbg-val">${snap.score.toLocaleString()} / ${snap.targetScore.toLocaleString()}</span>
        </div>
        <div class="dbg-card" style="grid-column: span 2;">
          <span class="dbg-label">Specials on Board</span>
          <span class="dbg-val">${specialsStr}</span>
        </div>
      </div>

      <div class="dbg-section">
        <div class="dbg-section-title">Recent Moves (Last 8)</div>
        <div class="dbg-table-wrap">
          <table class="dbg-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Pos</th>
                <th>OK</th>
                <th>Score</th>
                <th>Steps</th>
                <th>Specials</th>
              </tr>
            </thead>
            <tbody>
              ${recentRows || '<tr><td colspan="7" style="text-align:center;">No moves recorded yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="dbg-section">
        <div class="dbg-section-title">Board Grid ASCII Dump</div>
        <pre class="dbg-ascii">${snap.boardAscii}</pre>
      </div>
    `;
  }
}
