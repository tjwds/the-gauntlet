/**
 * The app's own API, answered out of the demo dataset.
 *
 * Every screen already takes a `fetchImpl` — the prop the tests drive them
 * through — so the demo needs no route handlers, no session and no Spotify app
 * registration. Writes are applied to the board held in here, which is what
 * makes the advance toast, its undo and a dragged card behave the way they do
 * against the real thing rather than snapping back on the next read.
 */

import type { Board, BoardCard } from '@/lib/domain/board';
import { getColumn, isColumnId, type ColumnId } from '@/lib/domain/columns';
import {
  DEMO_ALBUMS,
  DEMO_DEVICES,
  DEMO_PLAYLISTS,
  demoAccount,
  demoAlbum,
  demoBoard,
  demoPlayback,
  demoPlaylistRows,
  demoSaved,
  demoSearch,
  demoSuggestions,
  IDLE_PLAYBACK,
  playing,
  type DemoAlbum,
  type DemoPlayback,
} from './data';

export interface DemoApiOptions {
  nowMs: number;
  /** Whether a record is playing: the playbar, and the pass a card is part-way through. */
  playing?: boolean;
  /** Whether a completed pass is waiting to be filed: the advance toast and its undo. */
  advancing?: boolean;
}

interface WriteBody {
  albumId?: unknown;
  albumIds?: unknown;
  albumUri?: unknown;
  from?: unknown;
  to?: unknown;
  command?: unknown;
  value?: unknown;
}

/** A card carries a URI, which is what a play command names a record by. */
const BY_URI = new Map(DEMO_ALBUMS.map((record) => [record.uri, record]));

/** Rebuild the board around a change to which column holds what. */
function edit(board: Board, change: (byColumn: Record<ColumnId, BoardCard[]>) => void): Board {
  const byColumn = Object.fromEntries(
    board.columns.map((column) => [column.id, [...column.albums]]),
  ) as Record<ColumnId, BoardCard[]>;

  change(byColumn);

  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      albums: byColumn[column.id],
      trackCount: byColumn[column.id].reduce((total, card) => total + card.tracks.length, 0),
    })),
  };
}

function findCardById(board: Board, albumId: string): BoardCard | null {
  for (const column of board.columns) {
    const match = column.albums.find((card) => card.id === albumId);
    if (match) return match;
  }
  return null;
}

export function createDemoApi(options: DemoApiOptions): typeof fetch {
  let board = demoBoard(options.nowMs, { withEarnedPass: options.advancing === true });
  let playback: DemoPlayback =
    options.playing === true ? demoPlayback(options.nowMs) : IDLE_PLAYBACK;

  /**
   * A move is a remove-then-append between two playlists, so the record lands
   * at the end of its new column with its arrival date reset — and whatever
   * pass it was part-way through is spent.
   */
  const move = (albumId: string, to: ColumnId) => {
    const card = findCardById(board, albumId);
    if (!card || card.columnId === to) return;
    board = edit(board, (byColumn) => {
      byColumn[card.columnId] = byColumn[card.columnId].filter((entry) => entry.id !== albumId);
      byColumn[to] = [
        ...byColumn[to],
        {
          ...card,
          columnId: to,
          listens: getColumn(to).listens,
          addedAt: new Date(options.nowMs).toISOString(),
          inFlight: null,
          pendingAdvance: 0,
        },
      ];
    });
  };

  const add = (albumIds: string[], to: ColumnId) => {
    const records = albumIds
      .map((id) => demoAlbum(id))
      .filter((record): record is DemoAlbum => record !== undefined)
      .filter((record) => findCardById(board, record.id) === null);
    if (records.length === 0) return;
    board = edit(board, (byColumn) => {
      byColumn[to] = [
        ...byColumn[to],
        ...records.map((record) => ({
          ...record,
          columnId: to,
          listens: getColumn(to).listens,
          addedAt: new Date(options.nowMs).toISOString(),
          inFlight: null,
          pendingAdvance: 0,
        })),
      ];
    });
  };

  const remove = (albumId: string) => {
    board = edit(board, (byColumn) => {
      for (const id of Object.keys(byColumn) as ColumnId[]) {
        byColumn[id] = byColumn[id].filter((card) => card.id !== albumId);
      }
    });
  };

  /** A record started from a card begins at track 1, as the real one does. */
  const start = (albumUri: string) => {
    const record = BY_URI.get(albumUri);
    if (record) playback = playing(record, 1, 0, options.nowMs);
  };

  /** Transport, as far as anything the demo shows can tell. */
  const transport = (body: WriteBody) => {
    const current = playback.playback;
    if (!current || !playback.track) return;
    const record = demoAlbum(current.albumId);

    switch (body.command) {
      case 'pause':
      case 'resume':
        playback = {
          ...playback,
          playback: { ...current, isPlaying: body.command === 'resume' },
        };
        return;
      case 'seek':
        playback = {
          ...playback,
          playback: { ...current, progressMs: typeof body.value === 'number' ? body.value : 0 },
        };
        return;
      case 'next':
      case 'previous': {
        if (!record) return;
        const step = body.command === 'next' ? 1 : -1;
        const trackNumber = playback.track.trackNumber + step;
        if (trackNumber < 1 || trackNumber > record.tracks.length) return;
        playback = playing(record, trackNumber, 0, options.nowMs);
        return;
      }
      default:
        // volume, repeat and the device picker change nothing the demo shows.
        return;
    }
  };

  const handle = (url: URL, method: string, body: WriteBody): unknown => {
    switch (url.pathname) {
      case '/api/board':
        return { setupRequired: false, board };

      case '/api/board/move':
        if (typeof body.albumId === 'string' && isColumnId(body.to)) move(body.albumId, body.to);
        return { moved: true };

      case '/api/board/albums':
        if (method === 'DELETE') {
          if (typeof body.albumId === 'string') remove(body.albumId);
          return { removed: true };
        }
        if (Array.isArray(body.albumIds)) {
          add(
            body.albumIds.filter((id): id is string => typeof id === 'string'),
            isColumnId(body.to) ? body.to : 'queue',
          );
        }
        return { added: true };

      case '/api/player':
        if (method === 'PUT') {
          if (typeof body.albumUri === 'string') start(body.albumUri);
          return { playing: body.albumUri };
        }
        return playback;

      case '/api/player/transport':
        if (method === 'GET') return { devices: DEMO_DEVICES };
        transport(body);
        return { ok: true };

      case '/api/account':
        return demoAccount(board);

      case '/api/suggestions':
        return { range: url.searchParams.get('range'), suggestions: demoSuggestions(url.searchParams.get('range'), board) };

      case '/api/catalogue': {
        const source = url.searchParams.get('source') ?? 'search';
        if (source === 'saved') return { source, albums: demoSaved(board) };
        if (source === 'playlists') return { source, playlists: DEMO_PLAYLISTS };
        if (source === 'playlist') return { source, tracks: demoPlaylistRows(board) };
        return { source, albums: demoSearch(url.searchParams.get('q') ?? '', board) };
      }

      default:
        // Setup's create and delete, and anything else a screen only checks the
        // status of.
        return { ok: true };
    }
  };

  const demoFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    // Every caller in the app passes a path; the base is only here because URL
    // insists on one.
    const url = new URL(String(input), 'http://demo.invalid');
    const method = (init.method ?? 'GET').toUpperCase();
    const body: WriteBody = typeof init.body === 'string' ? JSON.parse(init.body) : {};

    return new Response(JSON.stringify(handle(url, method, body)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return demoFetch as unknown as typeof fetch;
}
