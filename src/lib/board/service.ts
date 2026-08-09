/**
 * Every write the board can make, expressed against the seven playlists.
 *
 * A move is a bulk remove-then-append of one album's tracks, in album order.
 * That is the only reason column dates exist: the append resets `added_at`, so
 * "when did this reach ×3" comes back out of Spotify for free.
 */

import { albumsFromPlaylistItems, albumOrder, type BoardAlbum } from '@/lib/domain/albums';
import {
  buildBoard,
  historyToPlayEvents,
  playbackToSnapshot,
  type Board,
  type ItemsByColumn,
  type PlaylistsByColumn,
} from '@/lib/domain/board';
import { COLUMNS, columnForPlaylistName, getColumn, type ColumnId } from '@/lib/domain/columns';
import type { PlayedAtSemantics } from '@/lib/domain/pass';
import type { SpotifyClient } from '@/lib/spotify/client';
import type { SpotifyPlaylist } from '@/lib/spotify/types';
import { clearCache, readCache, writeCache } from './cache';

export interface PlaylistLookup {
  playlists: PlaylistsByColumn | null;
  /** Playlist names that weren't found. Missing and renamed look identical. */
  missing: string[];
  found: Partial<Record<ColumnId, SpotifyPlaylist>>;
}

/**
 * Find the seven by name. Nothing is stored, so their ids can't survive between
 * sessions — which is exactly why the names aren't editable.
 */
export interface FindOptions {
  /** Identifies the listener for the lookup cache. Omit to skip the cache. */
  cacheKey?: string;
  /** Re-scan even if a fresh answer is remembered. */
  force?: boolean;
}

export async function findBoardPlaylists(
  client: SpotifyClient,
  { cacheKey, force = false }: FindOptions = {},
): Promise<PlaylistLookup> {
  if (cacheKey && !force) {
    const remembered = readCache(cacheKey);
    if (remembered) return remembered;
  }

  const lookup = await scanForBoardPlaylists(client);
  if (cacheKey) writeCache(cacheKey, lookup);
  return lookup;
}

async function scanForBoardPlaylists(client: SpotifyClient): Promise<PlaylistLookup> {
  // Spotify lists playlists most-recently-added first, so the seven are usually
  // on the first page. Reading the whole library on every board load costs a
  // round trip per fifty playlists, and some libraries are fifteen years old.
  const first = await client.myPlaylistsFirstPage();
  const fromFirstPage = index(first.items);
  if (fromFirstPage.missing.length === 0 || first.items.length >= first.total) {
    return fromFirstPage;
  }

  return index(await client.myPlaylists());
}

function index(playlists: SpotifyPlaylist[]): PlaylistLookup {
  const found: Partial<Record<ColumnId, SpotifyPlaylist>> = {};

  for (const playlist of playlists) {
    const column = columnForPlaylistName(playlist.name);
    // First match wins, so a duplicate created later can't steal the column.
    if (column && !found[column.id]) found[column.id] = playlist;
  }

  const missing = COLUMNS.filter((column) => !found[column.id]).map((column) => column.playlistName);
  return {
    playlists: missing.length === 0 ? (found as PlaylistsByColumn) : null,
    missing,
    found,
  };
}

export interface LoadBoardResult {
  board: Board | null;
  /** True when one or more of the seven is absent, which sends the listener to setup. */
  setupRequired: boolean;
  missing: string[];
}

export interface LoadBoardOptions {
  nowMs?: number;
  semantics?: PlayedAtSemantics;
  /** Free accounts can't be polled for playback state; skip it rather than 403. */
  includePlayback?: boolean;
  cacheKey?: string;
  /** Re-scan is the deliberate second read; it must not be served from memory. */
  force?: boolean;
}

export async function loadBoard(
  client: SpotifyClient,
  { nowMs = Date.now(), semantics, includePlayback = true, cacheKey, force }: LoadBoardOptions = {},
): Promise<LoadBoardResult> {
  const lookup = await findBoardPlaylists(client, { ...(cacheKey ? { cacheKey } : {}), ...(force ? { force } : {}) });
  if (!lookup.playlists) {
    return { board: null, setupRequired: true, missing: lookup.missing };
  }
  const playlists = lookup.playlists;

  const entries = await Promise.all(
    COLUMNS.map(async (column) => [column.id, await client.playlistItems(playlists[column.id].id)] as const),
  );
  const items = Object.fromEntries(entries) as ItemsByColumn;

  const [history, playback] = await Promise.all([
    client.recentlyPlayed(),
    includePlayback ? client.playbackState() : Promise.resolve(undefined),
  ]);

  const board = buildBoard({
    playlists,
    items,
    history: historyToPlayEvents(history),
    playback: playbackToSnapshot(playback),
    nowMs,
    ...(semantics ? { semantics } : {}),
  });

  return { board, setupRequired: false, missing: [] };
}

/**
 * Create whichever of the seven are absent. Existing ones are adopted as-is —
 * an unrelated playlist already called `Gauntlet · Queue` becomes the board,
 * which is worth knowing at setup rather than discovering later.
 */
export interface CreatedPlaylist {
  name: string;
  id: string;
  url: string;
}

