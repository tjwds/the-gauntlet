/**
 * Which appearance the listener asked for, and how it reaches the page.
 *
 * HeroUI owns the switch once React is running: `useTheme` reads and writes
 * `heroui-theme`, and puts the resolved name on `<html>` as both a class and
 * `data-theme`, which is what its stylesheet keys off. What it can't do is get
 * there before the first paint, so `applyStoredTheme` below does that job
 * twice — once as a blocking script in the document, and again whenever the OS
 * preference moves under a page that is following it.
 */

/** HeroUI's key, not ours: `useTheme` is the other half of this. */
export const THEME_STORAGE_KEY = 'heroui-theme';

/** What the listener picked. `system` defers to the OS, and is the default. */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** In the order they're offered, which is least specific first. */
export const THEME_CHOICES = ['system', 'light', 'dark'] as const satisfies readonly ThemeChoice[];

/** Storage is a text field like any other, so what comes back is checked. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Put the stored appearance on `<html>`, asking the OS when the stored choice
 * defers to it — and anything that isn't `light` or `dark` defers to it,
 * including nothing stored at all.
 *
 * This function is serialised into the document with `toString()`, so it has to
 * stand on its own: every value it needs is written out here rather than
 * referred to, because a reference to anything else in this module is a
 * reference to a name that doesn't exist by the time the browser runs the copy
 * in the page. `theme.test.ts` holds the two literals to the constants above.
 */
export function applyStoredTheme(): void {
  try {
    const stored = window.localStorage.getItem('heroui-theme');
    const dark =
      stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    // Both, because the stylesheet accepts either and `useTheme` writes both.
    // The removal is what keeps a class from an earlier answer off the element:
    // `.dark` and `[data-theme="light"]` on the same element resolves to dark.
    root.classList.remove(dark ? 'light' : 'dark');
    root.classList.add(dark ? 'dark' : 'light');
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch {
    // Storage a browser refuses to hand over lands here. Light is what the
    // stylesheet does with no answer at all, so there's nothing to put back.
  }
}

/** The blocking script, run from the document before anything paints. */
export const THEME_BOOT_SCRIPT = `(${applyStoredTheme.toString()})();`;
