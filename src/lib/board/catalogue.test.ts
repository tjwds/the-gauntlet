import { describe, expect, it, vi } from 'vitest';
import {
  albumFromRef,
  importablePlaylists,
  playlistTracksForBoard,
  savedAlbumsForBoard,
  searchAlbumsForBoard,
} from './catalogue';
import type { SpotifyClient } from '@/lib/spotify/client';
import type { ColumnId } from '@/lib/domain/columns';
import { addableAlbumIds, type PlaylistTrackRow } from '@/lib/domain/playlistTracks';
import { displayName } from '@/lib/domain/text';
import {
  albumTracks,
  anAlbum,
  aPlaylist,
  fakeClient,
  importEntries,
  KIERAN_HEBDEN_ALBUM,
} from '@/test/fixtures';
import type { SpotifyAlbum } from '@/lib/spotify/types';

const asClient = (fake: ReturnType<typeof fakeClient>) => fake as unknown as SpotifyClient;
const nothingOnBoard = new Map<string, ColumnId>();

/** An album as `GET /albums` returns it: complete, with its tracks. */
function fullAlbum(overrides: Partial<SpotifyAlbum> = {}): SpotifyAlbum {
  const album = anAlbum(overrides);
  return {
    ...album,
    tracks: { items: albumTracks(album, 4), next: null, total: 4, limit: 50, offset: 0 },
  };
}

describe('searchAlbumsForBoard', () => {
  it('filters singles and compilations out of the results', () => {
    const client = fakeClient({
      searchAlbums: vi.fn(async () => [
        anAlbum({ id: 'a1' }),
        anAlbum({ id: 'a2', album_type: 'single' }),
        anAlbum({ id: 'a3', album_type: 'compilation' }),
      ]),
      albums: vi.fn(async () => [fullAlbum({ id: 'a1' })]),
    });
    return searchAlbumsForBoard(asClient(client), 'weyes blood', nothingOnBoard).then((results) => {
      expect(client.albums).toHaveBeenCalledWith(['a1']);
      expect(results).toHaveLength(1);
    });
  });

  it('reads the runtime off the full album, since search does not carry one', async () => {
    const client = fakeClient({
      searchAlbums: vi.fn(async () => [anAlbum({ id: 'a1' })]),
      albums: vi.fn(async () => [fullAlbum({ id: 'a1' })]),
    });
    const [result] = await searchAlbumsForBoard(asClient(client), 'q', nothingOnBoard);
    expect(result?.durationMs).toBe(4 * 237_000);
  });

  it('says where an album already sits instead of offering to add it', async () => {
    const client = fakeClient({
      searchAlbums: vi.fn(async () => [anAlbum({ id: 'a1' })]),
      albums: vi.fn(async () => [fullAlbum({ id: 'a1' })]),
    });
    const onBoard = new Map<string, ColumnId>([['a1', 'x2']]);
    const [result] = await searchAlbumsForBoard(asClient(client), 'q', onBoard);
    expect(result?.onBoard).toBe('x2');
  });

  it('does not fetch albums when nothing survived the filter', async () => {
    const client = fakeClient({
      searchAlbums: vi.fn(async () => [anAlbum({ album_type: 'single' })]),
    });
    await expect(searchAlbumsForBoard(asClient(client), 'q', nothingOnBoard)).resolves.toEqual([]);
    expect(client.albums).not.toHaveBeenCalled();
  });
});

describe('savedAlbumsForBoard', () => {
  it('offers saved albums, minus the singles', async () => {
    const client = fakeClient({
      savedAlbums: vi.fn(async () => [
        { added_at: 'x', album: fullAlbum({ id: 'a1' }) },
        { added_at: 'x', album: fullAlbum({ id: 'a2', album_type: 'single' }) },
      ]),
    });
    const results = await savedAlbumsForBoard(asClient(client), nothingOnBoard);
    expect(results.map((r) => r.id)).toEqual(['a1']);
  });
});

