/**
 * Builds `recently-played`-shaped history from a description of what was
 * actually played, under either reading of `played_at`. Lets the pass tests
 * state "tracks 1-4 in full, then 30 seconds of track 5" and get timestamps
 * that a real account would produce.
 */

import type { PassAlbum, PlayedAtSemantics, PlayEvent } from '@/lib/domain/pass';

export const TRACK_MS = 240_000;

export function makeAlbum(id: string, trackCount: number, durationMs = TRACK_MS): PassAlbum {
  return {
    id,
    trackIds: Array.from({ length: trackCount }, (_, i) => `${id}-t${i + 1}`),
    durationsMs: Array.from({ length: trackCount }, () => durationMs),
  };
}

export interface Played {
  albumId: string;
  trackId: string;
  /** Full runtime of the track. */
  durationMs: number;
  /** How much of it actually played before the next thing started. */
  playedMs: number;
}

/** Every track of an album, in album order, each played in full. */
export function fullListen(album: PassAlbum): Played[] {
  return album.trackIds.map((trackId, index) => ({
    albumId: album.id,
    trackId,
    durationMs: album.durationsMs[index] as number,
    playedMs: album.durationsMs[index] as number,
  }));
}

/** The same, but one track cut short — a skip, which ends the pass. */
export function listenWithSkip(album: PassAlbum, skipIndex: number, playedMs = 35_000): Played[] {
  return fullListen(album).map((entry, index) =>
    index === skipIndex ? { ...entry, playedMs } : entry,
  );
}

export function foreign(trackId: string, durationMs = TRACK_MS, playedMs = durationMs): Played {
  return { albumId: 'other-album', trackId, durationMs, playedMs };
}

export interface TimelineOptions {
  startMs: number;
  semantics: PlayedAtSemantics;
  /** Idle time inserted before each entry, e.g. a pause between records. */
  gapBeforeMs?: number;
}

/**
 * Turn a sequence of plays into history entries. Spotify only logs a track once
 * it passes 30 seconds, so anything shorter is dropped the way the API would.
 */
export function timeline(played: Played[], { startMs, semantics, gapBeforeMs = 0 }: TimelineOptions): PlayEvent[] {
  const events: PlayEvent[] = [];
  let cursor = startMs;

  for (const entry of played) {
    cursor += gapBeforeMs;
    const begin = cursor;
    const finish = cursor + entry.playedMs;
    if (entry.playedMs >= 30_000) {
      events.push({
        trackId: entry.trackId,
        albumId: entry.albumId,
        durationMs: entry.durationMs,
        playedAtMs: semantics === 'start' ? begin : finish,
      });
    }
    cursor = finish;
  }

  return events;
}

/** When the last entry in a timeline finished, for `nowMs` in tests. */
export function endOf(played: Played[], startMs: number, gapBeforeMs = 0): number {
  return played.reduce((cursor, entry) => cursor + gapBeforeMs + entry.playedMs, startMs);
}
