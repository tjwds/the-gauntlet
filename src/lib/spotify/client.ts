/**
 * A thin, typed wrapper over the Spotify Web API. Only the endpoints this app
 * uses are here, and none of the ones closed to new apps in November 2024 —
 * no Recommendations, Related Artists, Audio Features or preview_url.
 *
 * February 2026 cut development-mode apps down to a smaller endpoint set, and
 * every playlist endpoint this app depends on was renamed rather than dropped:
 * `/playlists/{id}/tracks` became `/playlists/{id}/items`, creation moved from
 * `/users/{id}/playlists` to `/me/playlists`, and unfollowing moved into the
 * generic `/me/library`. The removed spellings answer 403 "Forbidden", which
 * names nothing — hence this note, so the next 403 here is read as a path
 * change rather than a permission.
 */

import {
  SpotifyAuthError,
  SpotifyError,
  SpotifyForbiddenError,
  SpotifyRateLimitError,
} from './errors';
import type {
  Paged,
  PlaybackState,
  PlayHistoryObject,
  PlaylistEntry,
  PlaylistTrackObject,
  SavedAlbumObject,
  SearchResponse,
  SpotifyAlbum,
  SpotifyDevice,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUser,
  TimeRange,
} from './types';

export const SPOTIFY_API = 'https://api.spotify.com/v1';

/** Spotify's ceiling for playlist writes. */
export const PLAYLIST_WRITE_CHUNK = 100;

/**
 * Albums are fetched one request each: the batch `GET /albums` was removed in
 * February 2026 with no replacement. This caps how many are in flight at once.
 */
export const ALBUM_FETCH_CONCURRENCY = 20;

/** The window `recently-played` gives us. Four long records and the oldest pass is gone. */
export const HISTORY_LIMIT = 50;

/**
 * The most `/search` will answer with. Its documented range is `0 - 10`, well
 * down from the fifty the rest of the paged endpoints still take, and outside
 * it the endpoint refuses the whole request as 400 "Invalid limit" rather than
 * clamping — so one stale number here doesn't shorten a search, it takes every
 * search out. Zero is refused too, documented range or not.
 */
export const SEARCH_LIMIT = 10;

/** Pages requested at once when reading a paged endpoint to the end. */
export const PAGE_CONCURRENCY = 5;

const MAX_RETRIES = 3;

/** Longest we'll sit waiting out a 429 before giving up and saying so. */
export const MAX_BACKOFF_SECONDS = 10;

export interface SpotifyClientOptions {
  accessToken: string;
  fetchImpl?: typeof fetch;
  /** Injected so rate-limit backoff doesn't make tests wait. */
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  /** Called when Spotify asks us to back off. Defaults to a console warning. */
  onRateLimit?: (url: string, seconds: number) => void;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Absolute URL, used by the pagination helper following `next`. */
  absolute?: boolean;
  query?: Record<string, string | number | boolean | undefined>;
}

/** The fields of a playlisted track this app reads. */
const TRACK_FIELDS =
  'id,name,uri,duration_ms,track_number,disc_number,is_local,artists(id,name,uri),album(id,name,uri,album_type,total_tracks,release_date,images,artists(id,name,uri))';

/** `track` is deprecated in favour of `item`; ask for both and prefer `item`. */
const entryFields = (fields: string) =>
  `items(added_at,item(${fields}),track(${fields})),next,total,limit,offset`;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const defaultRateLimitWarning = (url: string, seconds: number) => {
  console.warn(`[spotify] rate limited, waiting ${seconds}s before retrying ${url}`);
};

export class SpotifyClient {
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseUrl: string;
  private readonly onRateLimit: (url: string, seconds: number) => void;

  constructor({
    accessToken,
    fetchImpl,
    sleep,
    baseUrl = SPOTIFY_API,
    onRateLimit = defaultRateLimitWarning,
  }: SpotifyClientOptions) {
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleep = sleep ?? defaultSleep;
    this.baseUrl = baseUrl;
    this.onRateLimit = onRateLimit;
  }

