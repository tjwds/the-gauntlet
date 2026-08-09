import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardScreen, filterBoard } from './BoardScreen';
import { aBoard, aCard } from '@/test/board';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const mediaQuery = vi.hoisted(() => ({ narrow: false, options: null as unknown }));
vi.mock('@heroui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@heroui/react')>();
  return {
    ...actual,
    useMediaQuery: (_query: string, options: unknown) => {
      mediaQuery.options = options;
      return mediaQuery.narrow;
    },
  };
});

const silent = { playback: null, device: null, repeat: 'off', track: null };

/** Playback of a record the board has never heard of, as `/api/player` reports it. */
function offBoard({ imageUrl }: { imageUrl: string | null }) {
  return {
    playback: { isPlaying: true, shuffle: false, progressMs: 1000, albumId: 'elsewhere' },
    device: null,
    repeat: 'off',
    track: {
      id: 'x1',
      name: 'Something Else',
      artist: 'Someone',
      albumName: 'Not On The Board',
      albumId: 'elsewhere',
      imageUrl,
      durationMs: 200_000,
      trackNumber: 1,
    },
  };
}

/** The art in the playback bar, which the board's own cards would otherwise shadow. */
const playbarArt = () => within(screen.getByTestId('playbar'));

function stubApi(overrides: Record<string, unknown> = {}) {
  const writes: Array<{ url: string; body: unknown }> = [];
  const routes: Record<string, unknown> = {
    '/api/board': {
      setupRequired: false,
      board: aBoard({
        queue: [aCard({ id: 'q1', name: 'Blue Rev', artist: 'Alvvays' })],
        x3: [aCard({ id: 'a3', name: 'In Rainbows', artist: 'Radiohead' })],
      }),
    },
    '/api/player': silent,
    ...overrides,
  };

  const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (init.method) {
      writes.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((candidate) => url.startsWith(candidate));
    return new Response(JSON.stringify(key ? routes[key] : {}), { status: 200 });
  });

  return { impl: impl as unknown as typeof fetch, writes };
}

beforeEach(() => {
  push.mockClear();
  mediaQuery.narrow = false;
});

