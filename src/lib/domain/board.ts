/**
 * Assembling the board. The seven playlists are the entire store, so this
 * module is the whole read model: playlist membership in, cards out, with
 * progress derived from Spotify's own history rather than anything of ours.
 */

import type { PlaybackState, PlayHistoryObject, PlaylistTrackObject, SpotifyPlaylist } from '@/lib/spotify/types';
import { albumsFromPlaylistItems, type BoardAlbum } from './albums';
import { COLUMNS, getColumn, listensRemaining, type Column, type ColumnId } from './columns';
import {
  albumProgress,
  type InFlightPass,
  type PlaybackSnapshot,
  type PlayEvent,
  type PlayedAtSemantics,
} from './pass';

export interface BoardCard extends BoardAlbum {
  columnId: ColumnId;
  /** Completed listens banked, which is just the column's value. Null in Abandoned. */
  listens: number | null;
  inFlight: InFlightPass | null;
  /**
   * Columns this card has earned since it arrived but hasn't been moved through
   * yet. The client applies the move, so the animation, the toast and the undo
   * all belong to the same gesture.
   */
  pendingAdvance: number;
}

export interface BoardColumn extends Column {
  albums: BoardCard[];
  playlistId: string;
  playlistUrl: string;
  trackCount: number;
}

export interface Board {
  columns: BoardColumn[];
  generatedAt: number;
}

export type PlaylistsByColumn = Record<ColumnId, SpotifyPlaylist>;
export type ItemsByColumn = Record<ColumnId, PlaylistTrackObject[]>;

export interface BuildBoardOptions {
  playlists: PlaylistsByColumn;
  items: ItemsByColumn;
  history: PlayEvent[];
  playback: PlaybackSnapshot | null;
  nowMs: number;
  semantics?: PlayedAtSemantics;
}

export function buildBoard({
  playlists,
  items,
  history,
  playback,
  nowMs,
  semantics,
}: BuildBoardOptions): Board {
  const columns = COLUMNS.map((column) => {
    const playlist = playlists[column.id];
    const albums = albumsFromPlaylistItems(items[column.id] ?? []);
    return {
      ...column,
      playlistId: playlist.id,
      playlistUrl: playlist.external_urls.spotify,
      trackCount: (items[column.id] ?? []).length,
      albums: albums.map((album) => toCard(album, column, { history, playback, nowMs, semantics })),
    };
  });

  return { columns, generatedAt: nowMs };
}

function toCard(
  album: BoardAlbum,
  column: Column,
  context: {
    history: PlayEvent[];
    playback: PlaybackSnapshot | null;
    nowMs: number;
    semantics?: PlayedAtSemantics;
  },
): BoardCard {
  // Nothing advances out of Done or Abandoned, so nothing needs deriving there.
  if (column.terminal) {
    return { ...album, columnId: column.id, listens: column.listens, inFlight: null, pendingAdvance: 0 };
  }

  const { passes, inFlight } = albumProgress({
    album: {
      id: album.id,
      trackIds: album.tracks.map((track) => track.id),
      durationsMs: album.tracks.map((track) => track.durationMs),
    },
    history: context.history,
    playback: context.playback,
    // Arrival in this column is the idempotency key: a pass credited before the
    // move sits earlier than the added_at the move reset, so it can't count twice.
    sinceMs: Date.parse(album.addedAt),
    nowMs: context.nowMs,
    ...(context.semantics ? { semantics: context.semantics } : {}),
    // Abandoned is the only column with no allowance, and it returned above.
    passesAvailable: listensRemaining(column.id) as number,
  });

  return {
    ...album,
    columnId: column.id,
    listens: column.listens,
    inFlight,
    pendingAdvance: passes,
  };
}

/** Every album on the board, mapped to the column it sits in. */
export function albumColumnIndex(board: Board): Map<string, ColumnId> {
  const index = new Map<string, ColumnId>();
  for (const column of board.columns) {
    for (const album of column.albums) index.set(album.id, column.id);
  }
  return index;
}

export function findCard(board: Board, albumId: string): BoardCard | null {
  for (const column of board.columns) {
    const match = column.albums.find((album) => album.id === albumId);
    if (match) return match;
  }
  return null;
}

export function columnOf(board: Board, id: ColumnId): BoardColumn {
  const column = board.columns.find((candidate) => candidate.id === id);
  /* c8 ignore next -- every ColumnId has a column; guards a malformed board. */
  if (!column) throw new Error(`Column ${id} missing from board`);
  return column;
}

/** Album count for a column heading; `getColumn` keeps the label in one place. */
export function columnLabel(id: ColumnId): string {
  return getColumn(id).name;
}

// ---- Spotify shapes to domain shapes --------------------------------------

export function historyToPlayEvents(history: PlayHistoryObject[]): PlayEvent[] {
  const events: PlayEvent[] = [];
  for (const entry of history) {
    const { track } = entry;
    if (!track?.id || !track.album) continue;
    events.push({
      trackId: track.id,
      albumId: track.album.id,
      durationMs: track.duration_ms,
      playedAtMs: Date.parse(entry.played_at),
    });
  }
  return events;
}

export function playbackToSnapshot(state: PlaybackState | undefined | null): PlaybackSnapshot | null {
  if (!state?.item?.id || !state.item.album) return null;
  return {
    trackId: state.item.id,
    albumId: state.item.album.id,
    durationMs: state.item.duration_ms,
    progressMs: state.progress_ms ?? 0,
    isPlaying: state.is_playing,
    shuffle: state.shuffle_state,
    timestampMs: state.timestamp,
  };
}

/**
 * The record that was put on, which is what Spotify calls the context — not the
 * album the playing track happens to belong to. A track reached through a
 * playlist, a radio or a search still names its album, but nothing after it
 * belongs to that album, so anything said about position in the record would be
 * invention. Null whenever the thing playing isn't a record.
 */
export function albumContextId(state: PlaybackState | undefined | null): string | null {
  const context = state?.context;
  if (!context || context.type !== 'album') return null;
  return /^spotify:album:(.+)$/.exec(context.uri)?.[1] ?? null;
}
