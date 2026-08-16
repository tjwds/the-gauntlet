/**
 * The route handlers, called directly. Auth and the Spotify client are both
 * mocked, so what is under test is the request handling: what a bad body does,
 * what a missing playlist does, and how a Spotify failure reaches the browser.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyAuthError, SpotifyError, SpotifyForbiddenError } from '@/lib/spotify/errors';
import { BoardWriteError } from '@/lib/board/service';
import { clearCache } from '@/lib/board/cache';
import {
  albumTracks,
  anAlbum,
  aDevice,
  aPlaylist,
  aTrack,
  aUser,
  fakeClient,
  playbackState,
  playHistory,
  playlistEntries,
  importEntries,
  KIERAN_HEBDEN_ALBUM,
} from '@/test/fixtures';
import { COLUMNS } from '@/lib/domain/columns';
import { displayName } from '@/lib/domain/text';
import type { SpotifyPlaylist } from '@/lib/spotify/types';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  client: {} as Record<string, unknown>,
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/spotify/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spotify/client')>();
  // Returning an object from a constructor replaces the instance, which hands
  // every route whichever fake the current test installed.
  class StubClient {
    constructor() {
      return mocks.client as never;
    }
  }
  return { ...actual, SpotifyClient: StubClient };
});

const { GET: getBoard } = await import('./board/route');
const { POST: postMove } = await import('./board/move/route');
const { POST: postAlbums, DELETE: deleteAlbums } = await import('./board/albums/route');
const { GET: getSetup, POST: postSetup, DELETE: deleteSetup } = await import('./setup/route');
const { GET: getSuggestions } = await import('./suggestions/route');
const { GET: getCatalogue } = await import('./catalogue/route');
const { GET: getAccount } = await import('./account/route');
const { GET: getPlayer, PUT: putPlayer } = await import('./player/route');
const { GET: getDevices, POST: postTransport } = await import('./player/transport/route');
const { GET: getDiagnostics } = await import('./diagnostics/played-at/route');
const { GET: getAccountDiagnostics } = await import('./diagnostics/account/route');

const ARRIVED = '2026-07-06T09:00:00.000Z';

function sevenPlaylists(): SpotifyPlaylist[] {
  return COLUMNS.map((column) => aPlaylist({ id: `pl-${column.id}`, name: column.playlistName }));
}

function useClient(overrides: Record<string, unknown> = {}) {
  const client = fakeClient({ myPlaylists: vi.fn(async () => sevenPlaylists()), ...overrides });
  mocks.client = client as unknown as Record<string, unknown>;
  return client;
}

function post(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.auth.mockResolvedValue({ accessToken: 'tok', user: { id: 'joe' } });
  useClient();
  // The playlist lookup is remembered per listener for a few minutes; each test
  // is a fresh listener as far as it is concerned.
  clearCache();
});

afterEach(() => {
  delete process.env.PLAYED_AT_SEMANTICS;
});

describe('authentication', () => {
  it('turns away a caller with no session', async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await getBoard(new Request('https://x/api/board'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Not signed in to Spotify' });
  });

  it('turns away a session whose refresh failed', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok', error: 'RefreshFailed', user: {} });
    expect((await getBoard(new Request('https://x/api/board'))).status).toBe(401);
  });

  it('passes a Spotify failure through with its own status', async () => {
    useClient({
      myPlaylists: vi.fn(async () => {
        throw new SpotifyError(503, 'Service unavailable');
      }),
    });
    const response = await getBoard(new Request('https://x/api/board'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Service unavailable' });
  });

  it("passes Spotify's reason on, since the message alone names nothing to do", async () => {
    // NO_ACTIVE_DEVICE is what a play that goes nowhere answers with, and the
    // browser has to be able to match on it without reading Spotify's prose.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    useClient({
      myPlaylists: vi.fn(async () => {
        throw new SpotifyError(404, 'Player command failed: No active device found', {
          error: {
            status: 404,
            message: 'Player command failed: No active device found',
            reason: 'NO_ACTIVE_DEVICE',
          },
        });
      }),
    });
    const response = await getBoard(new Request('https://x/api/board'));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Player command failed: No active device found',
      reason: 'NO_ACTIVE_DEVICE',
    });
    logged.mockRestore();
  });

  it('reports a rejected token as 401 so the browser can sign in again', async () => {
    useClient({
      myPlaylists: vi.fn(async () => {
        throw new SpotifyAuthError();
      }),
    });
    expect((await getBoard(new Request('https://x/api/board'))).status).toBe(401);
  });

  it("writes Spotify's own words to the log, which is the only record of them", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    useClient({
      myPlaylists: vi.fn(async () => {
        throw new SpotifyError(403, 'Insufficient client scope', {
          error: { status: 403, message: 'Insufficient client scope' },
        });
      }),
    });
    await getBoard(new Request('https://x/api/board'));
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('403 Insufficient client scope'),
      expect.anything(),
    );
    logged.mockRestore();
  });

  it('logs an empty body without complaint', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    useClient({
      myPlaylists: vi.fn(async () => {
        throw new SpotifyError(500, 'Server error');
      }),
    });
    await getBoard(new Request('https://x/api/board'));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('500'), '');
    logged.mockRestore();
  });

  it('lets an unexpected failure through rather than dressing it as Spotify', async () => {
    useClient({
      myPlaylists: vi.fn(async () => {
        throw new TypeError('undefined is not a function');
      }),
    });
    await expect(getBoard(new Request('https://x/api/board'))).rejects.toThrow(TypeError);
  });

  it('reports a refused board write as a conflict', async () => {
    useClient({
      playlistItems: vi.fn(async () => {
        throw new BoardWriteError('not there');
      }),
    });
    const response = await postMove(
      post('https://x/api/board/move', { albumId: 'a1', from: 'x1', to: 'x2' }),
    );
    expect(response.status).toBe(409);
  });
});

describe('GET /api/board', () => {
  it('returns the board', async () => {
    useClient({
      playlistItems: vi.fn(async (id: string) =>
        id === 'pl-queue' ? playlistEntries(albumTracks(anAlbum(), 3), ARRIVED) : [],
      ),
    });
    const body = await (await getBoard(new Request('https://x/api/board'))).json();
    expect(body.setupRequired).toBe(false);
    expect(body.board.columns).toHaveLength(7);
  });

  it('asks for setup when the seven are not all there', async () => {
    useClient({ myPlaylists: vi.fn(async () => []) });
    const body = await (await getBoard(new Request('https://x/api/board'))).json();
    expect(body.setupRequired).toBe(true);
    expect(body.missing).toHaveLength(7);
  });

  it('remembers the playlist lookup between reads', async () => {
    const client = useClient();
    await getBoard(new Request('https://x/api/board'));
    await getBoard(new Request('https://x/api/board'));
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(1);
  });

  it('rescans on request, which is what Re-scan asks for', async () => {
    const client = useClient();
    await getBoard(new Request('https://x/api/board'));
    await getBoard(new Request('https://x/api/board?rescan=1'));
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(2);
  });

  it('skips the cache for a session with no listener to key it on', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok' });
    const client = useClient();
    await getBoard(new Request('https://x/api/board'));
    await getBoard(new Request('https://x/api/board'));
    expect(client.myPlaylistsFirstPage).toHaveBeenCalledTimes(2);
  });

  it('honours the configured played_at reading', async () => {
    process.env.PLAYED_AT_SEMANTICS = 'start';
    const client = useClient();
    await getBoard(new Request('https://x/api/board'));
    expect(client.recentlyPlayed).toHaveBeenCalled();
  });

  it('ignores a played_at setting it does not recognise', async () => {
    process.env.PLAYED_AT_SEMANTICS = 'sideways';
    await expect(getBoard(new Request('https://x/api/board'))).resolves.toBeDefined();
  });
});

describe('POST /api/board/move', () => {
  const tracks = albumTracks(anAlbum({ id: 'alb1' }), 2);

  it('moves an album between columns', async () => {
    const client = useClient({
      playlistItems: vi.fn(async (id: string) =>
        id === 'pl-x1' ? playlistEntries(tracks, ARRIVED) : [],
      ),
    });
    const response = await postMove(
      post('https://x/api/board/move', { albumId: 'alb1', from: 'x1', to: 'x2' }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ from: 'x1', to: 'x2', trackCount: 2 });
    expect(client.removeFromPlaylist).toHaveBeenCalled();
  });

  it.each([
    ['nothing at all', {}],
    ['no album', { from: 'x1', to: 'x2' }],
    ['a column that does not exist', { albumId: 'a', from: 'x9', to: 'x2' }],
    ['no destination', { albumId: 'a', from: 'x1' }],
  ])('rejects a request with %s', async (_label, body) => {
    expect((await postMove(post('https://x/api/board/move', body))).status).toBe(400);
  });

  it('rejects a body that is not JSON', async () => {
    expect((await postMove(post('https://x/api/board/move', 'not json'))).status).toBe(400);
  });

  it('works for a session with no listener to key the cache on', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok' });
    useClient({
      playlistItems: vi.fn(async (id: string) =>
        id === 'pl-x1' ? playlistEntries(tracks, ARRIVED) : [],
      ),
    });
    const response = await postMove(
      post('https://x/api/board/move', { albumId: 'alb1', from: 'x1', to: 'x2' }),
    );
    expect(response.status).toBe(200);
  });

  it('refuses when the board playlists are gone', async () => {
    useClient({ myPlaylists: vi.fn(async () => []) });
    const response = await postMove(
      post('https://x/api/board/move', { albumId: 'a', from: 'x1', to: 'x2' }),
    );
    expect(response.status).toBe(409);
  });
});

describe('POST /api/board/albums', () => {
  it('adds albums to the Queue by default', async () => {
    const client = useClient({ albumTracks: vi.fn(async () => albumTracks(anAlbum(), 2)) });
    const response = await postAlbums(post('https://x/api/board/albums', { albumIds: ['alb1'] }));
    await expect(response.json()).resolves.toMatchObject({ added: ['alb1'], to: 'queue' });
    expect(client.addToPlaylist).toHaveBeenCalledWith('pl-queue', expect.any(Array));
  });

  it('files into another column when told to', async () => {
    const client = useClient({ albumTracks: vi.fn(async () => albumTracks(anAlbum(), 2)) });
    await postAlbums(post('https://x/api/board/albums', { albumIds: ['alb1'], to: 'x2' }));
    expect(client.addToPlaylist).toHaveBeenCalledWith('pl-x2', expect.any(Array));
  });

  it('adds albums for a session with no listener to key the cache on', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok' });
    useClient({ albumTracks: vi.fn(async () => albumTracks(anAlbum(), 2)) });
    const response = await postAlbums(post('https://x/api/board/albums', { albumIds: ['alb1'] }));
    expect(response.status).toBe(200);
  });

  it('removes for a session with no listener to key the cache on', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok' });
    const tracks = albumTracks(anAlbum({ id: 'alb1' }), 2);
    useClient({
      playlistItems: vi.fn(async (id: string) =>
        id === 'pl-queue' ? playlistEntries(tracks, ARRIVED) : [],
      ),
    });
    const response = await deleteAlbums(
      post('https://x/api/board/albums', { albumId: 'alb1', from: 'queue' }, 'DELETE'),
    );
    expect(response.status).toBe(200);
  });

  it('falls back to the Queue for a column it does not know', async () => {
    const client = useClient({ albumTracks: vi.fn(async () => albumTracks(anAlbum(), 2)) });
    await postAlbums(post('https://x/api/board/albums', { albumIds: ['alb1'], to: 'nowhere' }));
    expect(client.addToPlaylist).toHaveBeenCalledWith('pl-queue', expect.any(Array));
  });

  it.each([{}, { albumIds: [] }, { albumIds: [1, 2] }])('rejects %j', async (body) => {
    expect((await postAlbums(post('https://x/api/board/albums', body))).status).toBe(400);
  });

  it('refuses when the board playlists are gone', async () => {
    useClient({ myPlaylists: vi.fn(async () => []) });
    const response = await postAlbums(post('https://x/api/board/albums', { albumIds: ['a'] }));
    expect(response.status).toBe(409);
  });
});

describe('DELETE /api/board/albums', () => {
  const tracks = albumTracks(anAlbum({ id: 'alb1' }), 2);

  it('takes an album off the board', async () => {
    const client = useClient({
      playlistItems: vi.fn(async (id: string) =>
        id === 'pl-queue' ? playlistEntries(tracks, ARRIVED) : [],
      ),
    });
    const response = await deleteAlbums(
      post('https://x/api/board/albums', { albumId: 'alb1', from: 'queue' }, 'DELETE'),
    );
    await expect(response.json()).resolves.toEqual({ albumId: 'alb1', trackCount: 2 });
    expect(client.removeFromPlaylist).toHaveBeenCalled();
  });

  it('rejects a request that names no album', async () => {
    const response = await deleteAlbums(
      post('https://x/api/board/albums', { from: 'queue' }, 'DELETE'),
    );
    expect(response.status).toBe(400);
  });

  it('refuses when the board playlists are gone', async () => {
    useClient({ myPlaylists: vi.fn(async () => []) });
    const response = await deleteAlbums(
      post('https://x/api/board/albums', { albumId: 'a', from: 'queue' }, 'DELETE'),
    );
    expect(response.status).toBe(409);
  });
});

describe('/api/setup', () => {
  it('reports a board that is ready', async () => {
    const body = await (await getSetup(new Request('https://x/api/setup'))).json();
    expect(body.ready).toBe(true);
    expect(body.existing).toHaveLength(7);
  });

  it('reports what is missing', async () => {
    useClient({ myPlaylists: vi.fn(async () => []) });
    const body = await (await getSetup(new Request('https://x/api/setup'))).json();
    expect(body.ready).toBe(false);
    expect(body.missing).toHaveLength(7);
  });

  it('creates the seven playlists', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const client = useClient({ myPlaylists: vi.fn(async () => []) });
    const body = await (await postSetup(post('https://x/api/setup', {}))).json();
    expect(body.created).toHaveLength(7);
    expect(body.created[0]).toMatchObject({ name: 'Gauntlet · Queue', id: expect.any(String) });
    expect(client.createPlaylist).toHaveBeenCalledWith('Gauntlet · Queue', false);
    expect(client.me).toHaveBeenCalled();
  });

  it('creates them public when the switch is off', async () => {
    const client = useClient({ myPlaylists: vi.fn(async () => []) });
    await postSetup(post('https://x/api/setup', { private: false }));
    expect(client.createPlaylist).toHaveBeenCalledWith('Gauntlet · Queue', true);
  });

  it('defaults to private for a request with no body', async () => {
    const client = useClient({ myPlaylists: vi.fn(async () => []) });
    await postSetup(post('https://x/api/setup', 'nope'));
    expect(client.createPlaylist).toHaveBeenCalledWith('Gauntlet · Queue', false);
    expect(client.me).toHaveBeenCalled();
  });

  it('explains a 403, which Spotify reports only as "Forbidden"', async () => {
    // Reading the account works, so development mode is ruled out: that refusal
    // covers every request on the token, `me` included.
    useClient({
      myPlaylists: vi.fn(async () => []),
      createPlaylist: vi.fn(async () => {
        throw new SpotifyForbiddenError('Forbidden');
      }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await postSetup(post('https://x/api/setup', {}));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).not.toContain('development mode');
    expect(body.error).toContain('playlist-modify-private');
    expect(body.error).toContain('/api/diagnostics/account');
    // Names the account, so an id mismatch is visible rather than inferred.
    expect(body.error).toContain('id joe');
    // Quotes Spotify, so a wrong guess about the cause is still debuggable.
    expect(body.error).toContain('Forbidden');
    // Handled here rather than by withSpotify, so it has to log here too.
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('403 Forbidden'), expect.anything());
    logged.mockRestore();
  });

  it('names the scope the session was never granted', async () => {
    mocks.auth.mockResolvedValue({
      accessToken: 'tok',
      user: { id: 'joe' },
      scopes: 'user-read-email playlist-modify-private playlist-read-private',
    });
    useClient({
      myPlaylists: vi.fn(async () => []),
      createPlaylist: vi.fn(async () => {
        throw new SpotifyForbiddenError('Forbidden');
      }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Private off means Spotify checks playlist-modify-public, which this
    // session predates — the case a re-consent, and only a re-consent, fixes.
    const body = await (await postSetup(post('https://x/api/setup', { private: false }))).json();
    expect(body.error).toContain('playlist-modify-public');
    expect(body.error).toContain('Sign out and sign in again');
    expect(body.error).not.toContain('development mode');
    logged.mockRestore();
  });

  it('leaves a grant that does hold the scope to the other explanations', async () => {
    mocks.auth.mockResolvedValue({
      accessToken: 'tok',
      user: { id: 'joe' },
      scopes: 'user-read-email playlist-modify-private',
    });
    useClient({
      myPlaylists: vi.fn(async () => []),
      createPlaylist: vi.fn(async () => {
        throw new SpotifyForbiddenError('Forbidden');
      }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = await (await postSetup(post('https://x/api/setup', {}))).json();
    expect(body.error).not.toContain('Sign out and sign in again');
    expect(body.error).toContain('/api/diagnostics/account');
    logged.mockRestore();
  });

  it('falls back to the id when the account has no display name', async () => {
    useClient({
      myPlaylists: vi.fn(async () => []),
      me: vi.fn(async () => aUser({ display_name: null })),
      createPlaylist: vi.fn(async () => {
        throw new SpotifyForbiddenError('Forbidden');
      }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = await (await postSetup(post('https://x/api/setup', {}))).json();
    expect(body.error).toContain('Acting as joe (id joe)');
    logged.mockRestore();
  });

  it('still explains the refusal when it cannot even read the account', async () => {
    useClient({
      myPlaylists: vi.fn(async () => []),
      me: vi.fn(async () => {
        throw new SpotifyForbiddenError('Forbidden');
      }),
      createPlaylist: vi.fn(async () => {
        throw new SpotifyForbiddenError('Forbidden');
      }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = await (await postSetup(post('https://x/api/setup', {}))).json();
    // A token that can't even read its own account is the development-mode
    // case, and the only one where that hint is the right answer.
    expect(body.error).toContain('development mode');
    expect(body.error).toContain('User Management');
    expect(body.error).not.toContain('Acting as');
    logged.mockRestore();
  });

  it('passes any other refusal through untouched', async () => {
    useClient({
      myPlaylists: vi.fn(async () => []),
      createPlaylist: vi.fn(async () => {
        throw new SpotifyError(429, 'Too many requests');
      }),
    });
    const response = await postSetup(post('https://x/api/setup', {}));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'Too many requests' });
  });

  it('creates playlists under the token account even with no id on the session', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok', user: {} });
    const client = useClient({
      myPlaylists: vi.fn(async () => []),
      me: vi.fn(async () => aUser({ id: 'from-token' })),
    });
    expect((await postSetup(post('https://x/api/setup', {}))).status).toBe(200);
    expect(client.createPlaylist).toHaveBeenCalledWith('Gauntlet · Queue', false);
  });

  it('deletes all seven', async () => {
    const client = useClient();
    const body = await (await deleteSetup(new Request('https://x/api/setup', { method: 'DELETE' }))).json();
    expect(body.deleted).toHaveLength(7);
    expect(client.unfollowPlaylist).toHaveBeenCalledTimes(7);
  });
});

describe('GET /api/suggestions', () => {
  it('ranks records the listener already knows a song from', async () => {
    useClient({
      topTracks: vi.fn(async () => [
        aTrack({ id: 't1', name: 'Concorde', album: anAlbum({ id: 'ants' }) }),
        aTrack({ id: 't2', name: 'Basketball Shoes', album: anAlbum({ id: 'ants' }) }),
      ]),
    });
    const body = await (await getSuggestions(new Request('https://x/api/suggestions'))).json();
    expect(body.range).toBe('medium_term');
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].matches).toHaveLength(2);
  });

  it.each([
    ['short', 'short_term'],
    ['medium', 'medium_term'],
    ['long', 'long_term'],
    ['nonsense', 'medium_term'],
  ])('maps range=%s to %s', async (param, expected) => {
    const client = useClient();
    await getSuggestions(new Request(`https://x/api/suggestions?range=${param}`));
    expect(client.topTracks).toHaveBeenCalledWith(expected);
  });

  it('marks a suggestion that is already on the board', async () => {
    useClient({
      topTracks: vi.fn(async () => [aTrack({ album: anAlbum({ id: 'alb1' }) })]),
      playlistItems: vi.fn(async (id: string) =>
        id === 'pl-x2' ? playlistEntries(albumTracks(anAlbum({ id: 'alb1' }), 1), ARRIVED) : [],
      ),
    });
    const body = await (await getSuggestions(new Request('https://x/api/suggestions'))).json();
    expect(body.suggestions[0].onBoard).toBe('x2');
  });

  it('still suggests records before the playlists exist', async () => {
    useClient({
      myPlaylists: vi.fn(async () => []),
      topTracks: vi.fn(async () => [aTrack()]),
    });
    const body = await (await getSuggestions(new Request('https://x/api/suggestions'))).json();
    expect(body.suggestions[0].onBoard).toBeNull();
  });
});

describe('GET /api/catalogue', () => {
  const withTracks = (id: string) => {
    const album = anAlbum({ id });
    return { ...album, tracks: { items: albumTracks(album, 3), next: null, total: 3, limit: 50, offset: 0 } };
  };

  it('searches Spotify by default', async () => {
    const client = useClient({
      searchAlbums: vi.fn(async () => [anAlbum({ id: 'a1' })]),
      albums: vi.fn(async () => [withTracks('a1')]),
    });
    const body = await (await getCatalogue(new Request('https://x/api/catalogue?q=weyes'))).json();
    expect(body.source).toBe('search');
    expect(body.albums).toHaveLength(1);
    expect(client.searchAlbums).toHaveBeenCalledWith('weyes');
  });

  it('returns nothing for an empty query rather than searching for nothing', async () => {
    const client = useClient();
    const body = await (await getCatalogue(new Request('https://x/api/catalogue?q='))).json();
    expect(body.albums).toEqual([]);
    expect(client.searchAlbums).not.toHaveBeenCalled();
  });

  it('returns nothing when no query was given at all', async () => {
    const client = useClient();
    const body = await (await getCatalogue(new Request('https://x/api/catalogue'))).json();
    expect(body.albums).toEqual([]);
    expect(client.searchAlbums).not.toHaveBeenCalled();
  });

  it('resolves a link pasted into the search box', async () => {
    const client = useClient({ album: vi.fn(async () => withTracks('a1')) });
    const body = await (
      await getCatalogue(new Request('https://x/api/catalogue?q=spotify:album:a1'))
    ).json();
    expect(body.albums).toHaveLength(1);
    expect(client.searchAlbums).not.toHaveBeenCalled();
  });

  it('lists saved albums', async () => {
    useClient({ savedAlbums: vi.fn(async () => [{ added_at: 'x', album: withTracks('a1') }]) });
    const body = await (await getCatalogue(new Request('https://x/api/catalogue?source=saved'))).json();
    expect(body.albums).toHaveLength(1);
  });

  it('lists playlists to pick from, marked as the listener owns them', async () => {
    useClient({
      myPlaylists: vi.fn(async () => [aPlaylist({ id: 'p1', name: 'Road trip', images: [] })]),
    });
    const body = await (
      await getCatalogue(new Request('https://x/api/catalogue?source=playlists'))
    ).json();
    expect(body.playlists).toEqual([
      {
        id: 'p1',
        name: 'Road trip',
        trackCount: 0,
        imageUrl: null,
        ownerName: 'joe',
        ownedByMe: true,
        unavailable: false,
      },
    ]);
  });

  it('lists one playlist as tracks, each carrying its album', async () => {
    useClient({
      playlistEntries: vi.fn(async () => importEntries(albumTracks(anAlbum({ id: 'a1' }), 3))),
    });
    const body = await (
      await getCatalogue(new Request('https://x/api/catalogue?source=playlist&id=p1'))
    ).json();
    expect(body.tracks).toHaveLength(3);
    expect(body.tracks[0].album.id).toBe('a1');
    expect(body.albums).toBeUndefined();
  });

  it('needs a playlist id to import one', async () => {
    const response = await getCatalogue(new Request('https://x/api/catalogue?source=playlist'));
    expect(response.status).toBe(400);
  });

  it('resolves an explicitly pasted link', async () => {
    useClient({ album: vi.fn(async () => withTracks('a1')) });
    const body = await (
      await getCatalogue(
        new Request('https://x/api/catalogue?source=link&ref=https://open.spotify.com/album/a1'),
      )
    ).json();
    expect(body.albums).toHaveLength(1);
  });

  it('says so when a link source carries no reference at all', async () => {
    const response = await getCatalogue(new Request('https://x/api/catalogue?source=link'));
    expect(response.status).toBe(400);
  });

  it('says so when a pasted link is not an album', async () => {
    const response = await getCatalogue(new Request('https://x/api/catalogue?source=link&ref=hello'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "That doesn't look like a Spotify album link",
    });
  });

  it('works before the board playlists exist', async () => {
    useClient({
      myPlaylists: vi.fn(async () => []),
      searchAlbums: vi.fn(async () => [anAlbum({ id: 'a1' })]),
      albums: vi.fn(async () => [withTracks('a1')]),
    });
    const body = await (await getCatalogue(new Request('https://x/api/catalogue?q=x'))).json();
    expect(body.albums[0].onBoard).toBeNull();
  });
});

describe('GET /api/account', () => {
  it('reports the account and the seven playlists', async () => {
    useClient({
      me: vi.fn(async () => aUser()),
      playlistItems: vi.fn(async (id: string) =>
        id === 'pl-queue' ? playlistEntries(albumTracks(anAlbum(), 3), ARRIVED) : [],
      ),
    });
    const body = await (await getAccount(new Request('https://x/api/account'))).json();
    expect(body.user).toEqual({
      id: 'joe',
      name: 'joe',
      email: 'joe@example.com',
      product: 'premium',
      image: 'https://i.scdn.co/avatar.jpg',
    });
    expect(body.playlists).toHaveLength(7);
    expect(body.playlists[0]).toMatchObject({ albums: 1, tracks: 3, missing: false });
  });

  it('marks a playlist that has gone missing', async () => {
    useClient({ myPlaylists: vi.fn(async () => []), me: vi.fn(async () => aUser()) });
    const body = await (await getAccount(new Request('https://x/api/account'))).json();
    expect(body.ready).toBe(false);
    expect(body.playlists.every((p: { missing: boolean }) => p.missing)).toBe(true);
  });

  it('bounds the display name, which the header prints beside the avatar', async () => {
    useClient({ me: vi.fn(async () => aUser({ display_name: KIERAN_HEBDEN_ALBUM })) });
    const body = await (await getAccount(new Request('https://x/api/account'))).json();
    expect(body.user.name).toBe(displayName(KIERAN_HEBDEN_ALBUM));
  });

  it('copes with an account that has no picture or email', async () => {
    useClient({ me: vi.fn(async () => aUser({ images: [], email: undefined, product: undefined })) });
    const body = await (await getAccount(new Request('https://x/api/account'))).json();
    expect(body.user).toMatchObject({ image: null, email: null, product: null });
  });
});

describe('/api/player', () => {
  it('reports what is playing', async () => {
    useClient({ playbackState: vi.fn(async () => playbackState()) });
    const body = await (await getPlayer(new Request('https://x/api/player'))).json();
    expect(body.track).toMatchObject({ name: '15 Step', artist: 'Radiohead', albumName: 'In Rainbows' });
    expect(body.device).toMatchObject({ name: 'MacBook Pro' });
    expect(body.playback.isPlaying).toBe(true);
  });

  it('carries the artwork, which is the only art a record off the board has', async () => {
    // The playbar has no card to read it from, so the payload has to bring it.
    useClient({ playbackState: vi.fn(async () => playbackState()) });
    const body = await (await getPlayer(new Request('https://x/api/player'))).json();
    expect(body.track.imageUrl).toBe('https://i.scdn.co/large.jpg');
  });

  it('reports silence', async () => {
    const body = await (await getPlayer(new Request('https://x/api/player'))).json();
    expect(body).toEqual({
      playback: null,
      device: null,
      repeat: 'off',
      albumContextId: null,
      track: null,
    });
  });

  it('names the record that was put on, so position in it can be claimed', async () => {
    useClient({
      playbackState: vi.fn(async () =>
        playbackState({ context: { uri: 'spotify:album:alb1', type: 'album' } }),
      ),
    });
    const body = await (await getPlayer(new Request('https://x/api/player'))).json();
    expect(body.albumContextId).toBe('alb1');
  });

  it('names no record for a track reached through a playlist', async () => {
    // The track still belongs to an album, and the album still has tracks after
    // it — but none of them is what plays next.
    useClient({
      playbackState: vi.fn(async () =>
        playbackState({ context: { uri: 'spotify:playlist:pl1', type: 'playlist' } }),
      ),
    });
    const body = await (await getPlayer(new Request('https://x/api/player'))).json();
    expect(body.track.albumId).toBe('alb1');
    expect(body.albumContextId).toBeNull();
  });

  it('copes with a track that has no album attached', async () => {
    useClient({
      playbackState: vi.fn(async () => playbackState({ item: { ...aTrack(), album: undefined } })),
    });
    const body = await (await getPlayer(new Request('https://x/api/player'))).json();
    expect(body.track.albumId).toBeNull();
    expect(body.track.albumName).toBe('');
    expect(body.track.imageUrl).toBeNull();
  });

  it('plays to the device it was given, and turns shuffle off there', async () => {
    const client = useClient();
    const response = await putPlayer(
      post('https://x/api/player', { albumUri: 'spotify:album:a1', deviceId: 'dev1' }, 'PUT'),
    );
    expect(response.status).toBe(200);
    expect(client.playAlbum).toHaveBeenCalledWith('spotify:album:a1', 'dev1');
    expect(client.setShuffle).toHaveBeenCalledWith(false, 'dev1');
    // Named explicitly, so it never has to consult the device list at all.
    expect(client.devices).not.toHaveBeenCalled();
  });

  it('sets shuffle only once the record has woken the device', async () => {
    // A dormant device accepts `play` and can refuse everything else, so a
    // shuffle sent first is what used to stop the record.
    const order: string[] = [];
    const client = useClient({
      devices: vi.fn(async () => [aDevice()]),
      playAlbum: vi.fn(async () => void order.push('play')),
      setShuffle: vi.fn(async () => void order.push('shuffle')),
    });
    await putPlayer(post('https://x/api/player', { albumUri: 'spotify:album:a1' }, 'PUT'));
    expect(order).toEqual(['play', 'shuffle']);
    expect(client.setShuffle).toHaveBeenCalledWith(false, 'mac');
  });

  it('names a device that is open but idle rather than trusting the active one', async () => {
    // The morning bug: nothing has played since yesterday, so Spotify calls
    // nothing active and a play with no device_id 404s — while the desktop app
    // sits in the device list the whole time.
    const client = useClient({
      devices: vi.fn(async () => [aDevice({ is_active: false })]),
    });
    const response = await putPlayer(
      post('https://x/api/player', { albumUri: 'spotify:album:a1' }, 'PUT'),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ playing: 'spotify:album:a1', deviceId: 'mac' });
    expect(client.playAlbum).toHaveBeenCalledWith('spotify:album:a1', 'mac');
  });

  it('prefers the active device when Spotify has one', async () => {
    const client = useClient({
      devices: vi.fn(async () => [
        aDevice(),
        aDevice({ id: 'spk', name: 'Kitchen', type: 'Speaker', is_active: true }),
      ]),
    });
    await putPlayer(post('https://x/api/player', { albumUri: 'spotify:album:a1' }, 'PUT'));
    expect(client.playAlbum).toHaveBeenCalledWith('spotify:album:a1', 'spk');
  });

  it('treats an empty deviceId as none given rather than as a device', async () => {
    const client = useClient({ devices: vi.fn(async () => [aDevice()]) });
    await putPlayer(
      post('https://x/api/player', { albumUri: 'spotify:album:a1', deviceId: '' }, 'PUT'),
    );
    expect(client.playAlbum).toHaveBeenCalledWith('spotify:album:a1', 'mac');
  });

  it('says there is nothing to play on only when the list really is empty', async () => {
    const client = useClient({ devices: vi.fn(async () => []) });
    const response = await putPlayer(
      post('https://x/api/player', { albumUri: 'spotify:album:a1' }, 'PUT'),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).reason).toBe('NO_ACTIVE_DEVICE');
    // Nothing was sent to Spotify that could only have failed.
    expect(client.playAlbum).not.toHaveBeenCalled();
    expect(client.setShuffle).not.toHaveBeenCalled();
  });

  it('says the same when everything listed refuses Web API commands', async () => {
    useClient({
      devices: vi.fn(async () => [aDevice({ id: 'car', is_restricted: true })]),
    });
    const response = await putPlayer(
      post('https://x/api/player', { albumUri: 'spotify:album:a1' }, 'PUT'),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).reason).toBe('NO_ACTIVE_DEVICE');
  });

  it('needs an album to play', async () => {
    expect((await putPlayer(post('https://x/api/player', {}, 'PUT'))).status).toBe(400);
  });

  it('bounds the names it reports, so the playbar gets what a card gets', async () => {
    useClient({
      playbackState: vi.fn(async () =>
        playbackState({
          item: {
            ...aTrack({ name: KIERAN_HEBDEN_ALBUM }),
            artists: [{ id: 'art1', name: KIERAN_HEBDEN_ALBUM, uri: 'spotify:artist:art1' }],
            album: anAlbum({ name: KIERAN_HEBDEN_ALBUM }),
          },
        }),
      ),
    });
    const body = await (await getPlayer(new Request('https://x/api/player'))).json();
    const bounded = displayName(KIERAN_HEBDEN_ALBUM);
    expect(body.track).toMatchObject({ name: bounded, artist: bounded, albumName: bounded });
  });
});

describe('/api/player/transport', () => {
  const send = (body: unknown) => postTransport(post('https://x/api/player/transport', body));

  it.each([
    ['resume', 'resume'],
    ['pause', 'pause'],
    ['next', 'nextTrack'],
    ['previous', 'previousTrack'],
  ] as const)('passes %s straight through', async (command, method) => {
    const client = useClient();
    const response = await send({ command, deviceId: 'dev1' });
    expect(response.status).toBe(200);
    expect(client[method]).toHaveBeenCalledWith('dev1');
  });

  it('seeks to a position', async () => {
    const client = useClient();
    await send({ command: 'seek', value: 90_000 });
    expect(client.seek).toHaveBeenCalledWith(90_000, undefined);
  });

  it('sets volume', async () => {
    const client = useClient();
    await send({ command: 'volume', value: 40 });
    expect(client.setVolume).toHaveBeenCalledWith(40, undefined);
  });

  it('turns repeat on and off', async () => {
    const client = useClient();
    await send({ command: 'repeat', value: 1 });
    expect(client.setRepeat).toHaveBeenCalledWith('context', undefined);
    await send({ command: 'repeat', value: 0 });
    expect(client.setRepeat).toHaveBeenCalledWith('off', undefined);
  });

  it('treats a command with no value as nought', async () => {
    const client = useClient();
    await send({ command: 'seek' });
    expect(client.seek).toHaveBeenCalledWith(0, undefined);
  });

  it('hands playback to another device', async () => {
    const client = useClient();
    await send({ command: 'transfer', deviceId: 'dev2' });
    expect(client.transferPlayback).toHaveBeenCalledWith('dev2', true);
  });

  it('cannot transfer playback to nowhere', async () => {
    const response = await send({ command: 'transfer' });
    expect(response.status).toBe(400);
  });

  it.each([{}, { command: 'shuffle' }, { command: 42 }, 'not json'])(
    'rejects %j',
    async (body) => {
      expect((await send(body)).status).toBe(400);
    },
  );

  it('lists the devices playback can be handed to', async () => {
    useClient({ devices: vi.fn(async () => [{ id: 'dev2', name: 'Kitchen speaker' }]) });
    const body = await (
      await getDevices(new Request('https://x/api/player/transport'))
    ).json();
    expect(body.devices).toEqual([{ id: 'dev2', name: 'Kitchen speaker' }]);
  });

  it('lists an idle device, since that is still somewhere to hand playback to', async () => {
    useClient({ devices: vi.fn(async () => [aDevice({ is_active: false })]) });
    const body = await (await getDevices(new Request('https://x/api/player/transport'))).json();
    expect(body.devices).toHaveLength(1);
  });

  it('leaves out the ones a transfer could never reach', async () => {
    useClient({
      devices: vi.fn(async () => [
        aDevice({ id: null, name: 'Nameless' }),
        aDevice({ id: 'car', name: 'Car', is_restricted: true }),
        aDevice({ id: 'phone', name: 'iPhone', type: 'Smartphone' }),
      ]),
    });
    const body = await (await getDevices(new Request('https://x/api/player/transport'))).json();
    expect(body.devices.map((device: { name: string }) => device.name)).toEqual(['iPhone']);
  });
});

describe('GET /api/diagnostics/account', () => {
  const request = () => new Request('https://x/api/diagnostics/account');

  it('reports the two ids that have to match for a playlist to be creatable', async () => {
    useClient({ me: vi.fn(async () => aUser({ id: 'joe' })) });
    const body = await (await getAccountDiagnostics(request())).json();
    expect(body).toMatchObject({ sessionUserId: 'joe', spotifyUserId: 'joe', idsMatch: true });
  });

  it('says so when the session is filing under the wrong account', async () => {
    // Spotify answers 403 rather than explaining this, so the app has to.
    mocks.auth.mockResolvedValue({ accessToken: 'tok', user: { id: 'someone-else' } });
    useClient({ me: vi.fn(async () => aUser({ id: 'joe' })) });
    const body = await (await getAccountDiagnostics(request())).json();
    expect(body.idsMatch).toBe(false);
  });

  it('names any scope Spotify did not actually grant', async () => {
    mocks.auth.mockResolvedValue({
      accessToken: 'tok',
      user: { id: 'joe' },
      scopes: 'user-read-email playlist-read-private',
    });
    const body = await (await getAccountDiagnostics(request())).json();
    expect(body.complete).toBe(false);
    expect(body.missing).toContain('playlist-modify-private');
  });

  it('copes with a session that predates scope recording', async () => {
    const body = await (await getAccountDiagnostics(request())).json();
    expect(body.granted).toBeNull();
    expect(body.complete).toBe(true);
  });

  it('copes with an account whose product Spotify did not report', async () => {
    useClient({ me: vi.fn(async () => aUser({ product: undefined })) });
    const body = await (await getAccountDiagnostics(request())).json();
    expect(body.product).toBeNull();
  });

  it('copes with a session carrying no user at all', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok' });
    const body = await (await getAccountDiagnostics(request())).json();
    expect(body.sessionUserId).toBeNull();
  });
});

describe('GET /api/diagnostics/played-at', () => {
  it('reports which reading of played_at the listener history fits', async () => {
    const album = anAlbum();
    const tracks = [
      aTrack({ id: 't1', duration_ms: 120_000, album }),
      aTrack({ id: 't2', duration_ms: 300_000, album }),
      aTrack({ id: 't3', duration_ms: 90_000, album }),
    ];
    const start = Date.parse('2026-07-01T12:00:00.000Z');
    // Timestamps laid out as if played_at marked the end of each track.
    useClient({
      recentlyPlayed: vi.fn(async () => [
        playHistory(tracks[0] as never, new Date(start + 120_000).toISOString()),
        playHistory(tracks[1] as never, new Date(start + 420_000).toISOString()),
        playHistory(tracks[2] as never, new Date(start + 510_000).toISOString()),
      ]),
    });

    const body = await (
      await getDiagnostics(new Request('https://x/api/diagnostics/played-at'))
    ).json();
    expect(body.bestFit).toBe('end');
    expect(body.configured).toBe('end');
    expect(body.agrees).toBe(true);
    expect(body.readings).toHaveLength(3);
  });

  it('reaches no verdict on a history it cannot read', async () => {
    const body = await (
      await getDiagnostics(new Request('https://x/api/diagnostics/played-at'))
    ).json();
    expect(body.bestFit).toBeNull();
    expect(body.agrees).toBeNull();
  });

  it('skips history entries with no track id', async () => {
    useClient({
      recentlyPlayed: vi.fn(async () => [
        playHistory(aTrack({ id: null }), '2026-07-01T12:00:00.000Z'),
      ]),
    });
    const body = await (
      await getDiagnostics(new Request('https://x/api/diagnostics/played-at'))
    ).json();
    expect(body.readings).toEqual([]);
  });

  it('copes with a history entry whose track has no album', async () => {
    useClient({
      recentlyPlayed: vi.fn(async () => [
        playHistory({ ...aTrack(), album: undefined }, '2026-07-01T12:00:00.000Z'),
      ]),
    });
    const body = await (
      await getDiagnostics(new Request('https://x/api/diagnostics/played-at'))
    ).json();
    expect(body.readings).toHaveLength(1);
  });
});
