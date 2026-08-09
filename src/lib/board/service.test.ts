import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAlbumsToColumn,
  albumsAlreadyOnBoard,
  BoardWriteError,
  createBoardPlaylists,
  deleteBoardPlaylists,
  findBoardPlaylists,
  loadBoard,
  moveAlbum,
  removeAlbumFromBoard,
} from './service';
import { clearCache } from './cache';
import type { SpotifyClient } from '@/lib/spotify/client';
import { COLUMNS, type ColumnId } from '@/lib/domain/columns';
import {
  albumTracks,
  anAlbum,
  aPlaylist,
  boardPlaylists,
  fakeClient,
  playlistEntries,
} from '@/test/fixtures';
import type { PlaylistTrackObject, SpotifyPlaylist } from '@/lib/spotify/types';

const NOW = Date.parse('2026-07-10T12:00:00.000Z');
const ARRIVED = '2026-07-06T09:00:00.000Z';

const asClient = (fake: ReturnType<typeof fakeClient>) => fake as unknown as SpotifyClient;

/** All seven playlists as Spotify would list them. */
function sevenPlaylists(): SpotifyPlaylist[] {
  return COLUMNS.map((column) =>
    aPlaylist({ id: `pl-${column.id}`, name: column.playlistName }),
  );
}

beforeEach(() => clearCache());

describe('findBoardPlaylists', () => {
  it('finds the seven by name', async () => {
    const client = fakeClient({ myPlaylists: vi.fn(async () => sevenPlaylists()) });
    const lookup = await findBoardPlaylists(asClient(client));
    expect(lookup.playlists).not.toBeNull();
    expect(lookup.missing).toEqual([]);
    expect(lookup.playlists?.x3.id).toBe('pl-x3');
  });

  it('ignores everything else in the library', async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [aPlaylist({ id: 'other', name: 'Road trip' }), ...sevenPlaylists()]),
    });
    expect((await findBoardPlaylists(asClient(client))).playlists).not.toBeNull();
  });

  it('names what is missing, which is also what a rename looks like', async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => sevenPlaylists().filter((p) => p.name !== 'Gauntlet · ×2')),
    });
    const lookup = await findBoardPlaylists(asClient(client));
    expect(lookup.playlists).toBeNull();
    expect(lookup.missing).toEqual(['Gauntlet · ×2']);
  });

  it('stops at the first page when the seven are on it', async () => {
    // Spotify lists most-recently-added first, so they usually are — and a
    // fifteen-year-old library is a round trip per fifty playlists otherwise.
    const client = fakeClient({
      myPlaylistsFirstPage: vi.fn(async () => ({ items: sevenPlaylists(), total: 715 })),
      myPlaylists: vi.fn(async () => sevenPlaylists()),
    });
    const lookup = await findBoardPlaylists(asClient(client));
    expect(lookup.playlists).not.toBeNull();
    expect(client.myPlaylists).not.toHaveBeenCalled();
  });

  it('reads the whole library when the seven are not on the first page', async () => {
    const client = fakeClient({
      myPlaylistsFirstPage: vi.fn(async () => ({
        items: [aPlaylist({ id: 'other', name: 'Road trip' })],
        total: 715,
      })),
      myPlaylists: vi.fn(async () => sevenPlaylists()),
    });
    const lookup = await findBoardPlaylists(asClient(client));
    expect(lookup.playlists).not.toBeNull();
    expect(client.myPlaylists).toHaveBeenCalled();
  });

  it('does not read again when the first page was the whole library', async () => {
    const client = fakeClient({
      myPlaylistsFirstPage: vi.fn(async () => ({ items: [], total: 0 })),
      myPlaylists: vi.fn(async () => []),
    });
    const lookup = await findBoardPlaylists(asClient(client));
    expect(lookup.missing).toHaveLength(7);
    expect(client.myPlaylists).not.toHaveBeenCalled();
  });

  it('remembers a complete board rather than rescanning the library', async () => {
    // Scanning is what got this app rate-limited: a fifteen-year-old library is
    // hundreds of playlists, and the board is read constantly.
    const client = fakeClient({ myPlaylists: vi.fn(async () => sevenPlaylists()) });
    await findBoardPlaylists(asClient(client), { cacheKey: 'joe' });
    await findBoardPlaylists(asClient(client), { cacheKey: 'joe' });
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(1);
  });

  it('rescans when asked to, which is what Re-scan is for', async () => {
    const client = fakeClient({ myPlaylists: vi.fn(async () => sevenPlaylists()) });
    await findBoardPlaylists(asClient(client), { cacheKey: 'joe' });
    await findBoardPlaylists(asClient(client), { cacheKey: 'joe', force: true });
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(2);
  });

  it('does not remember an incomplete board, which setup is about to change', async () => {
    const client = fakeClient({ myPlaylists: vi.fn(async () => []) });
    await findBoardPlaylists(asClient(client), { cacheKey: 'joe' });
    await findBoardPlaylists(asClient(client), { cacheKey: 'joe' });
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(2);
  });

  it('keeps one listener out of another listener memory', async () => {
    const client = fakeClient({ myPlaylists: vi.fn(async () => sevenPlaylists()) });
    await findBoardPlaylists(asClient(client), { cacheKey: 'joe' });
    await findBoardPlaylists(asClient(client), { cacheKey: 'someone-else' });
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(2);
  });

  it('keeps the first of two playlists with the same name', async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [
        ...sevenPlaylists(),
        aPlaylist({ id: 'duplicate', name: 'Gauntlet · Queue' }),
      ]),
    });
    expect((await findBoardPlaylists(asClient(client))).playlists?.queue.id).toBe('pl-queue');
  });
});

