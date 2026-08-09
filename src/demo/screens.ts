/**
 * The screens the demo harness can render, and whether it is reachable at all.
 *
 * `pnpm dev` always serves it. A production build serves it only when
 * `DEMO_SCREENS=1` is set, which the screenshot tool does for the server it
 * starts — so putting the demo on a real deployment stays a deliberate act
 * rather than something that ships with one.
 */

export const DEMO_SCREENS = [
  'login',
  'setup',
  'first-records',
  'board',
  /** The board with a record playing: playbar, level meter, pass in flight. */
  'playing',
  /** The board a moment after a pass completed: the move, its toast and undo. */
  'advance',
  'settings',
] as const;

export type DemoScreen = (typeof DEMO_SCREENS)[number];

export function isDemoScreen(value: string): value is DemoScreen {
  return (DEMO_SCREENS as readonly string[]).includes(value);
}

export function demoEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DEMO_SCREENS === '1';
}
