import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDuration,
  formatLongDate,
  formatRelative,
  formatShortDate,
  ordinal,
  pluralise,
  releaseYear,
} from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [59_000, '1m'],
    [42 * 60_000, '42m'],
    [74 * 60_000, '1h 14m'],
    [60 * 60_000, '1h 0m'],
    [-5000, '0m'],
  ])('%i ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatClock', () => {
  it.each([
    [237_000, '3:57'],
    [2_544_000, '42:24'],
    [3_731_000, '1:02:11'],
    [9_000, '0:09'],
    [-1, '0:00'],
  ])('%i ms -> %s', (ms, expected) => {
    expect(formatClock(ms)).toBe(expected);
  });
});

describe('dates', () => {
  it('shortens a date the way a Done card does', () => {
    expect(formatShortDate('2026-07-12T09:30:00.000Z')).toBe('12 Jul');
  });

  it('spells the month out in the album drawer', () => {
    expect(formatLongDate('2026-07-06T09:30:00.000Z')).toBe('6 July');
  });

  it('returns nothing for a date it cannot read', () => {
    expect(formatShortDate('not-a-date')).toBe('');
    expect(formatLongDate('not-a-date')).toBe('');
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-07-01T12:00:00.000Z');

  it.each([
    [0, 'just now'],
    [30_000, 'just now'],
    [60_000, '1 minute ago'],
    [120_000, '2 minutes ago'],
    [3_600_000, '1 hour ago'],
    [7_200_000, '2 hours ago'],
    [86_400_000, '1 day ago'],
    [3 * 86_400_000, '3 days ago'],
  ])('%i ms ago -> %s', (ago, expected) => {
    expect(formatRelative(now - ago, now)).toBe(expected);
  });

  it('treats a clock skewed into the future as now', () => {
    expect(formatRelative(now + 10_000, now)).toBe('just now');
  });
});

describe('releaseYear', () => {
  it.each([
    ['2022-05-13', '2022'],
    ['2022-05', '2022'],
    ['2022', '2022'],
    [undefined, ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(releaseYear(input)).toBe(expected);
  });
});

describe('pluralise', () => {
  it('handles the singular the copy notes call for', () => {
    expect(pluralise(1, 'play')).toBe('1 play');
    expect(pluralise(2, 'play')).toBe('2 plays');
    expect(pluralise(0, 'play')).toBe('0 plays');
  });

  it('takes an irregular plural', () => {
    expect(pluralise(2, 'is', 'are')).toBe('2 are');
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [5, '5th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [102, '102nd'],
    [113, '113th'],
  ])('%i -> %s', (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });
});
