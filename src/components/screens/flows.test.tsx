import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirstRecordsFlow, SettingsFlow, SetupFlow } from './flows';
import { COLUMNS } from '@/lib/domain/columns';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

function stubFetch(
  payloads: Record<string, unknown> = {},
  statuses: Record<string, number> = {},
) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    const key = Object.keys(payloads).find((candidate) => url.startsWith(candidate));
    const statusKey = Object.keys(statuses).find((candidate) => url.startsWith(candidate));
    return new Response(JSON.stringify(key ? payloads[key] : {}), {
      status: statusKey ? (statuses[statusKey] as number) : 200,
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

describe('SetupFlow', () => {
  it('creates the playlists then goes on to fill the queue', async () => {
    const { impl, calls } = stubFetch();
    render(<SetupFlow userName="joe" fetchImpl={impl} />);

    await userEvent.click(screen.getByRole('button', { name: "Let's go" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/first-records'));
    expect(calls[0]).toMatchObject({
      url: '/api/setup',
      method: 'POST',
      body: { private: true },
    });
  });

  it('passes the privacy choice through', async () => {
    const { impl, calls } = stubFetch();
    render(<SetupFlow userName="joe" fetchImpl={impl} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Private' }));
    await userEvent.click(screen.getByRole('button', { name: "Let's go" }));
    await waitFor(() => expect(calls[0]?.body).toEqual({ private: false }));
  });
});

describe('the flows without an injected fetch', () => {
  it("fall back to the browser's own", async () => {
    const original = globalThis.fetch;
    const { impl, calls } = stubFetch({ '/api/account': { user: {}, playlists: [], ready: true } });
    globalThis.fetch = impl;

    render(<SetupFlow userName="joe" />);
    await userEvent.click(screen.getByRole('button', { name: "Let's go" }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/setup')).toBe(true));

    globalThis.fetch = original;
  });
});

describe('SetupFlow when Spotify refuses', () => {
  it('shows what it refused and stays put', async () => {
    // Moving on would land the listener on a board whose playlists don't exist,
    // which bounces them straight back here with nothing explained.
    const { impl } = stubFetch(
      { '/api/setup': { error: 'Insufficient client scope' } },
      { '/api/setup': 403 },
    );
    render(<SetupFlow userName="joe" fetchImpl={impl} />);

    await userEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Insufficient client scope'),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('falls back to a plain message when the refusal says nothing', async () => {
    const { impl } = stubFetch({}, { '/api/setup': 500 });
    render(<SetupFlow userName="joe" fetchImpl={impl} />);
    await userEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("wouldn't create the playlists"),
    );
  });

  it('falls back when the refusal is not even JSON', async () => {
    const impl = vi.fn(
      async () => new Response('<html>gateway timeout</html>', { status: 504 }),
    ) as unknown as typeof fetch;
    render(<SetupFlow userName="joe" fetchImpl={impl} />);
    await userEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("wouldn't create the playlists"),
    );
  });

  it('says so when it cannot reach Spotify at all', async () => {
    const impl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    render(<SetupFlow userName="joe" fetchImpl={impl} />);
    await userEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not reach'));
    expect(push).not.toHaveBeenCalled();
  });

  it('clears the last refusal when trying again', async () => {
    const impl = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    render(<SetupFlow userName="joe" fetchImpl={impl} />);
    await userEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
  });
});

describe('FirstRecordsFlow', () => {
  const suggestion = {
    id: 'ants',
    name: 'Ants From Up There',
    uri: 'spotify:album:ants',
    artist: 'Black Country, New Road',
    year: '2022',
    imageUrl: null,
    totalTracks: 10,
    durationMs: 3_540_000,
    albumType: 'album',
    matches: [{ name: 'Concorde', rank: 3 }],
    bestRank: 3,
  };

  it('adds the picks to the Queue and opens the board', async () => {
    const { impl, calls } = stubFetch({ '/api/suggestions': { suggestions: [suggestion] } });
    render(<FirstRecordsFlow fetchImpl={impl} />);

    await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Start listening' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(calls.at(-1)).toMatchObject({
      url: '/api/board/albums',
      method: 'POST',
      body: { albumIds: ['ants'], to: 'queue' },
    });
  });

  it('stays put when the queue write is refused', async () => {
    const { impl } = stubFetch(
      { '/api/suggestions': { suggestions: [suggestion] } },
      { '/api/board/albums': 409 },
    );
    render(<FirstRecordsFlow fetchImpl={impl} />);

    await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Start listening/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Start listening/ })).toBeInTheDocument());
    expect(push).not.toHaveBeenCalledWith('/');
  });

  it('goes to the board when the listener would rather pick their own', async () => {
    const { impl } = stubFetch({ '/api/suggestions': { suggestions: [suggestion] } });
    render(<FirstRecordsFlow fetchImpl={impl} />);
    await userEvent.click(screen.getByRole('button', { name: "Skip — I'll pick my own" }));
    expect(push).toHaveBeenCalledWith('/');
  });

  it('takes itself out of the history when there is nothing to suggest', async () => {
    // A new account returns nothing from /me/top/tracks, and back should not
    // land the listener on an empty screen.
    const { impl } = stubFetch({ '/api/suggestions': { suggestions: [] } });
    render(<FirstRecordsFlow fetchImpl={impl} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });
});

describe('the remaining flows without an injected fetch', () => {
  const suggestion = {
    id: 'ants',
    name: 'Ants From Up There',
    uri: 'spotify:album:ants',
    artist: 'Black Country, New Road',
    year: '2022',
    imageUrl: null,
    totalTracks: 10,
    durationMs: 3_540_000,
    albumType: 'album',
    matches: [{ name: 'Concorde', rank: 3 }],
    bestRank: 3,
  };

  it('fall back to the browser\'s own', async () => {
    const original = globalThis.fetch;
    const { impl, calls } = stubFetch({
      '/api/suggestions': { suggestions: [suggestion] },
      '/api/account': {
        user: { id: 'joe', name: 'joe', email: null, product: 'premium', image: null },
        playlists: [],
        ready: true,
      },
    });
    globalThis.fetch = impl;

    const first = render(<FirstRecordsFlow />);
    await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Start listening' }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/board/albums')).toBe(true));
    first.unmount();

    render(<SettingsFlow onSignOut={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete playlists' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete playlists' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete playlists' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));

    globalThis.fetch = original;
  });
});

describe('SettingsFlow', () => {
  const account = {
    user: { id: 'joe', name: 'joe', email: 'joe@example.com', product: 'premium', image: null },
    playlists: COLUMNS.map((column) => ({
      columnId: column.id,
      name: column.playlistName,
      missing: false,
      url: 'https://open.spotify.com/playlist/x',
      albums: 0,
      tracks: 0,
    })),
    ready: true,
  };

  it('signs out when asked to disconnect', async () => {
    const onSignOut = vi.fn();
    const { impl } = stubFetch({ '/api/account': account });
    render(<SettingsFlow fetchImpl={impl} onSignOut={onSignOut} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('deletes the playlists and returns to setup', async () => {
    const { impl, calls } = stubFetch({ '/api/account': account });
    render(<SettingsFlow fetchImpl={impl} onSignOut={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete playlists' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete playlists' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete playlists' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/setup'));
    expect(calls.at(-1)).toMatchObject({ url: '/api/setup', method: 'DELETE' });
  });
});
