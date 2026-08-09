/** Presentation helpers. Pure, and every string here has a screen it came from. */

/** `59m`, `1h 14m`, `0m`. Board cards and suggestion tiles. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(Math.max(0, ms) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** `42:24`, `3:57`, `1:02:11`. Album drawer runtime and track lengths. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** `12 Jul`. Used for `finished {date}` and `dropped {date}` on terminal cards. */
export function formatShortDate(iso: string, locale = 'en-GB'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

/** `6 July`. The album drawer's one line of history. */
export function formatLongDate(iso: string, locale = 'en-GB'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(date);
}

/** `just now`, `2 minutes ago`, `3 hours ago`. Settings' last-sync line. */
export function formatRelative(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (seconds < 45) return 'just now';
  const units: Array<[label: string, seconds: number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [label, size] of units) {
    if (seconds >= size) {
      const value = Math.floor(seconds / size);
      return `${value} ${label}${value === 1 ? '' : 's'} ago`;
    }
  }
  /* c8 ignore next -- seconds < 45 already returned above. */
  return 'just now';
}

/** Release year from Spotify's `release_date`, which may be `2022`, `2022-05` or `2022-05-13`. */
export function releaseYear(releaseDate: string | undefined): string {
  if (!releaseDate) return '';
  return releaseDate.slice(0, 4);
}

export function pluralise(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** `1st`, `2nd`, `3rd`, `4th`, `11th`. The advance toast names the listen by ordinal. */
export function ordinal(n: number): string {
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  const last = abs % 10;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
