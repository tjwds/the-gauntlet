/** Presentation decisions for a board card, kept pure so they can be checked. */

import { t } from '@/lib/copy';
import type { BoardCard } from '@/lib/domain/board';
import { formatDuration, formatShortDate } from '@/lib/domain/format';

export interface NowPlaying {
  /** 1-based position of the playing track within the album. */
  trackNumber: number;
  totalTracks: number;
  msLeft: number;
}

/**
 * The third line of a card. Terminal columns show when the record got there;
 * the card now playing shows where it is in the record, because album position
 * is the unit the board cares about.
 */
export function cardMeta(album: BoardCard, nowPlaying?: NowPlaying | null): string {
  if (nowPlaying) {
    return t('card.playing.position', {
      n: nowPlaying.trackNumber,
      total: nowPlaying.totalTracks,
      time: formatDuration(nowPlaying.msLeft),
    });
  }
  if (album.columnId === 'done') {
    return t('card.done.meta', { date: formatShortDate(album.addedAt) });
  }
  if (album.columnId === 'abandoned') {
    return t('card.abandoned.meta', { date: formatShortDate(album.addedAt) });
  }
  return t('card.meta', {
    year: album.year,
    n: album.totalTracks,
    duration: formatDuration(album.durationMs),
  });
}

/** How much of the record is left, from the playing track's own position. */
export function msLeftInAlbum(album: BoardCard, trackId: string, progressMs: number): number {
  const index = album.tracks.findIndex((track) => track.id === trackId);
  if (index === -1) return 0;
  const remaining = album.tracks
    .slice(index)
    .reduce((total, track) => total + track.durationMs, 0);
  return Math.max(0, remaining - progressMs);
}

/** Dots belong on cards that have listens to show — not Queue, not Abandoned. */
export function showsDots(album: BoardCard): boolean {
  return album.listens !== null && album.listens > 0;
}

/** The label under the merged column on the narrow board. */
export function narrowProgressLabel(album: BoardCard, playing: boolean, nowPlaying?: NowPlaying | null): string | undefined {
  // Null only in Abandoned, which has no pass to be part-way through.
  const listens = album.listens ?? 0;
  if (playing && nowPlaying) {
    return t('narrow.card.playing', { n: nowPlaying.trackNumber, total: nowPlaying.totalTracks });
  }
  if (album.inFlight) {
    return t('narrow.card.toDone.withPass', {
      p: listens + 1,
      done: album.inFlight.tracksDone,
      total: album.inFlight.total,
    });
  }
  return undefined;
}
