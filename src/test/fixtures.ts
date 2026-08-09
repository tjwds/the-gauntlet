/** Spotify-shaped objects, trimmed to the fields this app reads. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  PlaybackState,
  PlayHistoryObject,
  PlaylistEntry,
  PlaylistTrackObject,
  SpotifyAlbum,
  SpotifyDevice,
  SpotifyEpisode,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUser,
} from '@/lib/spotify/types';
import { COLUMNS, type ColumnId } from '@/lib/domain/columns';

export function anAlbum(overrides: Partial<SpotifyAlbum> = {}): SpotifyAlbum {
  return {
    id: 'alb1',
    name: 'In Rainbows',
    uri: 'spotify:album:alb1',
    album_type: 'album',
    total_tracks: 10,
    release_date: '2007-10-10',
    images: [
      { url: 'https://i.scdn.co/large.jpg', height: 640, width: 640 },
      { url: 'https://i.scdn.co/small.jpg', height: 64, width: 64 },
    ],
    artists: [{ id: 'art1', name: 'Radiohead', uri: 'spotify:artist:art1' }],
    ...overrides,
  };
}

export function aTrack(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id: 'trk1',
    name: '15 Step',
    uri: 'spotify:track:trk1',
    duration_ms: 237_000,
    track_number: 1,
    disc_number: 1,
    is_local: false,
    artists: [{ id: 'art1', name: 'Radiohead', uri: 'spotify:artist:art1' }],
    album: anAlbum(),
    ...overrides,
  };
}

/** `n` tracks of one album, in album order, each 4 minutes. */
export function albumTracks(album: SpotifyAlbum, count: number): SpotifyTrack[] {
  return Array.from({ length: count }, (_, index) =>
    aTrack({
      id: `${album.id}-t${index + 1}`,
      uri: `spotify:track:${album.id}-t${index + 1}`,
      name: `Track ${index + 1}`,
      track_number: index + 1,
      album,
    }),
  );
}

export function playlistEntries(tracks: SpotifyTrack[], addedAt: string): PlaylistTrackObject[] {
  return tracks.map((track) => ({ added_at: addedAt, item: track }));
}

export function anEpisode(overrides: Partial<SpotifyEpisode> = {}): SpotifyEpisode {
  return {
    id: 'ep1',
    name: 'Weyes Blood — Titanic Rising',
    uri: 'spotify:episode:ep1',
    duration_ms: 2_400_000,
    type: 'episode',
    show: { name: 'Song Exploder' },
    ...overrides,
  };
}

/** A playlist as the add-albums screen reads it: tracks, episodes and all. */
export function importEntries(
  items: Array<SpotifyTrack | SpotifyEpisode | null>,
  addedAt = '2026-07-06T10:00:00.000Z',
): PlaylistEntry[] {
  return items.map((item) => ({ added_at: addedAt, item }));
}

export function aPlaylist(overrides: Partial<SpotifyPlaylist> = {}): SpotifyPlaylist {
  return {
    id: 'pl1',
    name: 'Gauntlet · Queue',
    uri: 'spotify:playlist:pl1',
    external_urls: { spotify: 'https://open.spotify.com/playlist/pl1' },
    tracks: { total: 0 },
    owner: { id: 'joe' },
    ...overrides,
  };
}

/** All seven board playlists, keyed by column. */
export function boardPlaylists(): Record<ColumnId, SpotifyPlaylist> {
  return Object.fromEntries(
    COLUMNS.map((column) => [
      column.id,
      aPlaylist({
        id: `pl-${column.id}`,
        name: column.playlistName,
        external_urls: { spotify: `https://open.spotify.com/playlist/pl-${column.id}` },
      }),
    ]),
  ) as Record<ColumnId, SpotifyPlaylist>;
}

export function emptyItems(): Record<ColumnId, PlaylistTrackObject[]> {
  return Object.fromEntries(
    COLUMNS.map((column) => [column.id, [] as PlaylistTrackObject[]]),
  ) as Record<ColumnId, PlaylistTrackObject[]>;
}

