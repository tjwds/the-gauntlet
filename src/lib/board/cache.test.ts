import { beforeEach, describe, expect, it } from 'vitest';
import { CACHE_TTL_MS, clearCache, readCache, writeCache } from './cache';
import type { PlaylistLookup } from './service';
import { boardPlaylists } from '@/test/fixtures';

const NOW = Date.parse('2026-08-01T12:00:00.000Z');

const complete: PlaylistLookup = {
  playlists: boardPlaylists(),
  missing: [],
  found: boardPlaylists(),
};

const incomplete: PlaylistLookup = {
  playlists: null,
  missing: ['Gauntlet · Queue'],
  found: {},
};

beforeEach(() => clearCache());

describe('the playlist lookup cache', () => {
  it('remembers a complete board', () => {
    writeCache('joe', complete, NOW);
    expect(readCache('joe', NOW + 1000)).toBe(complete);
  });

  it('has nothing to say about a listener it has not seen', () => {
    expect(readCache('joe', NOW)).toBeNull();
  });

  it('keeps listeners apart', () => {
    writeCache('joe', complete, NOW);
    expect(readCache('someone-else', NOW)).toBeNull();
  });

  it('forgets an entry once it expires', () => {
    // Losing it costs one lookup; keeping it too long shows a stale board.
    writeCache('joe', complete, NOW);
    expect(readCache('joe', NOW + CACHE_TTL_MS)).toBeNull();
  });

  it('keeps an entry right up to the moment it expires', () => {
    writeCache('joe', complete, NOW);
    expect(readCache('joe', NOW + CACHE_TTL_MS - 1)).toBe(complete);
  });

  it('refuses to remember an incomplete board', () => {
    // Setup is about to create the missing playlists, which makes any
    // remembered answer wrong within seconds.
    writeCache('joe', incomplete, NOW);
    expect(readCache('joe', NOW)).toBeNull();
  });

  it('forgets one listener on request', () => {
    writeCache('joe', complete, NOW);
    writeCache('ada', complete, NOW);
    clearCache('joe');
    expect(readCache('joe', NOW)).toBeNull();
    expect(readCache('ada', NOW)).toBe(complete);
  });

  it('forgets everyone when the playlists themselves change', () => {
    writeCache('joe', complete, NOW);
    clearCache();
    expect(readCache('joe', NOW)).toBeNull();
  });

  it('reads the real clock when it is given none', () => {
    writeCache('joe', complete);
    expect(readCache('joe')).toBe(complete);
  });
});
