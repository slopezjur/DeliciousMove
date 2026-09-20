import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';

describe('headless browser environment', () => {
  it('provides navigator before static Pixi imports', () => {
    const container = new Container();
    expect(navigator.userAgent).toBe('DeliciousMove headless tests');
    expect(navigator.language).toBe('en-US');
    container.destroy();
  });

  it('allows individual tests to override the browser language', () => {
    vi.stubGlobal('navigator', { userAgent: 'test override', language: 'es-ES' });
    expect(navigator.language).toBe('es-ES');
  });

  it('reinstalls the baseline after per-test global cleanup', () => {
    expect(navigator.userAgent).toBe('DeliciousMove headless tests');
    expect(navigator.language).toBe('en-US');
    expect(navigator.languages).toEqual(['en-US']);
  });
});
