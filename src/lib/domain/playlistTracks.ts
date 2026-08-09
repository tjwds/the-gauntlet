/**
 * One playlist, read as the records it would put on the board.
 *
 * The tick sits on a track but the unit of selection is the album it came from:
 * what gets written is that album's own tracklist, in album order, not the
 * playlist's copy of the ticked track. A pass is the record straight through,
 * so anything less couldn't be listened to under the rule. Every row therefore
 * carries the album it resolves to — or is one of the two kinds that resolve to
 * none.
 *
 * Rows that can't be added keep their place rather than being dropped the way
 * search results are. Nobody knows what a search *should* have returned; a
 * playlist is a list the listener can already see in Spotify, so a row quietly
 * missing from it reads as a bug.
 */

import type { PlaylistEntry, SpotifyEpisode, SpotifyTrack } from '@/lib/spotify/types';
import { joinArtists, pickImage } from './albums';
import type { ColumnId } from './columns';
import { displayName, displayNameOrNull } from './text';

export interface RowAlbum {
  id: string;
  name: string;
  /** The album's own track count — what ticking this row would add. */
  totalTracks: number;
  imageUrl: string | null;
}

interface RowBase {
  /** Position in the playlist. The same track can appear twice, so the id won't do. */
  key: string;
  title: string;
}

/** A track that resolves to an album, whether or not the board can hold it. */
export interface AlbumTrackRow extends RowBase {
  kind: 'track';
  artist: string;
  album: RowAlbum;
  /**
   * Set when the album isn't the kind the board takes. `single` covers most EPs
   * — Spotify types them that way — and `compilation` goes for the reason First
   * records drops it: five passes through a best-of isn't the exercise.
   */
  reason: 'single' | 'compilation' | null;
  /** The column it already occupies. An album can only be in one. */
  onBoard: ColumnId | null;
}

/** A podcast episode. Playlists can hold them; they aren't music. */
export interface EpisodeRow extends RowBase {
  kind: 'episode';
  showName: string | null;
}

/** A file from the listener's own machine: no Spotify id, so no album to look up. */
export interface LocalFileRow extends RowBase {
  kind: 'local';
}

export type PlaylistTrackRow = AlbumTrackRow | EpisodeRow | LocalFileRow;

function entryItem(entry: PlaylistEntry): SpotifyTrack | SpotifyEpisode | null {
  return entry.item ?? entry.track ?? null;
}

function isEpisode(item: SpotifyTrack | SpotifyEpisode): item is SpotifyEpisode {
  return item.type === 'episode';
}

function rowFor(
  entry: PlaylistEntry,
  index: number,
  onBoard: Map<string, ColumnId>,
): PlaylistTrackRow | null {
  const item = entryItem(entry);
  // Spotify sends a null item for a track that has since been taken down.
  if (!item) return null;

  const base = { key: String(index), title: displayName(item.name) };

  if (isEpisode(item)) return { ...base, kind: 'episode', showName: displayNameOrNull(item.show?.name) };

  if (item.is_local || !item.id || !item.album) return { ...base, kind: 'local' };

  const album: RowAlbum = {
    id: item.album.id,
    name: displayName(item.album.name),
    totalTracks: item.album.total_tracks,
    imageUrl: pickImage(item.album),
  };
  const track = { ...base, kind: 'track' as const, artist: joinArtists(item.artists), album };

  const albumType = item.album.album_type;
  if (albumType !== 'album') return { ...track, reason: albumType, onBoard: null };

  return { ...track, reason: null, onBoard: onBoard.get(album.id) ?? null };
}

export function playlistTrackRows(
  entries: PlaylistEntry[],
  onBoard: Map<string, ColumnId>,
): PlaylistTrackRow[] {
  return entries
    .map((entry, index) => rowFor(entry, index, onBoard))
    .filter((row): row is PlaylistTrackRow => row !== null);
}

/** True when ticking this row would put something new on the board. */
export function isAddable(row: PlaylistTrackRow): row is AlbumTrackRow {
  return row.kind === 'track' && row.reason === null && row.onBoard === null;
}

/**
 * The albums these rows could add, first appearance first and each counted once.
 * This is the number both the *N albums you could add* header and the
 * *Select all N albums* strip report.
 */
export function addableAlbumIds(rows: PlaylistTrackRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (isAddable(row) && !ids.includes(row.album.id)) ids.push(row.album.id);
  }
  return ids;
}