describe('playlistTracksForBoard', () => {
  it('lists a track per row, each carrying the album a tick would add', async () => {
    const album = anAlbum({ id: 'a1', total_tracks: 10 });
    const client = fakeClient({
      playlistEntries: vi.fn(async () => importEntries(albumTracks(album, 3))),
    });
    const rows = await playlistTracksForBoard(asClient(client), 'pl9', nothingOnBoard);
    // Three tracks, one album: the rows are tracks, the selection is the album.
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.kind === 'track' && row.album.id === 'a1')).toBe(true);
    expect(addableAlbumIds(rows)).toEqual(['a1']);
  });

  it('keeps a single in place and says why, rather than dropping it', async () => {
    const single = anAlbum({ id: 'a2', album_type: 'single' });
    const client = fakeClient({
      playlistEntries: vi.fn(async () => importEntries(albumTracks(single, 1))),
    });
    const [row] = await playlistTracksForBoard(asClient(client), 'pl9', nothingOnBoard);
    expect(row?.kind).toBe('track');
    expect(row?.kind === 'track' && row.reason).toBe('single');
    expect(addableAlbumIds([row as PlaylistTrackRow])).toEqual([]);
  });

  it('marks a track whose album is already filed', async () => {
    const album = anAlbum({ id: 'a1' });
    const client = fakeClient({
      playlistEntries: vi.fn(async () => importEntries(albumTracks(album, 1))),
    });
    const onBoard = new Map<string, ColumnId>([['a1', 'done']]);
    const [row] = await playlistTracksForBoard(asClient(client), 'pl9', onBoard);
    expect(row?.kind === 'track' && row.onBoard).toBe('done');
  });
});

describe('albumFromRef', () => {
  it('reads a pasted album link', async () => {
    const client = fakeClient({ album: vi.fn(async () => fullAlbum({ id: 'a1' })) });
    const result = await albumFromRef(
      asClient(client),
      'https://open.spotify.com/album/a1',
      nothingOnBoard,
    );
    expect(result?.id).toBe('a1');
    expect(client.album).toHaveBeenCalledWith('a1');
  });

  it('reads a Spotify URI, which works even though the copy says link', async () => {
    const client = fakeClient({ album: vi.fn(async () => fullAlbum({ id: 'a1' })) });
    await albumFromRef(asClient(client), 'spotify:album:a1', nothingOnBoard);
    expect(client.album).toHaveBeenCalledWith('a1');
  });

  it('returns nothing for something that is not an album link', async () => {
    const client = fakeClient();
    await expect(albumFromRef(asClient(client), 'weyes blood', nothingOnBoard)).resolves.toBeNull();
    expect(client.album).not.toHaveBeenCalled();
  });
});

describe('importablePlaylists', () => {
  it('counts tracks, not albums — /me/playlists never reports albums', async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [
        aPlaylist({ id: 'p1', name: 'Road trip', tracks: { total: 40 }, images: [] }),
      ]),
    });
    await expect(importablePlaylists(asClient(client), 'joe')).resolves.toEqual([
      {
        id: 'p1',
        name: 'Road trip',
        trackCount: 40,
        imageUrl: null,
        ownerName: 'joe',
        ownedByMe: true,
        unavailable: false,
      },
    ]);
  });

  it("names someone else's playlist by its owner, and offers it all the same", async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [
        aPlaylist({ id: 'p1', name: 'Sunday morning', owner: { id: 'someone-else', display_name: 'joe' } }),
      ]),
    });
    const [result] = await importablePlaylists(asClient(client), 'joe');
    expect(result?.ownerName).toBe('joe');
    expect(result?.ownedByMe).toBe(false);
    expect(result?.unavailable).toBe(false);
  });

  it("marks Spotify's own playlists unavailable rather than hiding them", async () => {
    // Their items answer 404 for apps registered after November 2024, but
    // Discover Weekly is the first place someone looks.
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [
        aPlaylist({ id: 'p1', name: 'Discover Weekly', owner: { id: 'spotify', display_name: 'Spotify' } }),
      ]),
    });
    const [result] = await importablePlaylists(asClient(client), 'joe');
    expect(result?.unavailable).toBe(true);
  });

  it('leaves the seven board playlists out, since importing one is a no-op', async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [
        aPlaylist({ id: 'p1', name: 'Gauntlet · Queue' }),
        aPlaylist({ id: 'p2', name: 'Road trip' }),
      ]),
    });
    const results = await importablePlaylists(asClient(client), 'joe');
    expect(results.map((p) => p.name)).toEqual(['Road trip']);
  });
});

describe('names arrive bounded', () => {
  it('bounds a playlist and its owner, but matches the board seven on the raw name', async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [
        aPlaylist({
          id: 'p1',
          name: KIERAN_HEBDEN_ALBUM,
          owner: { id: 'kieran', display_name: KIERAN_HEBDEN_ALBUM },
        }),
        // Named by this app, so it has to be recognised exactly as it was written.
        aPlaylist({ id: 'p2', name: 'Gauntlet · Queue' }),
      ]),
    });
    const results = await importablePlaylists(asClient(client), 'joe');
    expect(results.map((p) => p.id)).toEqual(['p1']);
    expect(results[0]?.name).toBe(displayName(KIERAN_HEBDEN_ALBUM));
    expect(results[0]?.ownerName).toBe(displayName(KIERAN_HEBDEN_ALBUM));
  });
});