describe('BoardScreen', () => {
  it('draws the board once it has read it', async () => {
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());
    expect(screen.getByTestId('column-queue')).toBeInTheDocument();
  });

  it('waits rather than showing an empty board', () => {
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    expect(screen.getByLabelText('Loading the board')).toBeInTheDocument();
  });

  it('sends a listener with no playlists to setup', async () => {
    const { impl } = stubApi({ '/api/board': { setupRequired: true, missing: ['x'] } });
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/setup'));
  });

  it('reports what went wrong instead of an empty board', async () => {
    const impl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith('/api/board')
        ? new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 })
        : new Response(JSON.stringify(silent), { status: 200 }),
    ) as unknown as typeof fetch;
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Rate limited'));
  });

  it('narrows the board to what was searched for', async () => {
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    await userEvent.type(screen.getByRole('textbox', { name: 'Search the board' }), 'alvvays');
    await waitFor(() => expect(screen.queryByText('In Rainbows')).not.toBeInTheDocument());
    expect(screen.getByText('Blue Rev')).toBeInTheDocument();
  });

  it('waits for the client before deciding the screen is narrow', async () => {
    // Reading matchMedia on the first client render would disagree with what
    // the server rendered, and the whole tree would be thrown away.
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());
    expect(mediaQuery.options).toMatchObject({ initializeWithValue: false });
  });

  it('collapses to three columns on a narrow screen', async () => {
    mediaQuery.narrow = true;
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());
    expect(screen.queryByTestId('column-x3')).not.toBeInTheDocument();
  });

  it('opens the drawer from a card', async () => {
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Open In Rainbows' }));
    expect(await screen.findByRole('heading', { name: 'In Rainbows' })).toBeInTheDocument();
  });

  it('opens the add-albums modal from the header', async () => {
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    // The header button and the one at the foot of the Queue do the same thing.
    const [headerButton] = screen.getAllByRole('button', { name: '+ Add albums' });
    await userEvent.click(headerButton!);
    expect(await screen.findByRole('heading', { name: 'Add albums to queue' })).toBeInTheDocument();
  });

  it('opens the add-albums modal from the foot of the Queue', async () => {
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    const queueButton = within(screen.getByTestId('column-queue')).getByRole('button', {
      name: '+ Add albums',
    });
    await userEvent.click(queueButton);
    expect(await screen.findByRole('heading', { name: 'Add albums to queue' })).toBeInTheDocument();
  });

  it('starts a record from a card', async () => {
    const { impl, writes } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    const card = within(screen.getByTestId('column-x3')).getByTestId('board-card');
    await userEvent.click(within(card).getByRole('button', { name: 'Play album' }));
    await waitFor(() =>
      expect(writes).toContainEqual({
        url: '/api/player',
        body: { albumUri: 'spotify:album:a3' },
      }),
    );
  });

  it('says so when the record does not start, instead of swallowing it', async () => {
    // Spotify 404s the play when nothing is open to play on. Without this the
    // button clicks, no music arrives, and the reason is only in the server log.
    const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (init.method) {
        return new Response(
          JSON.stringify({
            error: 'Player command failed: No active device found',
            reason: 'NO_ACTIVE_DEVICE',
          }),
          { status: 404 },
        );
      }
      if (url.startsWith('/api/player')) return new Response(JSON.stringify(silent), { status: 200 });
      return new Response(
        JSON.stringify({
          setupRequired: false,
          board: aBoard({ x3: [aCard({ id: 'a3', name: 'In Rainbows' })] }),
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    const card = within(screen.getByTestId('column-x3')).getByTestId('board-card');
    await userEvent.click(within(card).getByRole('button', { name: 'Play album' }));

    expect(await screen.findByTestId('playback-alert')).toHaveTextContent(
      'Nothing to play on — open Spotify on a phone, computer or speaker, then try again.',
    );
    // And the board is still there behind it: a refused play is not a dead end.
    expect(screen.getByText('In Rainbows')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('playback-alert')).not.toBeInTheDocument();
  });

  it('sends a free account out to Spotify instead of trying to play', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { impl, writes } = stubApi();
    render(<BoardScreen fetchImpl={impl} canPlayInApp={false} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    const card = within(screen.getByTestId('column-x3')).getByTestId('board-card');
    await userEvent.click(within(card).getByRole('button', { name: 'Play album' }));
    expect(open).toHaveBeenCalledWith('https://open.spotify.com/album/a3', '_blank', 'noopener');
    expect(writes).toHaveLength(0);
    open.mockRestore();
  });

  it('re-reads the board when the track changes, since that is what moves a card', async () => {
    let track = 'a3-t1';
    const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (init.method) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url.startsWith('/api/player')) {
        return new Response(
          JSON.stringify({
            playback: { isPlaying: true, shuffle: false, progressMs: 1, albumId: 'a3' },
            device: null,
            repeat: 'off',
            track: {
              id: track,
              name: 'Track',
              artist: 'Radiohead',
              albumName: 'In Rainbows',
              albumId: 'a3',
              imageUrl: 'https://i.scdn.co/mid.jpg',
              durationMs: 1000,
              trackNumber: 1,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          setupRequired: false,
          board: aBoard({ x3: [aCard({ id: 'a3', name: 'In Rainbows' })] }),
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<BoardScreen fetchImpl={impl} />);
    await vi.waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    const boardReads = () =>
      (impl as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
        (call) => String(call[0]) === '/api/board',
      ).length;

    // The same track, poll after poll: the board must be left alone. Re-reading
    // it every poll is what rate-limited the account during development.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const afterIdlePolls = boardReads();

    track = 'a3-t2';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(boardReads()).toBeGreaterThan(afterIdlePolls);
    vi.useRealTimers();
  });

  it('files a record finished while the board sat open', async () => {
    // The whole point of the board watching playback: the listener does not
    // reload the page when a record ends, so the move has to happen under them.
    // Autoplay off, so the last track stops rather than giving way to another —
    // the id never changes, and the stop is the only cue there is.
    let finished = false;
    const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (init.method) {
        writes.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.startsWith('/api/player')) {
        return new Response(
          JSON.stringify({
            playback: { isPlaying: !finished, shuffle: false, progressMs: 1, albumId: 'q1' },
            device: null,
            repeat: 'off',
            track: {
              id: 'q1-t12',
              name: 'Fool',
              artist: 'Mr Little Jeans',
              albumName: 'Pocketknife',
              albumId: 'q1',
              imageUrl: 'https://i.scdn.co/mid.jpg',
              durationMs: 1000,
              trackNumber: 12,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          setupRequired: false,
          board: aBoard({
            queue: [aCard({ id: 'q1', name: 'Pocketknife', pendingAdvance: finished ? 1 : 0 })],
          }),
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const writes: Array<{ url: string; body: unknown }> = [];

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<BoardScreen fetchImpl={impl} />);
    await vi.waitFor(() => expect(screen.getByText('Pocketknife')).toBeInTheDocument());
    expect(writes).toHaveLength(0);

    finished = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(writes).toEqual([
      { url: '/api/board/move', body: { albumId: 'q1', from: 'queue', to: 'x1' } },
    ]);

    // And the board carries on being read without filing it a second time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(writes).toHaveLength(1);
    vi.useRealTimers();
  });

  it('shows the playback bar only once something is playing', async () => {
    const { impl } = stubApi({
      '/api/player': {
        playback: { isPlaying: true, shuffle: false, progressMs: 1000, albumId: 'a3' },
        device: { id: 'd1', name: 'MacBook Pro', type: 'Computer', is_active: true, volume_percent: 50 },
        repeat: 'off',
        track: {
          id: 'a3-t1',
          name: '15 Step',
          artist: 'Radiohead',
          albumName: 'In Rainbows',
          albumId: 'a3',
          imageUrl: 'https://i.scdn.co/from-playback.jpg',
          durationMs: 237_000,
          trackNumber: 1,
        },
      },
    });
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('15 Step')).toBeInTheDocument());
    expect(screen.getByText('Radiohead · In Rainbows')).toBeInTheDocument();
    // Position in the record, on the card and in the bar alike.
    expect(screen.getAllByText('track 1 of 10 · 39m left')).toHaveLength(2);
    // On the board, so the card's art is what the bar shows.
    expect(playbarArt().getByRole('presentation')).toHaveAttribute(
      'src',
      'https://i.scdn.co/mid.jpg',
    );
  });

  it('names who is signed in', async () => {
    const { impl } = stubApi();
    render(<BoardScreen fetchImpl={impl} user={{ name: 'joe', image: null }} />);
    await waitFor(() => expect(screen.getByText('joe')).toBeInTheDocument());
  });

  it('files a record moved from the drawer', async () => {
    const { impl, writes } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Open In Rainbows' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Abandon' }));
    await waitFor(() =>
      expect(writes).toContainEqual({
        url: '/api/board/move',
        body: { albumId: 'a3', from: 'x3', to: 'abandoned' },
      }),
    );
  });
});

describe('BoardScreen, the rest of the wiring', () => {
  it('files a card dragged across the board', async () => {
    const { impl, writes } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    fireEvent.dragStart(within(screen.getByTestId('column-x3')).getByTestId('board-card'));
    const target = screen.getByTestId('column-x4');
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    await waitFor(() =>
      expect(writes).toContainEqual({
        url: '/api/board/move',
        body: { albumId: 'a3', from: 'x3', to: 'x4' },
      }),
    );
  });

  it('takes a card off the board from its menu', async () => {
    const { impl, writes } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    const card = within(screen.getByTestId('column-x3')).getByTestId('board-card');
    await userEvent.click(within(card).getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from board' }));

    await waitFor(() =>
      expect(writes).toContainEqual({
        url: '/api/board/albums',
        body: { albumId: 'a3', from: 'x3' },
      }),
    );
  });

  it('takes a card off the board from the drawer', async () => {
    const { impl, writes } = stubApi();
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Open In Rainbows' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from board' }));

    await waitFor(() =>
      expect(writes).toContainEqual({
        url: '/api/board/albums',
        body: { albumId: 'a3', from: 'x3' },
      }),
    );
  });

  it('adds albums picked in the modal', async () => {
    const { impl, writes } = stubApi({
      '/api/catalogue': {
        albums: [
          {
            id: 'new1',
            name: 'Titanic Rising',
            uri: 'spotify:album:new1',
            artist: 'Weyes Blood',
            year: '2019',
            imageUrl: null,
            totalTracks: 10,
            durationMs: 2_520_000,
            albumType: 'album',
            onBoard: null,
          },
        ],
      },
    });
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());

    const [headerButton] = screen.getAllByRole('button', { name: '+ Add albums' });
    await userEvent.click(headerButton!);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Add albums to queue' }), 'w');
    await userEvent.click(await screen.findByRole('button', { name: '+ Queue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to Queue' }));

    await waitFor(() =>
      expect(writes).toContainEqual({
        url: '/api/board/albums',
        body: { albumIds: ['new1'], to: 'queue' },
      }),
    );
  });

  it('undoes a move the board made by itself', async () => {
    const { impl, writes } = stubApi({
      '/api/board': {
        setupRequired: false,
        board: aBoard({ x1: [aCard({ id: 'a1', columnId: 'x1', pendingAdvance: 1 })] }),
      },
    });
    render(<BoardScreen fetchImpl={impl} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(writes).toContainEqual({
        url: '/api/board/move',
        body: { albumId: 'a1', from: 'x2', to: 'x1' },
      }),
    );
  });

  it('drives the transport and the device picker', async () => {
    const { impl, writes } = stubApi({
      '/api/player/transport': { devices: [{ id: 'dev2', name: 'Kitchen speaker' }] },
      '/api/player': {
        playback: { isPlaying: true, shuffle: false, progressMs: 1000, albumId: 'a3' },
        device: { id: 'd1', name: 'MacBook Pro', type: 'Computer', is_active: true, volume_percent: 50 },
        repeat: 'off',
        track: {
          id: 'a3-t1',
          name: '15 Step',
          artist: 'Radiohead',
          albumName: 'In Rainbows',
          albumId: 'a3',
          imageUrl: 'https://i.scdn.co/mid.jpg',
          durationMs: 237_000,
          trackNumber: 1,
        },
      },
    });
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('15 Step')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(writes).toContainEqual({
        url: '/api/player/transport',
        body: { command: 'pause' },
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: /MacBook Pro/ }));
    expect(await screen.findByRole('menuitem', { name: 'Kitchen speaker' })).toBeInTheDocument();
  });
});

