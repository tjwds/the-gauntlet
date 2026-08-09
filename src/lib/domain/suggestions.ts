/**
 * First records: the albums the listener already knows a song from.
 *
 * Built on `GET /v1/me/top/tracks` because it has to be — Recommendations,
 * Related Artists and Audio Features were all closed to new apps in November
 * 2024. Each top track carries its own album, so grouping them into records
 * costs no extra call.
 *
 * Open question, recorded rather than resolved: a record the listener already
 * knows several songs from ranks highest here. That's either the strongest
 * signal it deserves a pass or the most wasted slot on the board.
 */

import type { SpotifyTrack } from '@/lib/spotify/types';
import { isFullAlbum, summariseAlbum, type AlbumSummary } from './albums';
import { displayName } from './text';

export interface SuggestedTrack {
  name: string;
  /** 1-based position in the listener's top songs. Spotify ranks; it never counts plays. */
  rank: number;
}

export interface Suggestion extends AlbumSummary {
  matches: SuggestedTrack[];
  /** Best (lowest) rank among the matches — the tiebreak. */
  bestRank: number;
}

/**
 * Group top tracks into albums, drop anything that isn't a full album, and rank
 * by how many of the album's tracks the listener already knows, then by the best
 * rank among them.
 */
export function suggestionsFromTopTracks(topTracks: SpotifyTrack[]): Suggestion[] {
  const byAlbum = new Map<string, Suggestion>();

  topTracks.forEach((track, index) => {
    const album = track.album;
    if (!album || !isFullAlbum(album)) return;

    const rank = index + 1;
    const existing = byAlbum.get(album.id);
    if (existing) {
      existing.matches.push({ name: displayName(track.name), rank });
      return;
    }
    byAlbum.set(album.id, {
      ...summariseAlbum(album),
      matches: [{ name: displayName(track.name), rank }],
      bestRank: rank,
    });
  });

  return [...byAlbum.values()].sort(
    (a, b) => b.matches.length - a.matches.length || a.bestRank - b.bestRank,
  );
}

/** How many records the screen proposes before the listener touches anything. */
export const DEFAULT_SUGGESTION_SELECTION = 6;

/** The first page of tiles; the rest sit behind "Show {n} more". */
export const SUGGESTION_PAGE_SIZE = 12;