export function aUser(overrides: Partial<SpotifyUser> = {}): SpotifyUser {
  return {
    id: 'joe',
    display_name: 'joe',
    email: 'joe@example.com',
    product: 'premium',
    images: [{ url: 'https://i.scdn.co/avatar.jpg', height: 64, width: 64 }],
    ...overrides,
  };
}

export function playHistory(track: SpotifyTrack, playedAt: string): PlayHistoryObject {
  return { track, played_at: playedAt, context: null };
}

/**
 * A Spotify Connect device as `/me/player/devices` lists it. Idle by default,
 * which is the state the morning after a listening session: still signed in,
 * still listed, no longer the active device.
 */
export function aDevice(overrides: Partial<SpotifyDevice> = {}): SpotifyDevice {
  return {
    id: 'mac',
    name: 'MacBook Pro',
    type: 'Computer',
    is_active: false,
    volume_percent: 64,
    ...overrides,
  };
}

export function playbackState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    device: aDevice({ id: 'dev1', is_active: true }),
    timestamp: Date.parse('2026-07-01T12:00:00.000Z'),
    progress_ms: 60_000,
    is_playing: true,
    shuffle_state: false,
    repeat_state: 'off',
    item: aTrack(),
    context: null,
    ...overrides,
  };
}

/**
 * A SpotifyClient stand-in. Every method is a vi.fn, so a test only has to
 * describe the calls it cares about.
 */
export function fakeClient(overrides: Record<string, unknown> = {}) {
  const noop = <T>(value: T) => vi.fn(async () => value);
  const client: Record<string, unknown> = {
    me: noop(aUser()),
    myPlaylists: noop<SpotifyPlaylist[]>([]),
    createPlaylist: vi.fn(async (name: string) => aPlaylist({ name })),
    playlistItems: noop<PlaylistTrackObject[]>([]),
    playlistEntries: noop<PlaylistEntry[]>([]),
    addToPlaylist: vi.fn(async () => undefined),
    removeFromPlaylist: vi.fn(async () => undefined),
    unfollowPlaylist: vi.fn(async () => undefined),
    searchAlbums: noop<SpotifyAlbum[]>([]),
    savedAlbums: noop<Array<{ added_at: string; album: SpotifyAlbum }>>([]),
    album: noop(anAlbum()),
    albums: noop<SpotifyAlbum[]>([]),
    albumTracks: noop<SpotifyTrack[]>([]),
    topTracks: noop<SpotifyTrack[]>([]),
    recentlyPlayed: noop<PlayHistoryObject[]>([]),
    playbackState: noop<PlaybackState | undefined>(undefined),
    devices: noop([]),
    playAlbum: vi.fn(async () => undefined),
    setShuffle: vi.fn(async () => undefined),
    setRepeat: vi.fn(async () => undefined),
    transferPlayback: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    nextTrack: vi.fn(async () => undefined),
    previousTrack: vi.fn(async () => undefined),
    seek: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    ...overrides,
  };

  // Derived from whatever myPlaylists ended up being, so a test that stubs the
  // library gets a consistent first page without having to say so twice.
  client.myPlaylistsFirstPage ??= vi.fn(async () => {
    const items = await (client.myPlaylists as () => Promise<SpotifyPlaylist[]>)();
    return { items, total: items.length };
  });

  return client as typeof client & { myPlaylists: () => Promise<SpotifyPlaylist[]> };
}

/**
 * Four Tet's 2020 album, named as Spotify holds it: 993 characters, 825 of them
 * combining marks, 63 of those on one base. The name `displayName` exists for,
 * and the one a test reaches for when it needs a hostile title.
 *
 * Kept beside this file rather than in it: a literal would have to escape its
 * backslashes, and nobody could tell by looking whether it still matched.
 */
export const KIERAN_HEBDEN_ALBUM = readFileSync(
  join(process.cwd(), 'src/test/kieran-hebden-album.txt'),
  'utf8',
).trimEnd();
