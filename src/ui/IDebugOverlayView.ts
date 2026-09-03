/**
 * Abstraction for debug & telemetry overlay presentation (DIP & ISP).
 */
export interface IDebugOverlayView {
  show(): void;
  hide(): void;
  toggle(): void;
  refresh(): void;
  copyToClipboard(): Promise<boolean>;
}
