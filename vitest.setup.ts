import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// waitFor defaults to one second, which the debounced-search screens can exceed
// when the whole suite runs in parallel under coverage instrumentation. This is
// a ceiling, not a delay: a passing assertion still returns immediately.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom implements neither of these, and react-aria's overlays reach for both.
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
