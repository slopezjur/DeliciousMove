import { afterEach, beforeEach, vi } from 'vitest';

function installNavigator(): void {
  vi.stubGlobal('navigator', {
    userAgent: 'DeliciousMove headless tests',
    language: 'en-US',
    languages: ['en-US'],
  });
}

// Pixi reads navigator during module evaluation, before test hooks run.
installNavigator();
// Individual suites restore globals; reinstall the fixture for every test.
beforeEach(installNavigator);
afterEach(() => vi.unstubAllGlobals());
