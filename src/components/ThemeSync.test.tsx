import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { ThemeSync } from './ThemeSync';
import { THEME_STORAGE_KEY } from '@/lib/ui/theme';

/** A device preference that can be changed, and told the page about it. */
function stubPreference(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => void listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => list);
  return {
    listeners,
    switchTo(dark: boolean) {
      list.matches = dark;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

const root = () => document.documentElement;

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  root().className = '';
  root().removeAttribute('data-theme');
});

describe('ThemeSync', () => {
  it('draws nothing', () => {
    stubPreference(false);
    const { container } = render(<ThemeSync />);
    expect(container).toBeEmptyDOMElement();
  });

  it('settles the appearance on mount, whatever the document was left holding', () => {
    stubPreference(true);
    render(<ThemeSync />);
    expect(root()).toHaveAttribute('data-theme', 'dark');
  });

  it('follows the device when the device is what was chosen', () => {
    const device = stubPreference(false);
    render(<ThemeSync />);
    expect(root()).toHaveAttribute('data-theme', 'light');

    device.switchTo(true);

    expect(root()).toHaveAttribute('data-theme', 'dark');
    expect(root()).toHaveClass('dark');
    expect(root()).not.toHaveClass('light');
  });

  it('leaves a chosen appearance alone when the device changes under it', () => {
    // The listener asked for light on a machine that goes dark at sunset. The
    // sunset is not a second opinion.
    const device = stubPreference(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(<ThemeSync />);

    device.switchTo(true);

    expect(root()).toHaveAttribute('data-theme', 'light');
  });

  it('stops listening once the page is gone', () => {
    const device = stubPreference(false);
    const { unmount } = render(<ThemeSync />);
    expect(device.listeners.size).toBe(1);

    unmount();

    expect(device.listeners.size).toBe(0);
  });
});
