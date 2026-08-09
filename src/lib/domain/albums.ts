/**
 * Playlists hold tracks; the board shows albums. Everything here is the
 * translation between the two, and it is the only place that knows a card is
 * really a run of an album's tracks sitting in one of seven playlists.
 */

import type { PlaylistTrackObject, SpotifyAlbum, SpotifyTrack } from '@/lib/spotify/types';
import { releaseYear } from './format';
import { displayName } from './text';

export interface AlbumTrack {
  id: string;
  name: string;
  durationMs: number;
  trackNumber: number;
  discNumber: number;
  uri: string;
}

export interface AlbumSummary {
  id: string;
  name: string;
  uri: string;
  artist: string;
  year: string;
  imageUrl: string | null;
  totalTracks: number;
  durationMs: number;
  albumType: string;
}

export interface BoardAlbum extends AlbumSummary {
  /** Album order — disc, then track number. The order a pass has to follow. */
  tracks: AlbumTrack[];
  /** When this album's tracks landed in their current playlist: its arrival in the column. */
  addedAt: string;
}

/**
 * Spotify serves art largest-first, usually 640 / 300 / 64. The middle one
 * covers both the 52px card and the 112px drawer without a second request, so
 * take the smallest that is still at least 300px and fall back to the largest
 * on offer.
 */
export function pickImage(album: Pick<SpotifyAlbum, 'images'>): string | null {
  const images = album.images ?? [];
  const big = images.filter((image) => (image.width ?? 0) >= 300);
  const chosen = big.at(-1) ?? images[0];
  return chosen?.url ?? null;
}

export function joinArtists(artists: Array<{ name: string }> | undefined): string {
  return (artists ?? []).map((a) => displayName(a.name)).join(', ');
}

/** `track` is deprecated in favour of `item`; prefer `item` and fall back. */
export function playlistTrack(entry: PlaylistTrackObject): SpotifyTrack | null {
  return entry.item ?? entry.track ?? null;
}

export function albumOrder(a: AlbumTrack, b: AlbumTrack): number {
  return a.discNumber - b.discNumber || a.trackNumber - b.trackNumber;
}

function toAlbumTrack(track: SpotifyTrack): AlbumTrack | null {
  if (!track.id || track.is_local) return null;
  return {
    id: track.id,
    name: displayName(track.name),
    durationMs: track.duration_ms,
    trackNumber: track.track_number,
    discNumber: track.disc_number,
    uri: track.uri,
  };
}

export function summariseAlbum(album: SpotifyAlbum, durationMs = 0): AlbumSummary {
  return {
    id: album.id,
    name: displayName(album.name),
    uri: album.uri,
    artist: joinArtists(album.artists),
    year: releaseYear(album.release_date),
    imageUrl: pickImage(album),
    totalTracks: album.total_tracks,
    durationMs,
    albumType: album.album_type,
  };
}

/** Total runtime of a fully-fetched album, for search results and suggestion tiles. */
export function albumDuration(album: SpotifyAlbum): number {
  const tracks = album.tracks?.items;
  if (!tracks) return 0;
  return tracks.reduce((total, track) => total + track.duration_ms, 0);
}

/**
 * Group one playlist's contents into albums, in the order the albums first
 * appear. Local files and tracks without an album are dropped — they can't be
 * a card, because a card is an album.
 */
export function albumsFromPlaylistItems(entries: PlaylistTrackObject[]): BoardAlbum[] {
  const byAlbum = new Map<
    string,
    { album: SpotifyAlbum; tracks: AlbumTrack[]; seen: Set<string>; addedAt: string }
  >();

  for (const entry of entries) {
    const track = playlistTrack(entry);
    if (!track?.album) continue;
    const albumTrack = toAlbumTrack(track);
    if (!albumTrack) continue;

    const albumId = track.album.id;
    let group = byAlbum.get(albumId);
    if (!group) {
      group = { album: track.album, tracks: [], seen: new Set(), addedAt: entry.added_at };
      byAlbum.set(albumId, group);
    }
    // The same track twice in one playlist is one track on the card.
    if (group.seen.has(albumTrack.id)) continue;
    group.seen.add(albumTrack.id);
    group.tracks.push(albumTrack);
    // A move rewrites every track's added_at at once, so the earliest is the arrival.
    if (entry.added_at < group.addedAt) group.addedAt = entry.added_at;
  }

  return [...byAlbum.values()].map(({ album, tracks, addedAt }) => {
    const ordered = [...tracks].sort(albumOrder);
    const durationMs = ordered.reduce((total, t) => total + t.durationMs, 0);
    return { ...summariseAlbum(album, durationMs), tracks: ordered, addedAt };
  });
}

/**
 * Singles, EPs and compilations are filtered out and stay out. Five listens
 * through a hits package isn't the exercise.
 */
export function isFullAlbum(album: Pick<SpotifyAlbum, 'album_type'>): boolean {
  return album.album_type === 'album';
}

/** Spotify album URL or URI to an album id. `null` for anything else. */
export function parseAlbumRef(input: string): string | null {
  const value = input.trim();
  // A match always carries group 1, so the capture is safe to assert.
  const uri = /^spotify:album:([A-Za-z0-9]+)$/.exec(value);
  if (uri) return uri[1] as string;
  const url = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?album\/([A-Za-z0-9]+)/.exec(value);
  if (url) return url[1] as string;
  return null;
}
