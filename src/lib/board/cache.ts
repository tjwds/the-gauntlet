/**
 * A short-lived memory of where the seven playlists are.
 *
 * This is not storage in the sense the design rules out. Nothing is written
 * anywhere; the map lives in the server process and dies with it, and every
 * entry expires in minutes. Losing it costs one extra lookup.
 *
 * It exists because finding the seven means listing the listener's playlists,
 * and a fifteen-year-old library runs to hundreds. Doing that on every board
 * read is what got this app rate-limited for a day during development.
 */

import type { PlaylistLookup } from './service';

export const CACHE_TTL_MS = 5 * 60_000;

interface Entry {
  lookup: PlaylistLookup;
  expiresAt: number;
}

const entries = new Map<string, Entry>();

/** Keyed by listener. The access token would rotate; the Spotify id doesn't. */
export function readCache(key: string, nowMs = Date.now()): PlaylistLookup | null {
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs) {
    entries.delete(key);
    return null;
  }
  return entry.lookup;
}

export function writeCache(key: string, lookup: PlaylistLookup, nowMs = Date.now()): void {
  // Only a complete board is worth remembering. A partial one means setup is
  // still owed, and that changes the moment the playlists are created.
  if (!lookup.playlists) return;
  entries.set(key, { lookup, expiresAt: nowMs + CACHE_TTL_MS });
}

/** After creating or deleting playlists, and whenever Re-scan is asked for. */
export function clearCache(key?: string): void {
  if (key === undefined) entries.clear();
  else entries.delete(key);
}
