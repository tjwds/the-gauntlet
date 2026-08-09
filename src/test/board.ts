/** Board models at the shape the UI consumes, without going through Spotify. */

import type { Board, BoardCard, BoardColumn } from '@/lib/domain/board';
import { COLUMNS, type ColumnId } from '@/lib/domain/columns';
import type { AlbumTrack } from '@/lib/domain/albums';

export function tracksOf(albumId: string, count: number, durationMs = 237_000): AlbumTrack[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${albumId}-t${index + 1}`,
    name: `Track ${index + 1}`,
    durationMs,
    trackNumber: index + 1,
    discNumber: 1,
    uri: `spotify:track:${albumId}-t${index + 1}`,
  }));
}

export function aCard(overrides: Partial<BoardCard> = {}): BoardCard {
  const id = overrides.id ?? 'alb1';
  const trackCount = overrides.tracks?.length ?? 10;
  const tracks = overrides.tracks ?? tracksOf(id, trackCount);
  return {
    id,
    name: 'In Rainbows',
    uri: `spotify:album:${id}`,
    artist: 'Radiohead',
    year: '2007',
    imageUrl: 'https://i.scdn.co/mid.jpg',
    totalTracks: tracks.length,
    durationMs: tracks.reduce((total, track) => total + track.durationMs, 0),
    albumType: 'album',
    tracks,
    addedAt: '2026-07-06T09:00:00.000Z',
    columnId: 'x3',
    listens: 3,
    inFlight: null,
    pendingAdvance: 0,
    ...overrides,
  };
}

/** A board with the seven columns and whatever cards a test puts in them. */
export function aBoard(cardsByColumn: Partial<Record<ColumnId, BoardCard[]>> = {}): Board {
  const columns: BoardColumn[] = COLUMNS.map((column) => ({
    ...column,
    playlistId: `pl-${column.id}`,
    playlistUrl: `https://open.spotify.com/playlist/pl-${column.id}`,
    trackCount: (cardsByColumn[column.id] ?? []).reduce(
      (total, card) => total + card.tracks.length,
      0,
    ),
    albums: (cardsByColumn[column.id] ?? []).map((card) => ({
      ...card,
      columnId: column.id,
      listens: column.listens,
    })),
  }));
  return { columns, generatedAt: Date.parse('2026-07-10T12:00:00.000Z') };
}

/** A fetch that answers by URL, for hooks and screens that talk to the API. */
export function routedFetch(routes: Record<string, unknown | (() => unknown)>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const key = Object.keys(routes).find((candidate) => url.startsWith(candidate));
    const entry = key ? routes[key] : undefined;
    const value = typeof entry === 'function' ? (entry as () => unknown)() : entry;

    if (value === undefined) {
      return new Response(JSON.stringify({ error: `no stub for ${url}` }), { status: 404 });
    }
    if (value instanceof Response) return value;
    void init;
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}
