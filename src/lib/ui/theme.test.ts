/**
 * The half of the theme that runs before React does. These assertions are about
 * one element — `<html>` — because that element is the whole interface between
 * a stored choice and the stylesheet.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyStoredTheme,
  isThemeChoice,
  THEME_BOOT_SCRIPT,
  THEME_CHOICES,
  THEME_STORAGE_KEY,
} from './theme';

/** A `matchMedia` that answers one way and can be asked again. */
function stubPreference(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: prefersDark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const root = () => document.documentElement;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  root().className = '';
  root().removeAttribute('data-theme');
});

describe('isThemeChoice', () => {
  it('accepts the three it offers', () => {
    for (const choice of THEME_CHOICES) expect(isThemeChoice(choice)).toBe(true);
  });

  it('rejects anything else, including what an empty slot returns', () => {
    expect(isThemeChoice(null)).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
    expect(isThemeChoice('Dark')).toBe(false);
    expect(isThemeChoice(1)).toBe(false);
  });
});

describe('applyStoredTheme', () => {
  it('takes a stored dark over a light device', () => {
    stubPreference(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    applyStoredTheme();

    expect(root()).toHaveClass('dark');
    expect(root()).not.toHaveClass('light');
    expect(root()).toHaveAttribute('data-theme', 'dark');
  });

  it('takes a stored light over a dark device', () => {
    stubPreference(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');

    applyStoredTheme();

    expect(root()).toHaveClass('light');
    expect(root()).toHaveAttribute('data-theme', 'light');
  });

  it('asks the device when nothing has been chosen', () => {
    stubPreference(true);

    applyStoredTheme();

    expect(root()).toHaveAttribute('data-theme', 'dark');
  });

  it('asks the device when the choice is to follow it', () => {
    stubPreference(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'system');

    applyStoredTheme();

    expect(root()).toHaveAttribute('data-theme', 'light');
  });

  it('asks the device about a value it does not recognise', () => {
    // Hand-edited storage, or a key this app once wrote something else into.
    stubPreference(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');

    applyStoredTheme();

    expect(root()).toHaveAttribute('data-theme', 'dark');
  });

  it('swaps the class rather than leaving both on the element', () => {
    // `.dark` and `[data-theme="light"]` on one element resolves to dark, so a
    // leftover class is a wrong answer rather than a stale one.
    stubPreference(false);
    root().classList.add('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');

    applyStoredTheme();

    expect(root()).not.toHaveClass('dark');
    expect(root()).toHaveClass('light');
  });

  it('keeps the classes the page already had', () => {
    stubPreference(true);
    root().classList.add('__variable_inter');

    applyStoredTheme();

    expect(root()).toHaveClass('__variable_inter');
    expect(root()).toHaveClass('dark');
  });

  it('does nothing loudly when storage is refused', () => {
    // Some browsers throw on localStorage rather than returning nothing.
    stubPreference(true);
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });

    expect(() => applyStoredTheme()).not.toThrow();
    expect(root()).not.toHaveAttribute('data-theme');
  });
});

describe('THEME_BOOT_SCRIPT', () => {
  it('carries the storage key rather than a reference to it', () => {
    // The script is read by a browser that has none of this module's names, so
    // the literal inside the function has to be the constant beside it.
    expect(THEME_BOOT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  it('still works once it has been through toString and back', () => {
    stubPreference(true);

    new Function(THEME_BOOT_SCRIPT)();

    expect(root()).toHaveAttribute('data-theme', 'dark');
  });
});
