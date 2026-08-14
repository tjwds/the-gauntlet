import { describe, expect, it, vi } from 'vitest';
import { chunked, PAGE_CONCURRENCY, SEARCH_LIMIT, SpotifyClient, SPOTIFY_API } from './client';
import {
  SpotifyAuthError,
  SpotifyError,
  SpotifyForbiddenError,
  SpotifyRateLimitError,
  isSpotifyError,
} from './errors';
import { anAlbum, albumTracks, aPlaylist, aTrack, aUser } from '@/test/fixtures';

interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A fetch that answers with the queued replies, in order, recording each call. */
function stubFetch(replies: Reply[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift() ?? { status: 200, body: {} };
    const status = reply.status ?? 200;
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name: string) => reply.headers?.[name] ?? null },
      text: async () => text,
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function clientWith(replies: Reply[], sleep = vi.fn(async () => undefined)) {
  const { impl, calls } = stubFetch(replies);
  const client = new SpotifyClient({ accessToken: 'tok', fetchImpl: impl, sleep });
  return { client, calls, sleep };
}

describe('request', () => {
  it('bears the access token', async () => {
    const { client, calls } = clientWith([{ body: aUser() }]);
    await client.me();
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/me`);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('sends a JSON body only when there is one', async () => {
    const { client, calls } = clientWith([{ status: 204 }, { status: 200, body: {} }]);
    await client.transferPlayback('dev1', true);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ device_ids: ['dev1'], play: true }));

    await client.me();
    expect((calls[1]?.init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('builds a query string, dropping anything undefined', async () => {
    const { client, calls } = clientWith([{ status: 204 }]);
    await client.setShuffle(false);
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/me/player/shuffle?state=false`);
  });

  it('appends to a path that already has a query', async () => {
    const { client, calls } = clientWith([{ body: { items: [], next: null } }]);
    await client.getAll('/thing?a=1', { b: '2' });
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/thing?a=1&b=2`);
  });

  it('returns undefined for the empty responses the player endpoints give', async () => {
    const { client } = clientWith([{ status: 204 }]);
    await expect(client.playbackState()).resolves.toBeUndefined();
  });

  it('treats an accepted-but-empty response the same way', async () => {
    const { client } = clientWith([{ status: 202 }]);
    await expect(client.playbackState()).resolves.toBeUndefined();
  });

  it('waits out a rate limit and tries again', async () => {
    const { client, sleep } = clientWith([
      { status: 429, headers: { 'Retry-After': '2' } },
      { body: aUser() },
    ]);
    await expect(client.me()).resolves.toMatchObject({ id: 'joe' });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('says out loud that it is being rate limited, even when it can wait it out', async () => {
    // Waiting silently makes a throttled app look merely slow, and Spotify's
    // Retry-After runs to minutes once tripped.
    const onRateLimit = vi.fn();
    const { impl } = stubFetch([
      { status: 429, headers: { 'Retry-After': '3' } },
      { body: aUser() },
    ]);
    const client = new SpotifyClient({
      accessToken: 't',
      fetchImpl: impl,
      sleep: vi.fn(async () => undefined),
      onRateLimit,
    });
    await client.me();
    expect(onRateLimit).toHaveBeenCalledWith(`${SPOTIFY_API}/me`, 3);
  });

  it('warns on the console when given no rate-limit handler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { impl } = stubFetch([{ status: 429, headers: { 'Retry-After': '2' } }, { body: aUser() }]);
    const client = new SpotifyClient({
      accessToken: 't',
      fetchImpl: impl,
      sleep: vi.fn(async () => undefined),
    });
    await client.me();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rate limited, waiting 2s'));
    warn.mockRestore();
  });

  it('waits a second when the rate limit does not say how long', async () => {
    const { client, sleep } = clientWith([{ status: 429 }, { body: aUser() }]);
    await client.me();
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('waits a second when the rate limit says something absurd', async () => {
    const { client, sleep } = clientWith([
      { status: 429, headers: { 'Retry-After': 'soon' } },
      { body: aUser() },
    ]);
    await client.me();
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('gives up on a rate limit that will not clear', async () => {
    const { client } = clientWith([{ status: 429 }, { status: 429 }, { status: 429 }, { status: 429 }]);
    await expect(client.me()).rejects.toBeInstanceOf(SpotifyRateLimitError);
  });

  it('refuses to sit out a long rate limit', async () => {
    // Spotify's Retry-After runs to hours once tripped. Sleeping through it is
    // indistinguishable from a hang, and the listener watches a spinner all day.
    const sleep = vi.fn(async () => undefined);
    const { impl } = stubFetch([{ status: 429, headers: { 'Retry-After': '83244' } }]);
    const client = new SpotifyClient({ accessToken: 't', fetchImpl: impl, sleep });
    const error = await client.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpotifyRateLimitError);
    expect((error as SpotifyRateLimitError).retryAfterSeconds).toBe(83244);
    expect((error as Error).message).toContain('23 hours');
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    [45, '45 seconds'],
    [600, '10 minutes'],
    [7200, '2 hours'],
  ])('describes a %i second wait as %s', async (seconds, expected) => {
    const { impl } = stubFetch([{ status: 429, headers: { 'Retry-After': String(seconds) } }]);
    const client = new SpotifyClient({
      accessToken: 't',
      fetchImpl: impl,
      sleep: vi.fn(async () => undefined),
    });
    await expect(client.me()).rejects.toThrow(expected);
  });

  it('still waits out a short one', async () => {
    const { client, sleep } = clientWith([
      { status: 429, headers: { 'Retry-After': '2' } },
      { body: aUser() },
    ]);
    await expect(client.me()).resolves.toMatchObject({ id: 'joe' });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('raises an auth error when the token is rejected', async () => {
    const { client } = clientWith([
      { status: 401, body: { error: { message: 'The access token expired' } } },
    ]);
    await expect(client.me()).rejects.toBeInstanceOf(SpotifyAuthError);
  });

  it('raises a forbidden error, which is what a free account gets', async () => {
    const { client } = clientWith([
      { status: 403, body: { error: { message: 'Player command failed: Premium required' } } },
    ]);
    const error = await client.playAlbum('spotify:album:x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpotifyForbiddenError);
    expect(isSpotifyError(error)).toBe(true);
    expect((error as SpotifyError).status).toBe(403);
  });

  it('raises a plain error for anything else', async () => {
    const { client } = clientWith([{ status: 500, body: { error: 'server exploded' } }]);
    await expect(client.me()).rejects.toThrow('server exploded');
  });

  it('falls back to the status when the failure has no message', async () => {
    const { client } = clientWith([{ status: 502, body: { nothing: true } }]);
    await expect(client.me()).rejects.toThrow('Spotify responded 502');
  });

  it('copes with a failure body that is not JSON at all', async () => {
    const { client } = clientWith([{ status: 500, body: undefined }]);
    await expect(client.me()).rejects.toThrow('Spotify responded 500');
  });

  it('copes with an error object that is not shaped like one', async () => {
    const { client } = clientWith([{ status: 400, body: { error: { code: 7 } } }]);
    await expect(client.me()).rejects.toThrow('Spotify responded 400');
  });

  it('falls back to the status when the error message is not a string', async () => {
    const { client } = clientWith([{ status: 400, body: { error: { message: { code: 7 } } } }]);
    await expect(client.me()).rejects.toThrow('Spotify responded 400');
  });

  it('does not choke on a body that is not valid JSON', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          status: 200,
          ok: true,
          headers: { get: () => null },
          text: async () => 'not json',
        }) as unknown as Response,
    );
    const client = new SpotifyClient({ accessToken: 't', fetchImpl: fetchImpl as typeof fetch });
    await expect(client.me()).resolves.toBe('not json');
  });

  it('uses the global fetch when it is given none', () => {
    const original = globalThis.fetch;
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const client = new SpotifyClient({ accessToken: 't' });
    void client.me().catch(() => undefined);
    expect(spy).toHaveBeenCalled();
    globalThis.fetch = original;
  });

  it('sleeps for real when it is given no sleeper', async () => {
    vi.useFakeTimers();
    const { impl } = stubFetch([{ status: 429, headers: { 'Retry-After': '0' } }, { body: aUser() }]);
    const client = new SpotifyClient({ accessToken: 't', fetchImpl: impl });
    const promise = client.me();
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toMatchObject({ id: 'joe' });
    vi.useRealTimers();
  });
});

describe('getAll', () => {
  const page = (items: unknown[], total: number, limit = 2, offset = 0) => ({
    body: { items, total, limit, offset, next: null },
  });

  it('asks for the remaining pages by offset, not one next at a time', async () => {
    // /me/playlists is on the path of every board read; walking it serially is
    // the difference between one round trip and a dozen on a large library.
    const { client, calls } = clientWith([
      page([1, 2], 6),
      page([3, 4], 6, 2, 2),
      page([5, 6], 6, 2, 4),
    ]);
    await expect(client.getAll('/thing', { limit: 2 })).resolves.toEqual([1, 2, 3, 4, 5, 6]);
    expect(calls).toHaveLength(3);
    expect(calls[1]?.url).toContain('offset=2');
    expect(calls[2]?.url).toContain('offset=4');
  });

  it('asks only once when the first page is the whole thing', async () => {
    const { client, calls } = clientWith([page([1, 2], 2)]);
    await expect(client.getAll('/thing')).resolves.toEqual([1, 2]);
    expect(calls).toHaveLength(1);
  });

  it('keeps the rest of the query on every page', async () => {
    const { client, calls } = clientWith([page([1], 2, 1), page([2], 2, 1, 1)]);
    await client.getAll('/thing', { limit: 1, fields: 'items(id)' });
    expect(calls[1]?.url).toContain('fields=items%28id%29');
  });

  it('goes a few pages at a time rather than all at once', async () => {
    // Politeness: a thousand-playlist library shouldn't fire twenty requests
    // simultaneously and trip the rate limiter.
    let inFlight = 0;
    let peak = 0;
    const impl = vi.fn(async (url: string | URL) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      const offset = Number(new URL(String(url)).searchParams.get('offset') ?? '0');
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ items: [offset], total: 20, limit: 1, offset, next: null }),
      } as unknown as Response;
    });
    const client = new SpotifyClient({ accessToken: 't', fetchImpl: impl as typeof fetch });
    await client.getAll('/thing', { limit: 1 });
    expect(peak).toBeLessThanOrEqual(PAGE_CONCURRENCY);
  });

  it('falls back to following next when there is no total to work from', async () => {
    const { client, calls } = clientWith([
      { body: { items: [{ id: 1 }], total: 0, limit: 0, next: 'https://api.spotify.com/v1/next-page' } },
      { body: { items: [{ id: 2 }], total: 0, limit: 0, next: null } },
    ]);
    await expect(client.getAll('/me/playlists')).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls[1]?.url).toBe('https://api.spotify.com/v1/next-page');
  });
});

describe('playlists', () => {
  it('lists every playlist the listener has, fifty at a time', async () => {
    const { client, calls } = clientWith([
      { body: { items: [aPlaylist()], next: null } },
    ]);
    await expect(client.myPlaylists()).resolves.toHaveLength(1);
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/me/playlists?limit=50`);
  });

  it('reads just the first page, which is where the seven usually are', async () => {
    const { client, calls } = clientWith([
      { body: { items: [aPlaylist()], total: 715, limit: 50, offset: 0, next: 'x' } },
    ]);
    const page = await client.myPlaylistsFirstPage();
    expect(page.total).toBe(715);
    // One request, not fifteen: the point of the whole thing.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/me/playlists?limit=50`);
  });

  it('creates a playlist under the listener, public or not', async () => {
    const { client, calls } = clientWith([{ body: { id: 'new' } }]);
    await client.createPlaylist('Gauntlet · Queue', false);
    // Not /users/{id}/playlists, which was removed in February 2026 and now
    // answers 403 rather than saying it moved.
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/me/playlists`);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      name: 'Gauntlet · Queue',
      public: false,
    });
  });

  it('asks for item as well as the deprecated track field', async () => {
    const { client, calls } = clientWith([{ body: { items: [], next: null } }]);
    await client.playlistItems('pl1');
    expect(calls[0]?.url).toContain(`${SPOTIFY_API}/playlists/pl1/items`);
    expect(calls[0]?.url).toContain('fields=');
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain('item(');
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain('track(');
  });

  it('writes playlist additions a hundred at a time', async () => {
    const { client, calls } = clientWith([{ body: {} }, { body: {} }]);
    await client.addToPlaylist('pl1', Array.from({ length: 150 }, (_, i) => `uri${i}`));
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/playlists/pl1/items`);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0]?.init.body)).uris).toHaveLength(100);
    expect(JSON.parse(String(calls[1]?.init.body)).uris).toHaveLength(50);
  });

  it('removes tracks in the shape the API wants', async () => {
    const { client, calls } = clientWith([{ body: {} }]);
    await client.removeFromPlaylist('pl1', ['a', 'b']);
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/playlists/pl1/items`);
    expect(calls[0]?.init.method).toBe('DELETE');
    // `tracks` was renamed to `items` when the path was.
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ items: [{ uri: 'a' }, { uri: 'b' }] });
  });

  it('writes nothing when there is nothing to write', async () => {
    const { client, calls } = clientWith([]);
    await client.addToPlaylist('pl1', []);
    await client.removeFromPlaylist('pl1', []);
    expect(calls).toHaveLength(0);
  });

  it('unfollows a playlist, which is how Spotify deletes one', async () => {
    const { client, calls } = clientWith([{ status: 200, body: {} }]);
    await client.unfollowPlaylist('pl1');
    // The followers endpoint is gone; the library one takes a URI, not an id.
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/me/library`);
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      uris: ['spotify:playlist:pl1'],
    });
  });
});

