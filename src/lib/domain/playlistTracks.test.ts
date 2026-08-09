import { describe, expect, it } from 'vitest';
import { addableAlbumIds, isAddable, playlistTrackRows } from './playlistTracks';
import type { ColumnId } from './columns';
import { displayName } from './text';
import {
  albumTracks,
  anAlbum,
  anEpisode,
  aTrack,
  importEntries,
  KIERAN_HEBDEN_ALBUM,
} from '@/test/fixtures';

const nothingOnBoard = new Map<string, ColumnId>();

describe('playlistTrackRows', () => {
  it('carries the album a tick on the row would add, not the track', () => {
    const album = anAlbum({ id: 'a1', name: 'Fetch the Bolt Cutters', total_tracks: 13 });
    const [row] = playlistTrackRows(importEntries(albumTracks(album, 1)), nothingOnBoard);
    expect(row?.kind).toBe('track');
    expect(row?.kind === 'track' && row.album).toMatchObject({
      id: 'a1',
      name: 'Fetch the Bolt Cutters',
      // The album's own count, which is what gets appended — not the one copy
      // of it sitting in this playlist.
      totalTracks: 13,
    });
  });

  it('keys rows by position, so the same track twice stays two rows', () => {
    const track = aTrack();
    const rows = playlistTrackRows(importEntries([track, track]), nothingOnBoard);
    expect(rows.map((row) => row.key)).toEqual(['0', '1']);
  });

  it('says where an album already sits', () => {
    const rows = playlistTrackRows(
      importEntries([aTrack({ album: anAlbum({ id: 'a1' }) })]),
      new Map<string, ColumnId>([['a1', 'x3']]),
    );
    expect(rows[0]?.kind === 'track' && rows[0].onBoard).toBe('x3');
  });

  it('marks a single, which takes most EPs with it', () => {
    const rows = playlistTrackRows(
      importEntries([aTrack({ album: anAlbum({ album_type: 'single' }) })]),
      nothingOnBoard,
    );
    expect(rows[0]?.kind === 'track' && rows[0].reason).toBe('single');
  });

  it('marks a compilation', () => {
    const rows = playlistTrackRows(
      importEntries([aTrack({ album: anAlbum({ album_type: 'compilation' }) })]),
      nothingOnBoard,
    );
    expect(rows[0]?.kind === 'track' && rows[0].reason).toBe('compilation');
  });

  it('marks a local file, which has no album to look up', () => {
    const rows = playlistTrackRows(
      importEntries([aTrack({ id: null, is_local: true, name: 'voice memo 04' })]),
      nothingOnBoard,
    );
    expect(rows[0]).toEqual({ key: '0', kind: 'local', title: 'voice memo 04' });
  });

  it('marks a track carrying no album at all as having none to look up', () => {
    const rows = playlistTrackRows(importEntries([aTrack({ album: undefined })]), nothingOnBoard);
    expect(rows[0]?.kind).toBe('local');
  });

  it('marks a podcast episode and names its show in place of an artist', () => {
    const rows = playlistTrackRows(importEntries([anEpisode()]), nothingOnBoard);
    expect(rows[0]).toEqual({
      key: '0',
      kind: 'episode',
      title: 'Weyes Blood — Titanic Rising',
      showName: 'Song Exploder',
    });
  });

  it('copes with an episode whose show was not returned', () => {
    const rows = playlistTrackRows(importEntries([anEpisode({ show: undefined })]), nothingOnBoard);
    expect(rows[0]?.kind === 'episode' && rows[0].showName).toBeNull();
  });

  it('reads the deprecated `track` when `item` is absent', () => {
    const rows = playlistTrackRows(
      [{ added_at: '2026-07-06T10:00:00.000Z', track: aTrack({ name: 'Nude' }) }],
      nothingOnBoard,
    );
    expect(rows[0]?.title).toBe('Nude');
  });

  it('drops an entry whose track has been taken down', () => {
    expect(playlistTrackRows(importEntries([null]), nothingOnBoard)).toEqual([]);
  });

  it('keeps unaddable rows in their playlist position', () => {
    // A playlist is a list the listener can already see in Spotify, so a row
    // quietly missing from it reads as a bug.
    const rows = playlistTrackRows(
      importEntries([
        aTrack({ name: 'Shameika' }),
        anEpisode(),
        aTrack({ name: 'John L', album: anAlbum({ id: 'a2' }) }),
      ]),
      nothingOnBoard,
    );
    expect(rows.map((row) => row.title)).toEqual(['Shameika', 'Weyes Blood — Titanic Rising', 'John L']);
  });
});

describe('addableAlbumIds', () => {
  it('counts each album once, in the order it first appears', () => {
    const a1 = anAlbum({ id: 'a1' });
    const a2 = anAlbum({ id: 'a2' });
    const rows = playlistTrackRows(
      importEntries([aTrack({ album: a2 }), aTrack({ album: a1 }), aTrack({ album: a2 })]),
      nothingOnBoard,
    );
    expect(addableAlbumIds(rows)).toEqual(['a2', 'a1']);
  });

  it('excludes what is already on the board and what cannot resolve', () => {
    const rows = playlistTrackRows(
      importEntries([
        aTrack({ album: anAlbum({ id: 'onBoard' }) }),
        aTrack({ album: anAlbum({ id: 'single', album_type: 'single' }) }),
        anEpisode(),
        aTrack({ id: null, is_local: true }),
        aTrack({ album: anAlbum({ id: 'free' }) }),
      ]),
      new Map<string, ColumnId>([['onBoard', 'queue']]),
    );
    expect(addableAlbumIds(rows)).toEqual(['free']);
    expect(rows.filter(isAddable)).toHaveLength(1);
  });
});

describe('names arrive bounded', () => {
  const bounded = displayName(KIERAN_HEBDEN_ALBUM);

  it('bounds a track title and the album it resolves to', () => {
    const album = anAlbum({ name: KIERAN_HEBDEN_ALBUM });
    const rows = playlistTrackRows(
      importEntries([aTrack({ name: KIERAN_HEBDEN_ALBUM, album })]),
      nothingOnBoard,
    );
    expect(rows[0]?.title).toBe(bounded);
    expect(rows[0]?.kind === 'track' && rows[0].album.name).toBe(bounded);
  });

  it('bounds the show an episode came from', () => {
    const rows = playlistTrackRows(
      importEntries([anEpisode({ show: { name: KIERAN_HEBDEN_ALBUM } })]),
      nothingOnBoard,
    );
    expect(rows[0]?.kind === 'episode' && rows[0].showName).toBe(bounded);
  });
});