describe('BoardScreen with the browser own plumbing', () => {
  it("falls back to the browser's own fetch", async () => {
    const original = globalThis.fetch;
    const { impl } = stubApi();
    globalThis.fetch = impl;
    render(<BoardScreen />);
    await waitFor(() => expect(screen.getByText('In Rainbows')).toBeInTheDocument());
    globalThis.fetch = original;
  });

  it('still shows the bar for a record that is not on the board, art and all', async () => {
    // Playing something from the Spotify app that was never queued here. There
    // is no card to take art from, so the bar uses what playback reported.
    const { impl } = stubApi({
      '/api/player': offBoard({ imageUrl: 'https://i.scdn.co/elsewhere.jpg' }),
    });
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('Something Else')).toBeInTheDocument());
    expect(playbarArt().getByRole('presentation')).toHaveAttribute(
      'src',
      'https://i.scdn.co/elsewhere.jpg',
    );
    expect(playbarArt().queryByTestId('album-art-placeholder')).not.toBeInTheDocument();
  });

  it('falls back to the placeholder when Spotify has no art for it either', async () => {
    const { impl } = stubApi({ '/api/player': offBoard({ imageUrl: null }) });
    render(<BoardScreen fetchImpl={impl} />);
    await waitFor(() => expect(screen.getByText('Something Else')).toBeInTheDocument());
    expect(playbarArt().getByTestId('album-art-placeholder')).toBeInTheDocument();
  });
});

describe('filterBoard', () => {
  const board = aBoard({
    queue: [aCard({ id: 'q1', name: 'Blue Rev', artist: 'Alvvays' })],
    x3: [aCard({ id: 'a3', name: 'In Rainbows', artist: 'Radiohead' })],
  });

  const names = (result: ReturnType<typeof filterBoard>) =>
    result.columns.flatMap((column) => column.albums.map((album) => album.name));

  it('leaves the board alone for an empty search', () => {
    expect(filterBoard(board, '   ')).toBe(board);
  });

  it('matches on the record', () => {
    expect(names(filterBoard(board, 'rainbows'))).toEqual(['In Rainbows']);
  });

  it('matches on the artist', () => {
    expect(names(filterBoard(board, 'alvvays'))).toEqual(['Blue Rev']);
  });

  it('keeps the seven columns even when nothing matches', () => {
    const result = filterBoard(board, 'nothing here');
    expect(result.columns).toHaveLength(7);
    expect(names(result)).toEqual([]);
  });
});