describe('loadBoard', () => {
  function loaded(items: Partial<Record<ColumnId, PlaylistTrackObject[]>> = {}, extra = {}) {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => sevenPlaylists()),
      playlistItems: vi.fn(async (playlistId: string) => {
        const columnId = playlistId.replace('pl-', '') as ColumnId;
        return items[columnId] ?? [];
      }),
      ...extra,
    });
    return { client, load: () => loadBoard(asClient(client), { nowMs: NOW }) };
  }

  it('sends the listener to setup when a playlist is missing', async () => {
    const client = fakeClient({ myPlaylists: vi.fn(async () => []) });
    const result = await loadBoard(asClient(client));
    expect(result.setupRequired).toBe(true);
    expect(result.board).toBeNull();
    expect(result.missing).toHaveLength(7);
  });

  it('reads all seven playlists into a board', async () => {
    const { client, load } = loaded({
      queue: playlistEntries(albumTracks(anAlbum(), 10), ARRIVED),
    });
    const result = await load();
    expect(result.setupRequired).toBe(false);
    expect(result.board?.columns).toHaveLength(7);
    expect(result.board?.columns[0]?.albums[0]?.name).toBe('In Rainbows');
    expect(client.playlistItems).toHaveBeenCalledTimes(7);
  });

  it('skips the playback poll when asked, which is the free-account path', async () => {
    const client = fakeClient({ myPlaylists: vi.fn(async () => sevenPlaylists()) });
    await loadBoard(asClient(client), { includePlayback: false });
    expect(client.playbackState).not.toHaveBeenCalled();
  });

  it('polls playback by default', async () => {
    const { client, load } = loaded();
    await load();
    expect(client.playbackState).toHaveBeenCalled();
  });

  it('takes the configured played_at reading', async () => {
    const { client } = loaded();
    await loadBoard(asClient(client), { nowMs: NOW, semantics: 'start' });
    expect(client.recentlyPlayed).toHaveBeenCalled();
  });

  it('reads without remembering when given no listener to key on', async () => {
    const { client } = loaded();
    await loadBoard(asClient(client), { nowMs: NOW });
    await loadBoard(asClient(client), { nowMs: NOW });
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(2);
  });

  it('remembers the lookup, and forgets it on request', async () => {
    const { client } = loaded();
    await loadBoard(asClient(client), { nowMs: NOW, cacheKey: 'joe' });
    await loadBoard(asClient(client), { nowMs: NOW, cacheKey: 'joe' });
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(1);
    await loadBoard(asClient(client), { nowMs: NOW, cacheKey: 'joe', force: true });
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(2);
  });

  it('defaults to now when it is given no clock', async () => {
    const { client } = loaded();
    const result = await loadBoard(asClient(client));
    expect(result.board?.generatedAt).toBeGreaterThan(0);
  });
});

