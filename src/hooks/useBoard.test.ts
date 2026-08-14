import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBoard, UNDO_WINDOW_MS } from './useBoard';
import { aBoard, aCard } from '@/test/board';

/** A fetch that answers /api/board from a queue and records every write. */
function stubApi(boards: unknown[], { writeFails = false } = {}) {
  const writes: Array<{ url: string; method: string; body: unknown }> = [];
  let reads = 0;

  const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url === '/api/board' && !init.method) {
      const body = boards[Math.min(reads, boards.length - 1)];
      reads += 1;
      return new Response(JSON.stringify(body), { status: 200 });
    }
    writes.push({ url, method: init.method ?? 'GET', body: JSON.parse(String(init.body)) });
    return writeFails
      ? new Response(JSON.stringify({ error: 'Spotify said no' }), { status: 409 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  return { impl: impl as unknown as typeof fetch, writes, readCount: () => reads };
}

const ready = (board = aBoard()) => ({ setupRequired: false, board });

describe('useBoard', () => {
  it('reads the board on mount', async () => {
    const { impl } = stubApi([ready(aBoard({ queue: [aCard({ id: 'a1' })] }))]);
    const { result } = renderHook(() => useBoard({ fetchImpl: impl }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.board?.columns).toHaveLength(7);
    expect(result.current.error).toBeNull();
  });

  it("uses the browser's own fetch when it is given none", async () => {
    const original = globalThis.fetch;
    const { impl } = stubApi([ready()]);
    globalThis.fetch = impl;
    const { result } = renderHook(() => useBoard());
    await waitFor(() => expect(result.current.board).not.toBeNull());
    globalThis.fetch = original;
  });

  it('falls back to a plain message when the board read says nothing', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 500 }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
    await waitFor(() => expect(result.current.error).toBe('Could not read the board'));
  });

  it('does not fall over when setup is needed and nobody is listening', async () => {
    const { impl } = stubApi([{ setupRequired: true, missing: [] }]);
    const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.board).toBeNull();
  });

  it('sends a listener with no playlists to setup', async () => {
    const { impl } = stubApi([{ setupRequired: true, missing: ['Gauntlet · Queue'] }]);
    const onSetupRequired = vi.fn();
    const { result } = renderHook(() => useBoard({ fetchImpl: impl, onSetupRequired }));

    await waitFor(() => expect(onSetupRequired).toHaveBeenCalled());
    expect(result.current.board).toBeNull();
  });

  it('reports what the board read refused', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
    await waitFor(() => expect(result.current.error).toBe('Rate limited'));
  });

  it('reports a network that would not answer', async () => {
    const impl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
    await waitFor(() => expect(result.current.error).toBe('Could not reach Spotify'));
  });

  describe('cards moving themselves', () => {
    it('files a record that earned a column while nobody was looking', async () => {
      const earned = aCard({ id: 'a1', pendingAdvance: 1 });
      const { impl, writes } = stubApi([
        ready(aBoard({ x1: [earned] })),
        ready(aBoard({ x2: [aCard({ id: 'a1', columnId: 'x2' })] })),
      ]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));

      await waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0]).toMatchObject({
        url: '/api/board/move',
        method: 'POST',
        body: { albumId: 'a1', from: 'x1', to: 'x2' },
      });
      await waitFor(() => expect(result.current.advance?.to).toBe('x2'));
      expect(result.current.advance?.listen).toBe(2);
    });

    it('crosses several columns for a record left on repeat', async () => {
      const earned = aCard({ id: 'a1', pendingAdvance: 3 });
      const { impl, writes } = stubApi([ready(aBoard({ x1: [earned] })), ready(aBoard())]);
      renderHook(() => useBoard({ fetchImpl: impl }));

      await waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0]?.body).toMatchObject({ from: 'x1', to: 'x4' });
    });

    it('marks the cards that moved, for the animation', async () => {
      const { impl } = stubApi([
        ready(aBoard({ x1: [aCard({ id: 'a1', pendingAdvance: 1 })] })),
        ready(aBoard()),
      ]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.justMovedIds.has('a1')).toBe(true));
    });

    it('leaves a record alone when it has earned nothing', async () => {
      const { impl, writes } = stubApi([ready(aBoard({ x1: [aCard({ pendingAdvance: 0 })] }))]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(writes).toHaveLength(0);
    });

    it('does not try to advance a record already in Done', async () => {
      // The board should never report this, but a write would be wrong if it did.
      const { impl, writes } = stubApi([
        ready(aBoard({ done: [aCard({ id: 'a1', pendingAdvance: 2 })] })),
      ]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(writes).toHaveLength(0);
    });

    it('does not advance again on a later read', async () => {
      // Spotify serves the read after a write from just behind it, so a board
      // read moments later can still show the album where it was.
      const { impl, writes } = stubApi([
        ready(aBoard({ x1: [aCard({ id: 'a1', pendingAdvance: 1 })] })),
        ready(aBoard({ x1: [aCard({ id: 'a1', pendingAdvance: 1 })] })),
      ]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(writes).toHaveLength(1));
      await act(async () => {
        await result.current.refresh();
      });
      expect(writes).toHaveLength(1);
    });

    it('files a record finished while the board was open', async () => {
      // The pass completes mid-session, so it is only ever seen by a read that
      // the page asks for rather than the one it mounted with.
      const { impl, writes } = stubApi([
        ready(aBoard({ queue: [aCard({ id: 'a1', columnId: 'queue', pendingAdvance: 0 })] })),
        ready(aBoard({ queue: [aCard({ id: 'a1', columnId: 'queue', pendingAdvance: 1 })] })),
        ready(aBoard({ x1: [aCard({ id: 'a1', columnId: 'x1' })] })),
      ]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(writes).toHaveLength(0);

      await act(async () => {
        await result.current.refresh();
      });

      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        url: '/api/board/move',
        method: 'POST',
        body: { albumId: 'a1', from: 'queue', to: 'x1' },
      });
      await waitFor(() => expect(result.current.advance?.to).toBe('x1'));
    });

    it('files the next pass out of the column a record was put back in', async () => {
      // Undoing an advance returns the album to the column it came from. A
      // later pass out of that column is a new one, not the one already filed.
      const earned = aCard({ id: 'a1', columnId: 'queue', pendingAdvance: 1 });
      const { impl, writes } = stubApi([
        ready(aBoard({ queue: [earned] })),
        ready(aBoard({ x1: [aCard({ id: 'a1', columnId: 'x1' })] })),
        ready(aBoard({ queue: [aCard({ id: 'a1', columnId: 'queue' })] })),
        ready(aBoard({ queue: [earned] })),
        ready(aBoard({ x1: [aCard({ id: 'a1', columnId: 'x1' })] })),
      ]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));

      await waitFor(() => expect(writes).toHaveLength(1));
      const advance = result.current.advance;
      expect(advance).not.toBeNull();

      await act(async () => {
        await result.current.undo(advance as NonNullable<typeof advance>);
      });
      await waitFor(() => expect(writes).toHaveLength(2));

      await act(async () => {
        await result.current.refresh();
      });
      expect(writes).toHaveLength(3);
      expect(writes[2]).toMatchObject({ body: { albumId: 'a1', from: 'queue', to: 'x1' } });
    });

    it('files a pass out of the column a record was dropped into', async () => {
      const { impl, writes } = stubApi([
        ready(aBoard({ queue: [aCard({ id: 'a1', columnId: 'queue', pendingAdvance: 1 })] })),
        ready(aBoard({ x1: [aCard({ id: 'a1', columnId: 'x1' })] })),
        ready(aBoard({ queue: [aCard({ id: 'a1', columnId: 'queue' })] })),
        ready(aBoard({ queue: [aCard({ id: 'a1', columnId: 'queue', pendingAdvance: 1 })] })),
        ready(aBoard({ x1: [aCard({ id: 'a1', columnId: 'x1' })] })),
      ]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(writes).toHaveLength(1));

      // Dragged back to the Queue by hand, then played through again.
      await act(async () => {
        await result.current.move(aCard({ id: 'a1', columnId: 'x1' }), 'queue');
      });
      await waitFor(() => expect(writes).toHaveLength(2));

      await act(async () => {
        await result.current.refresh();
      });
      expect(writes).toHaveLength(3);
      expect(writes[2]).toMatchObject({ body: { albumId: 'a1', from: 'queue', to: 'x1' } });
    });
  });

  describe('undo', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('withdraws the offer after thirty seconds', async () => {
      const { impl } = stubApi([
        ready(aBoard({ x1: [aCard({ id: 'a1', pendingAdvance: 1 })] })),
        ready(aBoard()),
      ]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));

      await vi.waitFor(() => expect(result.current.advance).not.toBeNull());
      await act(async () => {
        vi.advanceTimersByTime(UNDO_WINDOW_MS + 1);
      });
      expect(result.current.advance).toBeNull();
    });
  });

  it('puts the record back where it came from', async () => {
    const { impl, writes } = stubApi([
      ready(aBoard({ x1: [aCard({ id: 'a1', pendingAdvance: 1 })] })),
      ready(aBoard()),
    ]);
    const { result } = renderHook(() => useBoard({ fetchImpl: impl }));

    await waitFor(() => expect(result.current.advance).not.toBeNull());
    const advance = result.current.advance!;
    await act(async () => {
      await result.current.undo(advance);
    });

    expect(writes.at(-1)?.body).toMatchObject({ albumId: 'a1', from: 'x2', to: 'x1' });
    expect(result.current.advance).toBeNull();
    expect(result.current.justMovedIds.has('a1')).toBe(false);
  });

  describe('manual changes', () => {
    it('moves a record to a named column', async () => {
      const album = aCard({ id: 'a1', columnId: 'x1' });
      const { impl, writes } = stubApi([ready(aBoard({ x1: [album] })), ready(aBoard())]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.move(album, 'x3');
      });
      expect(writes[0]?.body).toMatchObject({ albumId: 'a1', from: 'x1', to: 'x3' });
    });

    it('does not write when a card is dropped where it already was', async () => {
      const album = aCard({ id: 'a1', columnId: 'x1' });
      const { impl, writes } = stubApi([ready(aBoard({ x1: [album] }))]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.move(album, 'x1');
      });
      expect(writes).toHaveLength(0);
    });

    it('takes a record off the board', async () => {
      const album = aCard({ id: 'a1', columnId: 'queue' });
      const { impl, writes } = stubApi([ready(aBoard({ queue: [album] })), ready(aBoard())]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.remove(album);
      });
      expect(writes[0]).toMatchObject({
        url: '/api/board/albums',
        method: 'DELETE',
        body: { albumId: 'a1', from: 'queue' },
      });
    });

    it('adds records to the Queue', async () => {
      const { impl, writes } = stubApi([ready(), ready()]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.addAlbums(['a1', 'a2']);
      });
      expect(writes[0]?.body).toEqual({ albumIds: ['a1', 'a2'], to: 'queue' });
    });

    it('hands a refused add back to whatever asked for it', async () => {
      // The add-albums modal writes a record per press and covers the board's
      // own error line, so it has to be told rather than shown.
      const { impl } = stubApi([ready()], { writeFails: true });
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const answers: Array<string | null> = [];
      await act(async () => {
        answers.push(await result.current.addAlbums(['a1']));
      });
      expect(answers).toEqual(['Spotify said no']);
    });

    it('says nothing when the add went through', async () => {
      const { impl } = stubApi([ready(), ready()]);
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const answers: Array<string | null> = [];
      await act(async () => {
        answers.push(await result.current.addAlbums(['a1']));
      });
      expect(answers).toEqual([null]);
    });

    it.each([
      ['move', (r: ReturnType<typeof useBoard>) => r.move(aCard({ id: 'a1', columnId: 'x1' }), 'x2')],
      ['remove', (r: ReturnType<typeof useBoard>) => r.remove(aCard({ id: 'a1', columnId: 'x1' }))],
      ['addAlbums', (r: ReturnType<typeof useBoard>) => r.addAlbums(['a1'])],
      [
        'undo',
        (r: ReturnType<typeof useBoard>) =>
          r.undo({ album: aCard({ id: 'a1' }), from: 'x1', to: 'x2', listen: 2 }),
      ],
    ])('reports what Spotify refused during %s', async (_label, action) => {
      const { impl } = stubApi([ready()], { writeFails: true });
      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await action(result.current);
      });
      expect(result.current.error).toBe('Spotify said no');
    });

    it('falls back to a plain message when a refusal says nothing', async () => {
      const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        if (String(input) === '/api/board' && !init.method) {
          return new Response(JSON.stringify(ready()), { status: 200 });
        }
        return new Response('not json', { status: 500 });
      }) as unknown as typeof fetch;

      const { result } = renderHook(() => useBoard({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.addAlbums(['a1']);
      });
      expect(result.current.error).toBe('Spotify refused that change');
    });
  });
});
