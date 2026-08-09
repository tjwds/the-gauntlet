import { describe, expect, it } from 'vitest';
import {
  ADVANCING_COLUMN_IDS,
  COLUMNS,
  COLUMN_IDS,
  LISTENS_TO_DONE,
  PLAYLIST_PREFIX,
  advanceBy,
  columnForPlaylistName,
  getColumn,
  isColumnId,
  listensRemaining,
  nextColumnId,
} from './columns';

describe('the seven columns', () => {
  it('is seven: five stages, Done and Abandoned', () => {
    expect(COLUMNS).toHaveLength(7);
    expect(COLUMN_IDS).toEqual(['queue', 'x1', 'x2', 'x3', 'x4', 'done', 'abandoned']);
  });

  it('names every playlist under one prefix', () => {
    for (const column of COLUMNS) {
      expect(column.playlistName.startsWith(PLAYLIST_PREFIX)).toBe(true);
    }
    expect(getColumn('queue').playlistName).toBe('Gauntlet · Queue');
    expect(getColumn('x3').playlistName).toBe('Gauntlet · ×3');
    expect(getColumn('abandoned').playlistName).toBe('Gauntlet · Abandoned');
  });

  it('writes stage names with a multiplication sign, not the letter x', () => {
    expect(getColumn('x1').name).toBe('×1');
    expect(getColumn('x1').name).not.toContain('x');
  });

  it('counts Queue as nought listens and Done as five', () => {
    expect(getColumn('queue').listens).toBe(0);
    expect(getColumn('x4').listens).toBe(4);
    expect(getColumn('done').listens).toBe(LISTENS_TO_DONE);
  });

  it('leaves Abandoned without a listen count, because it never had one', () => {
    expect(getColumn('abandoned').listens).toBeNull();
    expect(listensRemaining('abandoned')).toBeNull();
  });

  it('groups the columns into three bands', () => {
    expect(COLUMNS.filter((c) => c.band === 'queue')).toHaveLength(1);
    expect(COLUMNS.filter((c) => c.band === 'progress')).toHaveLength(4);
    expect(COLUMNS.filter((c) => c.band === 'finished')).toHaveLength(2);
  });

  it('marks Done and Abandoned terminal', () => {
    expect(getColumn('done').terminal).toBe(true);
    expect(getColumn('abandoned').terminal).toBe(true);
    expect(getColumn('x4').terminal).toBe(false);
  });
});

describe('columnForPlaylistName', () => {
  it('matches on the exact name, which is the whole lookup', () => {
    expect(columnForPlaylistName('Gauntlet · ×2')?.id).toBe('x2');
  });

  it('does not match a renamed playlist', () => {
    expect(columnForPlaylistName('Gauntlet - x2')).toBeUndefined();
    expect(columnForPlaylistName('gauntlet · ×2')).toBeUndefined();
  });
});

describe('isColumnId', () => {
  it.each([
    ['queue', true],
    ['x4', true],
    ['abandoned', true],
    ['x5', false],
    ['', false],
    [42, false],
    [null, false],
  ])('%s -> %s', (value, expected) => {
    expect(isColumnId(value)).toBe(expected);
  });
});

describe('nextColumnId', () => {
  it('walks Queue through the stages to Done', () => {
    expect(ADVANCING_COLUMN_IDS).toEqual(['queue', 'x1', 'x2', 'x3', 'x4']);
    expect(nextColumnId('queue')).toBe('x1');
    expect(nextColumnId('x3')).toBe('x4');
    expect(nextColumnId('x4')).toBe('done');
  });

  it('stops at the terminal columns', () => {
    expect(nextColumnId('done')).toBeNull();
    expect(nextColumnId('abandoned')).toBeNull();
  });
});

describe('advanceBy', () => {
  it('moves one column per complete listen', () => {
    expect(advanceBy('queue', 1)).toBe('x1');
    expect(advanceBy('queue', 3)).toBe('x3');
  });

  it('retires a record at five and goes no further', () => {
    expect(advanceBy('queue', 5)).toBe('done');
    expect(advanceBy('queue', 9)).toBe('done');
    expect(advanceBy('x4', 4)).toBe('done');
  });

  it('returns null when nothing would move', () => {
    expect(advanceBy('queue', 0)).toBeNull();
    expect(advanceBy('queue', -1)).toBeNull();
    expect(advanceBy('done', 2)).toBeNull();
    expect(advanceBy('abandoned', 2)).toBeNull();
  });
});

describe('listensRemaining', () => {
  it('counts what a record still owes', () => {
    expect(listensRemaining('queue')).toBe(5);
    expect(listensRemaining('x3')).toBe(2);
    expect(listensRemaining('done')).toBe(0);
  });
});