  private url(path: string, query?: RequestOptions['query'], absolute = false): string {
    const base = absolute ? path : `${this.baseUrl}${path}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const suffix = params.toString();
    return suffix ? `${base}${base.includes('?') ? '&' : '?'}${suffix}` : base;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, absolute = false, query } = options;
    const target = this.url(path, query, absolute);

    for (let attempt = 0; ; attempt += 1) {
      const response = await this.fetchImpl(target, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store',
      });

      if (response.status === 429) {
        const header = response.headers.get('Retry-After');
        const retryAfter = Number(header ?? '1');
        const seconds = Number.isFinite(retryAfter) ? retryAfter : 1;
        // Silently waiting makes a rate-limited app look merely slow. Spotify's
        // Retry-After runs to hours once tripped, and that is worth seeing.
        this.onRateLimit(target, seconds);

        // Never sleep through a long one. Waiting out a multi-hour Retry-After
        // is indistinguishable from a hang, and the listener deserves to be
        // told rather than left watching a spinner until tomorrow.
        if (seconds > MAX_BACKOFF_SECONDS || attempt >= MAX_RETRIES) {
          throw new SpotifyRateLimitError(seconds, target);
        }
        await this.sleep(seconds * 1000);
        continue;
      }

      if (response.status === 204 || response.status === 202) {
        return undefined as T;
      }

      const text = await response.text();
      const payload: unknown = text ? safeJson(text) : undefined;

      if (response.ok) return payload as T;

      const message = errorMessage(payload) ?? `Spotify responded ${response.status}`;
      if (response.status === 401) throw new SpotifyAuthError(message, payload);
      if (response.status === 403) throw new SpotifyForbiddenError(message, payload);
      throw new SpotifyError(response.status, message, payload);
    }
  }

  /**
   * Read a paged endpoint to the end. Board reads depend on getting everything.
   *
   * The first page reports the total, so the rest are asked for by offset and
   * in parallel rather than walked one `next` at a time. A library with a few
   * hundred playlists is the difference between one round trip and a dozen,
   * and `/me/playlists` is on the path of every single board read.
   */
  async getAll<T>(path: string, query?: RequestOptions['query']): Promise<T[]> {
    const first = await this.request<Paged<T>>(path, { query });
    const pageSize = first.limit;

    if (pageSize > 0 && first.total > first.items.length) {
      const offsets: number[] = [];
      for (let offset = pageSize; offset < first.total; offset += pageSize) offsets.push(offset);

      const pages: Array<Paged<T>> = [];
      // A few at a time: parallel enough to matter, polite enough not to trip
      // the rate limiter on a big library.
      for (const batch of chunked(offsets, PAGE_CONCURRENCY)) {
        pages.push(
          ...(await Promise.all(
            batch.map((offset) => this.request<Paged<T>>(path, { query: { ...query, offset } })),
          )),
        );
      }
      return [first, ...pages].flatMap((page) => page.items);
    }

    // No total to work from: fall back to following `next`.
    const items = [...first.items];
    let page = first;
    while (page.next) {
      page = await this.request<Paged<T>>(page.next, { absolute: true });
      items.push(...page.items);
    }
    return items;
  }

  // ---- account -----------------------------------------------------------

  me(): Promise<SpotifyUser> {
    return this.request<SpotifyUser>('/me');
  }

  // ---- playlists ---------------------------------------------------------

  myPlaylists(): Promise<SpotifyPlaylist[]> {
    return this.getAll<SpotifyPlaylist>('/me/playlists', { limit: 50 });
  }

  /**
   * The first page only. Spotify lists playlists most-recently-added first, so
   * the seven board playlists are almost always here — which lets the lookup
   * finish in one request instead of paging a fifteen-year-old library.
   */
  myPlaylistsFirstPage(): Promise<{ items: SpotifyPlaylist[]; total: number }> {
    return this.request<Paged<SpotifyPlaylist>>('/me/playlists', { query: { limit: 50 } });
  }

  /**
   * No user id in the path any more: creation is always for the token's own
   * account, which is all `/users/{id}/playlists` ever allowed anyway.
   */
  createPlaylist(name: string, isPublic: boolean): Promise<SpotifyPlaylist> {
    return this.request<SpotifyPlaylist>('/me/playlists', {
      method: 'POST',
      body: { name, public: isPublic, description: 'A column of The Gauntlet.' },
    });
  }

  playlistItems(playlistId: string): Promise<PlaylistTrackObject[]> {
    return this.getAll<PlaylistTrackObject>(`/playlists/${playlistId}/items`, {
      limit: 50,
      fields: entryFields(TRACK_FIELDS),
    });
  }

  /**
   * A playlist the listener picked, read for the add-albums screen. One read,
   * no follow-up lookups: the simplified album on each track carries the id,
   * name, type, total_tracks and art every row needs.
   *
   * Wider than `playlistItems`: it asks for episodes too, so a podcast in the
   * list can be shown and explained rather than quietly missing from a list the
   * listener can already see in Spotify.
   */
  playlistEntries(playlistId: string): Promise<PlaylistEntry[]> {
    return this.getAll<PlaylistEntry>(`/playlists/${playlistId}/items`, {
      limit: 50,
      additional_types: 'track,episode',
      fields: entryFields(`${TRACK_FIELDS},type,show(name)`),
    });
  }

  async addToPlaylist(playlistId: string, uris: string[]): Promise<void> {
    for (const chunk of chunked(uris, PLAYLIST_WRITE_CHUNK)) {
      await this.request(`/playlists/${playlistId}/items`, { method: 'POST', body: { uris: chunk } });
    }
  }

  async removeFromPlaylist(playlistId: string, uris: string[]): Promise<void> {
    for (const chunk of chunked(uris, PLAYLIST_WRITE_CHUNK)) {
      await this.request(`/playlists/${playlistId}/items`, {
        method: 'DELETE',
        // `tracks` was renamed to `items` alongside the path.
        body: { items: chunk.map((uri) => ({ uri })) },
      });
    }
  }

  /**
   * Spotify has no delete-playlist; removing your own playlist from your
   * library is the delete. That used to be `DELETE /playlists/{id}/followers`,
   * and is now the generic library endpoint, which takes URIs rather than ids.
   */
  unfollowPlaylist(playlistId: string): Promise<void> {
    return this.request<void>('/me/library', {
      method: 'DELETE',
      body: { uris: [`spotify:playlist:${playlistId}`] },
    });
  }

  // ---- library and search ------------------------------------------------

  /** Asking for more than Spotify allows is a refusal, so a caller gets what it allows. */
  async searchAlbums(query: string, limit = SEARCH_LIMIT): Promise<SpotifyAlbum[]> {
    const response = await this.request<SearchResponse>('/search', {
      query: { q: query, type: 'album', limit: Math.min(limit, SEARCH_LIMIT) },
    });
    return response.albums?.items ?? [];
  }

  savedAlbums(): Promise<SavedAlbumObject[]> {
    return this.getAll<SavedAlbumObject>('/me/albums', { limit: 50 });
  }

  album(albumId: string): Promise<SpotifyAlbum> {
    return this.request<SpotifyAlbum>(`/albums/${albumId}`);
  }

  /**
   * One request per album, a batch at a time. `GET /albums?ids=` was removed in
   * February 2026 without a replacement, so the twenty-per-call saving is gone;
   * what's left is to keep twenty in flight instead of twenty in a row.
   *
   * An album that can't be read is dropped rather than thrown, which is what
   * the old endpoint did by returning a null in its array.
   */
  async albums(ids: string[]): Promise<SpotifyAlbum[]> {
    const out: SpotifyAlbum[] = [];
    for (const chunk of chunked(ids, ALBUM_FETCH_CONCURRENCY)) {
      const found = await Promise.all(chunk.map((id) => this.album(id).catch(() => null)));
      out.push(...found.filter((album): album is SpotifyAlbum => album !== null));
    }
    return out;
  }

  albumTracks(albumId: string): Promise<SpotifyTrack[]> {
    return this.getAll<SpotifyTrack>(`/albums/${albumId}/tracks`, { limit: 50 });
  }

  topTracks(timeRange: TimeRange, limit = 50): Promise<SpotifyTrack[]> {
    return this.request<Paged<SpotifyTrack>>('/me/top/tracks', {
      query: { time_range: timeRange, limit },
    }).then((page) => page.items);
  }

  // ---- playback ----------------------------------------------------------

  recentlyPlayed(limit = HISTORY_LIMIT): Promise<PlayHistoryObject[]> {
    return this.request<Paged<PlayHistoryObject>>('/me/player/recently-played', {
      query: { limit },
    }).then((page) => page.items);
  }

  /** 204 when nothing is playing, which the request helper turns into undefined. */
  playbackState(): Promise<PlaybackState | undefined> {
    return this.request<PlaybackState | undefined>('/me/player');
  }

  devices(): Promise<SpotifyDevice[]> {
    return this.request<{ devices: SpotifyDevice[] }>('/me/player/devices').then((r) => r.devices);
  }

  playAlbum(albumUri: string, deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/play', {
      method: 'PUT',
      query: { device_id: deviceId },
      body: { context_uri: albumUri, offset: { position: 0 }, position_ms: 0 },
    });
  }

  setShuffle(state: boolean, deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/shuffle', {
      method: 'PUT',
      query: { state, device_id: deviceId },
    });
  }

  setRepeat(state: 'off' | 'track' | 'context', deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/repeat', {
      method: 'PUT',
      query: { state, device_id: deviceId },
    });
  }

  /**
   * Transport, sent through the Web API rather than the browser SDK so it works
   * the same after a handoff to a phone or a speaker.
   */
  resume(deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/play', { method: 'PUT', query: { device_id: deviceId } });
  }

  pause(deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/pause', { method: 'PUT', query: { device_id: deviceId } });
  }

  /** Skipping is allowed, and it ends the pass. Blocking it would make the transport lie. */
  nextTrack(deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/next', { method: 'POST', query: { device_id: deviceId } });
  }

  previousTrack(deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/previous', {
      method: 'POST',
      query: { device_id: deviceId },
    });
  }

  seek(positionMs: number, deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/seek', {
      method: 'PUT',
      query: { position_ms: Math.max(0, Math.round(positionMs)), device_id: deviceId },
    });
  }

  setVolume(percent: number, deviceId?: string): Promise<void> {
    return this.request<void>('/me/player/volume', {
      method: 'PUT',
      query: {
        volume_percent: Math.min(100, Math.max(0, Math.round(percent))),
        device_id: deviceId,
      },
    });
  }

  transferPlayback(deviceId: string, play = false): Promise<void> {
    return this.request<void>('/me/player', {
      method: 'PUT',
      body: { device_ids: [deviceId], play },
    });
  }
}

export function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }
  return null;
}