describe('createBoardPlaylists', () => {
  it('creates all seven under the account the token belongs to', async () => {
    // Not the id carried on the session: Spotify only lets an account create
    // playlists for itself, and answers a mismatch with a bare 403.
    const client = fakeClient({ myPlaylists: vi.fn(async () => []) });
    const result = await createBoardPlaylists(asClient(client), true);
    expect(result.created).toHaveLength(7);
    expect(result.adopted).toEqual([]);
    // Receipts: an id and a link make "it worked" checkable rather than asserted.
    expect(result.created[0]).toMatchObject({
      name: 'Gauntlet · Queue',
      id: expect.any(String),
      url: expect.stringContaining('open.spotify.com/playlist/'),
    });
    expect(client.createPlaylist).toHaveBeenCalledWith('Gauntlet · Queue', false);
    expect(client.createPlaylist).toHaveBeenCalledTimes(7);
  });

  it('makes them public when the private switch is off', async () => {
    const client = fakeClient({ myPlaylists: vi.fn(async () => []) });
    await createBoardPlaylists(asClient(client), false);
    expect(client.createPlaylist).toHaveBeenCalledWith('Gauntlet · Queue', true);
  });

  it('builds a link even when Spotify sends no external url', async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => []),
      createPlaylist: vi.fn(async (name: string) => ({
        id: 'pl-new',
        name,
        uri: 'spotify:playlist:pl-new',
        tracks: { total: 0 },
        owner: { id: 'joe' },
      })),
    });
    const result = await createBoardPlaylists(asClient(client), true);
    expect(result.created[0]?.url).toBe('https://open.spotify.com/playlist/pl-new');
  });

  it('adopts a playlist that already carries the name', async () => {
    // An unrelated playlist already called `Gauntlet · Queue` becomes the board.
    // Worth knowing at setup rather than discovering later.
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [aPlaylist({ id: 'mine', name: 'Gauntlet · Queue' })]),
    });
    const result = await createBoardPlaylists(asClient(client), true);
    expect(result.adopted.map((p) => p.name)).toEqual(['Gauntlet · Queue']);
    expect(result.created).toHaveLength(6);
  });
});

describe('moveAlbum', () => {
  const album = anAlbum({ id: 'alb1' });
  const tracks = albumTracks(album, 3);

  function movingClient() {
    return fakeClient({
      playlistItems: vi.fn(async (playlistId: string) =>
        playlistId === 'pl-x1' ? playlistEntries(tracks, ARRIVED) : [],
      ),
    });
  }

  it('removes from one playlist and appends to the other, in album order', async () => {
    const client = movingClient();
    const result = await moveAlbum(asClient(client), boardPlaylists(), {
      albumId: 'alb1',
      from: 'x1',
      to: 'x2',
    });

    const uris = tracks.map((track) => track.uri);
    expect(client.removeFromPlaylist).toHaveBeenCalledWith('pl-x1', uris);
    expect(client.addToPlaylist).toHaveBeenCalledWith('pl-x2', uris);
    expect(result).toEqual({ albumId: 'alb1', from: 'x1', to: 'x2', trackCount: 3 });
  });

  it('appends in album order even when the playlist held them jumbled', async () => {
    const jumbled = [tracks[2], tracks[0], tracks[1]].filter(Boolean) as typeof tracks;
    const client = fakeClient({
      playlistItems: vi.fn(async () => playlistEntries(jumbled, ARRIVED)),
    });
    await moveAlbum(asClient(client), boardPlaylists(), { albumId: 'alb1', from: 'x1', to: 'x2' });
    expect(client.addToPlaylist).toHaveBeenCalledWith('pl-x2', tracks.map((t) => t.uri));
  });

  it('does nothing when the album is already where it is going', async () => {
    const client = movingClient();
    const result = await moveAlbum(asClient(client), boardPlaylists(), {
      albumId: 'alb1',
      from: 'x1',
      to: 'x1',
    });
    expect(result.trackCount).toBe(0);
    expect(client.removeFromPlaylist).not.toHaveBeenCalled();
  });

  it('refuses to move an album that is not in the column it was told', async () => {
    const client = fakeClient({ playlistItems: vi.fn(async () => []) });
    await expect(
      moveAlbum(asClient(client), boardPlaylists(), { albumId: 'alb1', from: 'x1', to: 'x2' }),
    ).rejects.toBeInstanceOf(BoardWriteError);
  });
});