export async function createBoardPlaylists(
  client: SpotifyClient,
  isPrivate: boolean,
): Promise<{
  created: CreatedPlaylist[];
  adopted: CreatedPlaylist[];
  userId: string;
}> {
  // Creation no longer names an account — `/me/playlists` files under whoever
  // the token belongs to. The id is still read, for the receipt below: knowing
  // which account seven playlists landed in is the whole value of that log line.
  const [{ id: userId }, lookup] = await Promise.all([
    client.me(),
    findBoardPlaylists(client, { force: true }),
  ]);
  const adopted = COLUMNS.filter((column) => lookup.found[column.id]).map((column) =>
    describePlaylist(column.playlistName, lookup.found[column.id] as SpotifyPlaylist),
  );
  const toCreate = COLUMNS.filter((column) => !lookup.found[column.id]);

  // Seven round trips one after another is a visible wait; they don't depend on
  // each other, so they go together.
  const results = await Promise.all(
    toCreate.map(async (column) => {
      const playlist = await client.createPlaylist(column.playlistName, !isPrivate);
      return describePlaylist(column.playlistName, playlist);
    }),
  );

  // What was just created is exactly what any remembered lookup got wrong.
  clearCache();
  return { created: results, adopted, userId };
}

/** Id and link, so "it worked" is checkable rather than asserted. */
function describePlaylist(name: string, playlist: SpotifyPlaylist): CreatedPlaylist {
  return {
    name,
    id: playlist.id,
    url: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
  };
}

async function albumInPlaylist(
  client: SpotifyClient,
  playlistId: string,
  albumId: string,
): Promise<BoardAlbum | undefined> {
  const items = await client.playlistItems(playlistId);
  return albumsFromPlaylistItems(items).find((album) => album.id === albumId);
}

export interface MoveResult {
  albumId: string;
  from: ColumnId;
  to: ColumnId;
  trackCount: number;
}

/**
 * Remove-then-append, in album order. Used by automatic advancement, by drag,
 * by "Advance to next column" and by undo — they are the same two writes.
 */
export async function moveAlbum(
  client: SpotifyClient,
  playlists: PlaylistsByColumn,
  { albumId, from, to }: { albumId: string; from: ColumnId; to: ColumnId },
): Promise<MoveResult> {
  if (from === to) return { albumId, from, to, trackCount: 0 };

  const album = await albumInPlaylist(client, playlists[from].id, albumId);
  if (!album) {
    throw new BoardWriteError(`${albumId} is not in ${getColumn(from).name}`);
  }

  const uris = [...album.tracks].sort(albumOrder).map((track) => track.uri);
  await client.removeFromPlaylist(playlists[from].id, uris);
  await client.addToPlaylist(playlists[to].id, uris);

  return { albumId, from, to, trackCount: uris.length };
}

/** Adds whole albums to a column, in album order, skipping any already on the board. */
export async function addAlbumsToColumn(
  client: SpotifyClient,
  playlists: PlaylistsByColumn,
  { albumIds, to }: { albumIds: string[]; to: ColumnId },
): Promise<{ added: string[]; skipped: string[] }> {
  const onBoard = await albumsAlreadyOnBoard(client, playlists);
  const added: string[] = [];
  const skipped: string[] = [];

  for (const albumId of albumIds) {
    if (onBoard.has(albumId)) {
      skipped.push(albumId);
      continue;
    }
    const tracks = await client.albumTracks(albumId);
    const uris = tracks
      .filter((track) => track.id && !track.is_local)
      .sort((a, b) => a.disc_number - b.disc_number || a.track_number - b.track_number)
      .map((track) => track.uri);
    if (uris.length === 0) {
      skipped.push(albumId);
      continue;
    }
    await client.addToPlaylist(playlists[to].id, uris);
    added.push(albumId);
  }

  return { added, skipped };
}

/** Takes an album off the board. The album itself is untouched in the library. */
export async function removeAlbumFromBoard(
  client: SpotifyClient,
  playlists: PlaylistsByColumn,
  { albumId, from }: { albumId: string; from: ColumnId },
): Promise<{ albumId: string; trackCount: number }> {
  const album = await albumInPlaylist(client, playlists[from].id, albumId);
  if (!album) {
    throw new BoardWriteError(`${albumId} is not in ${getColumn(from).name}`);
  }
  const uris = album.tracks.map((track) => track.uri);
  await client.removeFromPlaylist(playlists[from].id, uris);
  return { albumId, trackCount: uris.length };
}

/** Which column each album is in, for already-on-board detection on Add albums. */
export async function albumsAlreadyOnBoard(
  client: SpotifyClient,
  playlists: PlaylistsByColumn,
): Promise<Map<string, ColumnId>> {
  const index = new Map<string, ColumnId>();
  for (const column of COLUMNS) {
    const items = await client.playlistItems(playlists[column.id].id);
    for (const album of albumsFromPlaylistItems(items)) {
      if (!index.has(album.id)) index.set(album.id, column.id);
    }
  }
  return index;
}

/** Removes all seven from the listener's library. Saved albums are untouched. */
export async function deleteBoardPlaylists(client: SpotifyClient): Promise<string[]> {
  clearCache();
  const lookup = await findBoardPlaylists(client, { force: true });
  const deleted: string[] = [];
  for (const column of COLUMNS) {
    const playlist = lookup.found[column.id];
    if (!playlist) continue;
    await client.unfollowPlaylist(playlist.id);
    deleted.push(column.playlistName);
  }
  clearCache();
  return deleted;
}

export class BoardWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardWriteError';
  }
}