describe('catalogue', () => {
  it('searches albums only', async () => {
    const { client, calls } = clientWith([{ body: { albums: { items: [anAlbum()] } } }]);
    await expect(client.searchAlbums('weyes blood')).resolves.toHaveLength(1);
    expect(calls[0]?.url).toContain('type=album');
    expect(calls[0]?.url).toContain('q=weyes+blood');
  });

  it('copes with a search that matched nothing', async () => {
    const { client } = clientWith([{ body: {} }]);
    await expect(client.searchAlbums('zzz')).resolves.toEqual([]);
  });

  // Search is the one paged endpoint that doesn't take fifty. Twenty — the
  // number this asked for until August 2026 — is refused as 400 "Invalid
  // limit", which fails the whole search rather than shortening it, so the
  // ceiling is asserted here and not just kept in a constant.
  it('never asks search for more results than Spotify allows', async () => {
    expect(SEARCH_LIMIT).toBeLessThanOrEqual(10);
    const { client, calls } = clientWith([{ body: { albums: { items: [] } } }, { body: { albums: { items: [] } } }]);

    await client.searchAlbums('yard act');
    expect(calls[0]?.url).toContain(`limit=${SEARCH_LIMIT}`);

    await client.searchAlbums('yard act', 20);
    expect(calls[1]?.url).toContain(`limit=${SEARCH_LIMIT}`);
  });

  // The batch endpoint was removed in February 2026, so this is one request per
  // album now — twenty in flight rather than twenty in a call.
  it('fetches albums one at a time, twenty in flight', async () => {
    const { client, calls } = clientWith(Array.from({ length: 25 }, () => ({ body: anAlbum() })));
    const ids = Array.from({ length: 25 }, (_, i) => `id${i}`);
    await expect(client.albums(ids)).resolves.toHaveLength(25);
    expect(calls).toHaveLength(25);
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/albums/id0`);
  });

  it('drops an album it cannot read rather than failing the batch', async () => {
    const { client } = clientWith([
      { body: anAlbum() },
      { status: 404, body: { error: { status: 404, message: 'Not found' } } },
      { body: anAlbum() },
    ]);
    await expect(client.albums(['a', 'b', 'c'])).resolves.toHaveLength(2);
  });

  it('reads a single album', async () => {
    const { client, calls } = clientWith([{ body: anAlbum() }]);
    await client.album('alb1');
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/albums/alb1`);
  });

  it('reads the tracks of an album', async () => {
    const { client } = clientWith([
      { body: { items: albumTracks(anAlbum(), 3), next: null } },
    ]);
    await expect(client.albumTracks('alb1')).resolves.toHaveLength(3);
  });

  it('reads saved albums', async () => {
    const { client } = clientWith([
      { body: { items: [{ added_at: 'x', album: anAlbum() }], next: null } },
    ]);
    await expect(client.savedAlbums()).resolves.toHaveLength(1);
  });

  it('reads top tracks for a time range', async () => {
    const { client, calls } = clientWith([{ body: { items: [aTrack()] } }]);
    await expect(client.topTracks('short_term')).resolves.toHaveLength(1);
    expect(calls[0]?.url).toContain('time_range=short_term');
  });
});

