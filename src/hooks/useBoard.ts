'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board, BoardCard } from '@/lib/domain/board';
import { advanceBy, getColumn, type ColumnId } from '@/lib/domain/columns';

export interface Advance {
  album: BoardCard;
  from: ColumnId;
  to: ColumnId;
  /** The listen that earned the move, as a number for the toast's ordinal. */
  listen: number;
}

/** How long undo stays available. In the page only; a reload loses it. */
export const UNDO_WINDOW_MS = 30_000;

/**
 * What a filed advance is remembered by: the album, and the column it left.
 * The column is part of the key so the next pass — out of the next column — is
 * still a new thing to file.
 */
const fileKey = (albumId: string, from: ColumnId) => `${albumId}:${from}`;

export interface UseBoardOptions {
  fetchImpl?: typeof fetch;
  onSetupRequired?(): void;
}

export interface UseBoardResult {
  board: Board | null;
  loading: boolean;
  error: string | null;
  advance: Advance | null;
  refresh(): Promise<void>;
  move(album: BoardCard, to: ColumnId): Promise<void>;
  remove(album: BoardCard): Promise<void>;
  /**
   * Resolves to what Spotify refused with, or null when the records went in.
   * The add-albums modal writes a record per press and sits over the board's
   * own error line, so it has to be told rather than shown.
   */
  addAlbums(albumIds: string[]): Promise<string | null>;
  undo(advance: Advance): Promise<void>;
  justMovedIds: ReadonlySet<string>;
}

export function useBoard({ fetchImpl, onSetupRequired }: UseBoardOptions = {}): UseBoardResult {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advance, setAdvance] = useState<Advance | null>(null);
  const [justMovedIds, setJustMovedIds] = useState<ReadonlySet<string>>(new Set());

  const doFetch = fetchImpl ?? globalThis.fetch;
  // Held in a ref so a new callback identity doesn't re-run the board read.
  const onSetup = useRef(onSetupRequired);
  useEffect(() => {
    onSetup.current = onSetupRequired;
  }, [onSetupRequired]);
  // Guards against a move that somehow doesn't clear its own pendingAdvance
  // turning into a loop of playlist writes.
  const advancing = useRef(false);
  // Advances this session has already written. A move resets the album's
  // added_at, which is what stops a pass being counted twice — but Spotify
  // serves the playlist read that follows a write from just behind it, so a
  // board read moments later can still show the album where it was, with the
  // same pass still to its name. Remembering what was filed is what makes a
  // read that lands in that window harmless.
  const filed = useRef(new Set<string>());

  const write = useCallback(
    async (path: string, method: string, body: unknown) => {
      const response = await doFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Spotify refused that change');
      }
    },
    [doFetch],
  );

  const load = useCallback(
    async ({ autoAdvance }: { autoAdvance: boolean }) => {
      try {
        const response = await doFetch('/api/board');
        const body = await response.json();

        if (!response.ok) {
          setError(body.error ?? 'Could not read the board');
          setLoading(false);
          return;
        }
        if (body.setupRequired) {
          onSetup.current?.();
          setLoading(false);
          return;
        }

        const next = body.board as Board;
        setBoard(next);
        setError(null);
        setLoading(false);

        if (!autoAdvance || advancing.current) return;

        // Cards move themselves: anything that earned a column while nobody was
        // looking gets filed now, with a toast and thirty seconds of undo.
        const earned = next.columns
          .flatMap((column) => column.albums)
          .filter(
            (album) =>
              album.pendingAdvance > 0 && !filed.current.has(fileKey(album.id, album.columnId)),
          );
        if (earned.length === 0) return;

        advancing.current = true;
        try {
          for (const album of earned) {
            const to = advanceBy(album.columnId, album.pendingAdvance);
            if (!to) continue;
            await write('/api/board/move', 'POST', { albumId: album.id, from: album.columnId, to });
            filed.current.add(fileKey(album.id, album.columnId));
            setAdvance({
              album,
              from: album.columnId,
              to,
              // advanceBy only ever returns ×N or Done, all of which count listens.
              listen: getColumn(to).listens as number,
            });
            setJustMovedIds((current) => new Set(current).add(album.id));
          }
          await load({ autoAdvance: false });
        } finally {
          advancing.current = false;
        }
      } catch {
        setError('Could not reach Spotify');
        setLoading(false);
      }
    },
    [doFetch, write],
  );

  useEffect(() => {
    void load({ autoAdvance: true });
  }, [load]);

  useEffect(() => {
    if (!advance) return;
    const timer = setTimeout(() => setAdvance(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [advance]);

  // Looking again because the music moved on is precisely when a finished pass
  // is waiting to be filed, so this read advances. The reads that follow a
  // write don't: they are the receipt for a change already made.
  const refresh = useCallback(() => load({ autoAdvance: true }), [load]);

  const move = useCallback(
    async (album: BoardCard, to: ColumnId) => {
      if (album.columnId === to) return;
      try {
        // A manual move sets the play count to that column's value, which is
        // what dropping a card into a column means.
        await write('/api/board/move', 'POST', { albumId: album.id, from: album.columnId, to });
        // Whatever this session filed for the album, a pass out of the column
        // it has just been put in is a new one.
        filed.current.delete(fileKey(album.id, to));
        await load({ autoAdvance: false });
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    [write, load],
  );

  const remove = useCallback(
    async (album: BoardCard) => {
      try {
        await write('/api/board/albums', 'DELETE', { albumId: album.id, from: album.columnId });
        await load({ autoAdvance: false });
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    [write, load],
  );

  const addAlbums = useCallback(
    async (albumIds: string[]): Promise<string | null> => {
      try {
        await write('/api/board/albums', 'POST', { albumIds, to: 'queue' });
        await load({ autoAdvance: false });
        return null;
      } catch (failure) {
        const message = (failure as Error).message;
        setError(message);
        return message;
      }
    },
    [write, load],
  );

  const undo = useCallback(
    async (target: Advance) => {
      setAdvance(null);
      try {
        await write('/api/board/move', 'POST', {
          albumId: target.album.id,
          from: target.to,
          to: target.from,
        });
        // Undo puts the album back where the pass started from, so that pass is
        // once again unfiled — and a later one out of that column can advance.
        filed.current.delete(fileKey(target.album.id, target.from));
        setJustMovedIds((current) => {
          const next = new Set(current);
          next.delete(target.album.id);
          return next;
        });
        await load({ autoAdvance: false });
      } catch (failure) {
        setError((failure as Error).message);
      }
    },
    [write, load],
  );

  return {
    board,
    loading,
    error,
    advance,
    justMovedIds,
    refresh,
    move,
    remove,
    addAlbums,
    undo,
  };
}
