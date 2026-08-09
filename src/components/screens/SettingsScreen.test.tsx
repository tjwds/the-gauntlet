import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsScreen, type Account } from './SettingsScreen';
import { COLUMNS } from '@/lib/domain/columns';

const NOW = Date.parse('2026-07-10T12:00:00.000Z');

function anAccount(overrides: Partial<Account> = {}): Account {
  return {
    user: {
      id: 'joe',
      name: 'joe',
      email: 'joe@example.com',
      product: 'premium',
      image: null,
    },
    playlists: COLUMNS.map((column, index) => ({
      columnId: column.id,
      name: column.playlistName,
      missing: false,
      url: `https://open.spotify.com/playlist/pl-${column.id}`,
      albums: index === 0 ? 6 : 0,
      tracks: index === 0 ? 61 : 0,
    })),
    ready: true,
    ...overrides,
  };
}

function setup(account: Account = anAccount()) {
  const calls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(account), { status: 200 });
  }) as unknown as typeof fetch;

  const onDisconnect = vi.fn();
  const onDeletePlaylists = vi.fn();
  render(
    <SettingsScreen
      onDisconnect={onDisconnect}
      onDeletePlaylists={onDeletePlaylists}
      fetchImpl={impl}
      nowMs={NOW}
    />,
  );
  return { onDisconnect, onDeletePlaylists, calls };
}

describe('SettingsScreen', () => {
  it('names the account and its tier', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('joe · joe@example.com')).toBeInTheDocument());
    expect(screen.getByText('Premium · last sync just now')).toBeInTheDocument();
  });

  it('says Free for an account without Premium', async () => {
    setup(anAccount({ user: { ...anAccount().user, product: 'free' } }));
    await waitFor(() => expect(screen.getByText(/^Free ·/)).toBeInTheDocument());
  });

  it('drops the separator when Spotify gave no email', async () => {
    setup(anAccount({ user: { ...anAccount().user, email: null } }));
    await waitFor(() => expect(screen.getByText('joe')).toBeInTheDocument());
  });

  it('falls back to an initial for an account with no picture', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('j')).toBeInTheDocument());
  });

  it('shows the picture instead of an initial when there is one', async () => {
    setup(anAccount({ user: { ...anAccount().user, image: 'https://i.scdn.co/avatar.jpg' } }));
    await waitFor(() => expect(screen.getByText('joe · joe@example.com')).toBeInTheDocument());
    expect(screen.queryByText('j')).not.toBeInTheDocument();
  });

  it('copes with an account that has no name to take an initial from', async () => {
    setup(anAccount({ user: { ...anAccount().user, name: null, image: null } }));
    await waitFor(() => expect(screen.getByText('?')).toBeInTheDocument());
  });

  it('lists the seven playlists with what is in them', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('Gauntlet · Queue')).toBeInTheDocument());
    expect(screen.getByText('6 albums · 61 tracks')).toBeInTheDocument();
    expect(screen.getAllByText('empty')).toHaveLength(6);
  });

  it('links each playlist out to Spotify', async () => {
    setup();
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Open' })).toHaveLength(7));
  });

  it('flags a playlist that has gone missing, which is what a rename looks like', async () => {
    const account = anAccount();
    account.playlists = account.playlists.map((playlist, index) =>
      index === 2 ? { columnId: playlist.columnId, name: playlist.name, missing: true } : playlist,
    );
    setup(account);
    await waitFor(() => expect(screen.getByText('missing')).toBeInTheDocument());
  });

  it('re-reads the playlists on demand', async () => {
    const { calls } = setup();
    await waitFor(() => expect(calls).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'Re-scan playlists' }));
    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it('disconnects', async () => {
    const { onDisconnect } = setup();
    await waitFor(() => expect(screen.getByText('Disconnect Spotify')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('reconnects through the same handshake', async () => {
    const { onDisconnect } = setup();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onDisconnect).toHaveBeenCalled();
  });

  describe('deleting the playlists', () => {
    it('asks first, because it is irreversible', async () => {
      const { onDeletePlaylists } = setup();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Delete playlists' })).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete playlists' }));
      expect(onDeletePlaylists).not.toHaveBeenCalled();
      expect(screen.getByText(/removes all seven playlists/)).toBeInTheDocument();
    });

    it('goes ahead when confirmed', async () => {
      const { onDeletePlaylists } = setup();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Delete playlists' })).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete playlists' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete playlists' }));
      expect(onDeletePlaylists).toHaveBeenCalled();
    });

    it('backs out', async () => {
      const { onDeletePlaylists } = setup();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Delete playlists' })).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete playlists' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onDeletePlaylists).not.toHaveBeenCalled();
      expect(screen.queryByText(/removes all seven playlists/)).not.toBeInTheDocument();
    });
  });

  it('goes back to the board', async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '← Back to board' })).toHaveAttribute('href', '/'),
    );
  });

  it('waits rather than showing an empty page', () => {
    setup();
    expect(screen.getByLabelText('Loading settings')).toBeInTheDocument();
  });

  it("uses the browser's own fetch and clock when given neither", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify(anAccount()), { status: 200 }),
    ) as unknown as typeof fetch;
    render(<SettingsScreen onDisconnect={vi.fn()} onDeletePlaylists={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/^Premium ·/)).toBeInTheDocument());
    globalThis.fetch = original;
  });

  it('copes with a playlist row that carries no counts', async () => {
    const account = anAccount();
    account.playlists = account.playlists.map((playlist) => ({
      columnId: playlist.columnId,
      name: playlist.name,
      missing: false,
      url: playlist.url as string,
    }));
    setup(account);
    await waitFor(() => expect(screen.getAllByText('empty')).toHaveLength(7));
  });

  it('counts nothing where Spotify reported no album count', async () => {
    const account = anAccount();
    account.playlists = account.playlists.map((playlist) => ({
      columnId: playlist.columnId,
      name: playlist.name,
      missing: false,
      url: playlist.url as string,
      tracks: 9,
    }));
    setup(account);
    await waitFor(() => expect(screen.getAllByText('0 albums · 9 tracks')).toHaveLength(7));
  });

  it('leaves the Open link off a playlist with no URL', async () => {
    const account = anAccount();
    account.playlists = account.playlists.map((playlist) => ({
      columnId: playlist.columnId,
      name: playlist.name,
      missing: false,
      albums: 1,
      tracks: 9,
    }));
    setup(account);
    await waitFor(() => expect(screen.getAllByText('1 albums · 9 tracks')).toHaveLength(7));
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('lets the last-sync line get older while the page is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const impl = vi.fn(
      async () => new Response(JSON.stringify(anAccount()), { status: 200 }),
    ) as unknown as typeof fetch;
    render(<SettingsScreen onDisconnect={vi.fn()} onDeletePlaylists={vi.fn()} fetchImpl={impl} />);

    await vi.waitFor(() => expect(screen.getByText(/last sync just now/)).toBeInTheDocument());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(screen.getByText(/last sync 3 minutes ago/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('keeps waiting when the account read is refused', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }),
    ) as unknown as typeof fetch;
    render(
      <SettingsScreen onDisconnect={vi.fn()} onDeletePlaylists={vi.fn()} fetchImpl={impl} />,
    );
    await waitFor(() => expect(screen.getByLabelText('Loading settings')).toBeInTheDocument());
  });
});