describe('addAlbumsToColumn', () => {
  const album = anAlbum({ id: 'alb1' });
  const tracks = albumTracks(album, 3);

  it('appends a whole album to the Queue in album order', async () => {
    const client = fakeClient({
      albumTracks: vi.fn(async () => [tracks[2], tracks[0], tracks[1]].filter(Boolean)),
    });
    const result = await addAlbumsToColumn(asClient(client), boardPlaylists(), {
      albumIds: ['alb1'],
      to: 'queue',
    });
    expect(result.added).toEqual(['alb1']);
    expect(client.addToPlaylist).toHaveBeenCalledWith('pl-queue', tracks.map((t) => t.uri));
  });

  it('skips an album already on the board, which the playlist model cannot hold twice', async () => {
    const client = fakeClient({
      playlistItems: vi.fn(async (playlistId: string) =>
        playlistId === 'pl-x2' ? playlistEntries(tracks, ARRIVED) : [],
      ),
      albumTracks: vi.fn(async () => tracks),
    });
    const result = await addAlbumsToColumn(asClient(client), boardPlaylists(), {
      albumIds: ['alb1'],
      to: 'queue',
    });
    expect(result).toEqual({ added: [], skipped: ['alb1'] });
    expect(client.addToPlaylist).not.toHaveBeenCalled();
  });

  it('skips an album with nothing addable on it', async () => {
    const client = fakeClient({
      albumTracks: vi.fn(async () => [{ ...tracks[0], is_local: true }]),
    });
    const result = await addAlbumsToColumn(asClient(client), boardPlaylists(), {
      albumIds: ['alb1'],
      to: 'queue',
    });
    expect(result.skipped).toEqual(['alb1']);
  });

  it('can file straight into a column other than Queue', async () => {
    const client = fakeClient({ albumTracks: vi.fn(async () => tracks) });
    await addAlbumsToColumn(asClient(client), boardPlaylists(), { albumIds: ['alb1'], to: 'x2' });
    expect(client.addToPlaylist).toHaveBeenCalledWith('pl-x2', expect.any(Array));
  });
});

describe('removeAlbumFromBoard', () => {
  const tracks = albumTracks(anAlbum({ id: 'alb1' }), 2);

  it('deletes the tracks from its column and leaves the library alone', async () => {
    const client = fakeClient({
      playlistItems: vi.fn(async () => playlistEntries(tracks, ARRIVED)),
    });
    const result = await removeAlbumFromBoard(asClient(client), boardPlaylists(), {
      albumId: 'alb1',
      from: 'queue',
    });
    expect(result).toEqual({ albumId: 'alb1', trackCount: 2 });
    expect(client.removeFromPlaylist).toHaveBeenCalledWith('pl-queue', tracks.map((t) => t.uri));
  });

  it('refuses when the album is not there', async () => {
    const client = fakeClient({ playlistItems: vi.fn(async () => []) });
    await expect(
      removeAlbumFromBoard(asClient(client), boardPlaylists(), { albumId: 'alb1', from: 'queue' }),
    ).rejects.toThrow(BoardWriteError);
  });
});

describe('albumsAlreadyOnBoard', () => {
  it('maps every album to the column it is in', async () => {
    const first = albumTracks(anAlbum({ id: 'alb1' }), 1);
    const second = albumTracks(anAlbum({ id: 'alb2' }), 1);
    const client = fakeClient({
      playlistItems: vi.fn(async (playlistId: string) => {
        if (playlistId === 'pl-queue') return playlistEntries(first, ARRIVED);
        if (playlistId === 'pl-done') return playlistEntries(second, ARRIVED);
        return [];
      }),
    });
    const index = await albumsAlreadyOnBoard(asClient(client), boardPlaylists());
    expect(index.get('alb1')).toBe('queue');
    expect(index.get('alb2')).toBe('done');
  });

  it('reports the leftmost column when an album somehow sits in two', async () => {
    const tracks = albumTracks(anAlbum({ id: 'alb1' }), 1);
    const client = fakeClient({
      playlistItems: vi.fn(async () => playlistEntries(tracks, ARRIVED)),
    });
    const index = await albumsAlreadyOnBoard(asClient(client), boardPlaylists());
    expect(index.get('alb1')).toBe('queue');
  });
});

describe('deleteBoardPlaylists', () => {
  it('unfollows all seven', async () => {
    const client = fakeClient({ myPlaylists: vi.fn(async () => sevenPlaylists()) });
    const deleted = await deleteBoardPlaylists(asClient(client));
    expect(deleted).toHaveLength(7);
    expect(client.unfollowPlaylist).toHaveBeenCalledTimes(7);
  });

  it('deletes only what it can find', async () => {
    const client = fakeClient({
      myPlaylists: vi.fn(async () => [aPlaylist({ id: 'pl-queue', name: 'Gauntlet · Queue' })]),
    });
    expect(await deleteBoardPlaylists(asClient(client))).toEqual(['Gauntlet · Queue']);
  });
});