describe('playback', () => {
  it('reads recently-played fifty at a time, which is the ceiling', async () => {
    const { client, calls } = clientWith([{ body: { items: [] } }]);
    await client.recentlyPlayed();
    expect(calls[0]?.url).toContain('limit=50');
  });

  it('lists devices', async () => {
    const { client } = clientWith([{ body: { devices: [{ id: 'd1' }] } }]);
    await expect(client.devices()).resolves.toEqual([{ id: 'd1' }]);
  });

  it('starts an album from track one', async () => {
    const { client, calls } = clientWith([{ status: 204 }]);
    await client.playAlbum('spotify:album:alb1', 'dev1');
    expect(calls[0]?.url).toContain('device_id=dev1');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      context_uri: 'spotify:album:alb1',
      offset: { position: 0 },
      position_ms: 0,
    });
  });

  it('sets repeat', async () => {
    const { client, calls } = clientWith([{ status: 204 }]);
    await client.setRepeat('context', 'dev1');
    expect(calls[0]?.url).toBe(
      `${SPOTIFY_API}/me/player/repeat?state=context&device_id=dev1`,
    );
    expect(calls[0]?.init.method).toBe('PUT');
  });

  it('resumes and pauses', async () => {
    const { client, calls } = clientWith([{ status: 204 }, { status: 204 }]);
    await client.resume('dev1');
    await client.pause();
    expect(calls[0]?.url).toBe(`${SPOTIFY_API}/me/player/play?device_id=dev1`);
    expect(calls[1]?.url).toBe(`${SPOTIFY_API}/me/player/pause`);
  });

  it('skips forward and back, which the transport must let it', async () => {
    const { client, calls } = clientWith([{ status: 204 }, { status: 204 }]);
    await client.nextTrack('dev1');
    await client.previousTrack();
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.url).toContain('/me/player/next');
    expect(calls[1]?.url).toBe(`${SPOTIFY_API}/me/player/previous`);
  });

  it('seeks to a whole millisecond, never a negative one', async () => {
    const { client, calls } = clientWith([{ status: 204 }, { status: 204 }]);
    await client.seek(1234.6);
    await client.seek(-50);
    expect(calls[0]?.url).toContain('position_ms=1235');
    expect(calls[1]?.url).toContain('position_ms=0');
  });

  it('keeps volume inside nought and a hundred', async () => {
    const { client, calls } = clientWith([{ status: 204 }, { status: 204 }, { status: 204 }]);
    await client.setVolume(64.4, 'dev1');
    await client.setVolume(140);
    await client.setVolume(-10);
    expect(calls[0]?.url).toContain('volume_percent=64');
    expect(calls[1]?.url).toContain('volume_percent=100');
    expect(calls[2]?.url).toContain('volume_percent=0');
  });
});

describe('chunked', () => {
  it('splits a list into runs of at most n', () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 2)).toEqual([]);
  });
});
