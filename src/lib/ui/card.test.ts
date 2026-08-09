import { describe, expect, it } from 'vitest';
import { cardMeta, msLeftInAlbum, narrowProgressLabel, showsDots } from './card';
import { aCard, tracksOf } from '@/test/board';

describe('cardMeta', () => {
  it('gives year, track count and runtime in the ordinary case', () => {
    const album = aCard({ columnId: 'queue', tracks: tracksOf('a', 10, 240_000) });
    expect(cardMeta(album)).toBe('2007 · 10 trk · 40m');
  });

  it('says when a record finished, in Done', () => {
    expect(cardMeta(aCard({ columnId: 'done' }))).toBe('finished 6 Jul');
  });

  it('says when a record was dropped, in Abandoned', () => {
    expect(cardMeta(aCard({ columnId: 'abandoned' }))).toBe('dropped 6 Jul');
  });

  it('gives position in the record while it plays, not position in the track', () => {
    const album = aCard({ columnId: 'x1' });
    expect(cardMeta(album, { trackNumber: 6, totalTracks: 7, msLeft: 12 * 60_000 })).toBe(
      'track 6 of 7 · 12m left',
    );
  });

  it('prefers the playing line over the terminal-column line', () => {
    const album = aCard({ columnId: 'done' });
    expect(cardMeta(album, { trackNumber: 1, totalTracks: 4, msLeft: 60_000 })).toContain('track 1');
  });
});

describe('msLeftInAlbum', () => {
  const album = aCard({ tracks: tracksOf('a', 4, 200_000) });

  it('counts the rest of the record from where the needle is', () => {
    expect(msLeftInAlbum(album, 'a-t3', 50_000)).toBe(2 * 200_000 - 50_000);
  });

  it('counts the whole record from the first track', () => {
    expect(msLeftInAlbum(album, 'a-t1', 0)).toBe(4 * 200_000);
  });

  it('never goes below zero', () => {
    expect(msLeftInAlbum(album, 'a-t4', 500_000)).toBe(0);
  });

  it('has nothing to say about a track that is not on the record', () => {
    expect(msLeftInAlbum(album, 'somewhere-else', 0)).toBe(0);
  });
});

describe('showsDots', () => {
  it('shows them once a record has a listen to its name', () => {
    expect(showsDots(aCard({ columnId: 'x1', listens: 1 }))).toBe(true);
  });

  it('leaves them off an untouched record in the Queue', () => {
    expect(showsDots(aCard({ columnId: 'queue', listens: 0 }))).toBe(false);
  });

  it('leaves them off in Abandoned, where the count never meant anything', () => {
    expect(showsDots(aCard({ columnId: 'abandoned', listens: null }))).toBe(false);
  });
});

describe('narrowProgressLabel', () => {
  it('says what is playing', () => {
    const label = narrowProgressLabel(aCard(), true, {
      trackNumber: 6,
      totalTracks: 7,
      msLeft: 0,
    });
    expect(label).toBe('playing · track 6 of 7');
  });

  it('names the pass underway and how far in it is', () => {
    const album = aCard({ listens: 1, inFlight: { tracksDone: 4, total: 13 } });
    expect(narrowProgressLabel(album, false)).toBe('Listen #2 · 4/13');
  });

  it('counts the first pass from a record with no listens yet', () => {
    const album = aCard({ listens: 0, inFlight: { tracksDone: 2, total: 9 } });
    expect(narrowProgressLabel(album, false)).toBe('Listen #1 · 2/9');
  });

  it('says nothing for an abandoned record, which has no pass to be part-way through', () => {
    const album = aCard({ columnId: 'abandoned', listens: null, inFlight: null });
    expect(narrowProgressLabel(album, false)).toBeUndefined();
  });

  it('says nothing when no pass is underway', () => {
    expect(narrowProgressLabel(aCard(), false)).toBeUndefined();
  });

  it('says nothing for a playing card with no position yet', () => {
    expect(narrowProgressLabel(aCard(), true, null)).toBeUndefined();
  });
});
