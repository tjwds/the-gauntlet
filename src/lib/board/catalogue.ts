/**
 * The four ways an album gets onto the board: search, saved albums, an existing
 * playlist, or a pasted link. All of them answer with the same shape, and all of
 * them say when an album is already filed — the playlist model can't represent
 * one album in two columns.
 */

import {
  albumDuration,
  isFullAlbum,
  parseAlbumRef,
  pickImage,
  summariseAlbum,
  type AlbumSummary,
} from '@/lib/domain/albums';
import { columnForPlaylistName, type ColumnId } from '@/lib/domain/columns';
import { playlistTrackRows, type PlaylistTrackRow } from '@/lib/domain/playlistTracks';
import { displayName } from '@/lib/domain/text';
import type { SpotifyClient } from '@/lib/spotify/client';
import type { SpotifyAlbum } from '@/lib/spotify/types';

export interface CatalogueAlbum extends AlbumSummary {
  /** The column it's already in, or null. Replaces the add button when set. */
  onBoard: ColumnId | null;
}

function decorate(album: SpotifyAlbum, onBoard: Map<string, ColumnId>): CatalogueAlbum {
  return {
    ...summariseAlbum(album, albumDuration(album)),
    onBoard: onBoard.get(album.id) ?? null,
  };
}

/**
 * Search returns albums, singles and compilations together. The board is an
 * album board, so the rest are filtered out and stay out.
 */
export async function searchAlbumsForBoard(
  client: SpotifyClient,
  query: string,
  onBoard: Map<string, ColumnId>,
): Promise<CatalogueAlbum[]> {
  const results = await client.searchAlbums(query);
  const ids = results.filter(isFullAlbum).map((album) => album.id);
  if (ids.length === 0) return [];
  const full = await client.albums(ids);
  return full.map((album) => decorate(album, onBoard));
}

export async function savedAlbumsForBoard(
  client: SpotifyClient,
  onBoard: Map<string, ColumnId>,
): Promise<CatalogueAlbum[]> {
  const saved = await client.savedAlbums();
  return saved
    .map((entry) => entry.album)
    .filter(isFullAlbum)
    .map((album) => decorate(album, onBoard));
}

/**
 * One playlist's tracks, each carrying the album a tick on it would add. The
 * screen lists tracks because that is what a playlist is; the selection is the
 * album, which is what the board holds.
 */
export async function playlistTracksForBoard(
  client: SpotifyClient,
  playlistId: string,
  onBoard: Map<string, ColumnId>,
): Promise<PlaylistTrackRow[]> {
  return playlistTrackRows(await client.playlistEntries(playlistId), onBoard);
}

/**
 * A pasted Spotify album link or URI. Covers finding a record elsewhere and
 * bringing it over, which is the common path the search box doesn't serve.
 */
export async function albumFromRef(
  client: SpotifyClient,
  ref: string,
  onBoard: Map<string, ColumnId>,
): Promise<CatalogueAlbum | null> {
  const albumId = parseAlbumRef(ref);
  if (!albumId) return null;
  const album = await client.album(albumId);
  return decorate(album, onBoard);
}

/** Spotify's own playlists are all filed under this account. */
export const SPOTIFY_OWNER_ID = 'spotify';

export interface ImportablePlaylist {
  id: string;
  name: string;
  /**
   * Tracks, not albums. `/me/playlists` doesn't report albums, and working them
   * out would mean reading every playlist through before this list could render.
   * The album count appears on the next screen, where one read has happened.
   */
  trackCount: number;
  imageUrl: string | null;
  ownerName: string;
  ownedByMe: boolean;
  /**
   * Spotify closed its own algorithmic and editorial playlists — Discover
   * Weekly, Release Radar, the Daily Mixes — to new apps in November 2024, and
   * their items answer 404. Listed and marked rather than hidden, because that
   * is the first place someone looks and an unexplained absence reads as a
   * missing feature.
   */
  unavailable: boolean;
}

/**
 * The playlists the listener can browse, minus the seven the board owns.
 * Browsing the board back into the board would resolve every track to an album
 * that is on the board already — a screen of grey rows.
 */
export async function importablePlaylists(
  client: SpotifyClient,
  userId?: string,
): Promise<ImportablePlaylist[]> {
  const playlists = await client.myPlaylists();
  return playlists
    // Matched on the raw name: the seven the board owns are named by this app,
    // and a name it wrote has to be recognised exactly as it wrote it.
    .filter((playlist) => !columnForPlaylistName(playlist.name))
    .map((playlist) => ({
      id: playlist.id,
      name: displayName(playlist.name),
      trackCount: playlist.tracks.total,
      imageUrl: pickImage(playlist),
      // Someone else's playlist is offered on the same terms as your own: the
      // tracks read the same way and nothing is written back to it.
      ownerName: displayName(playlist.owner.display_name ?? playlist.owner.id),
      ownedByMe: playlist.owner.id === userId,
      unavailable: playlist.owner.id === SPOTIFY_OWNER_ID,
    }));
}
