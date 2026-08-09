import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddAlbumsModal } from './AddAlbumsModal';
import type { CatalogueAlbum, ImportablePlaylist } from '@/lib/board/catalogue';
import type { PlaylistTrackRow } from '@/lib/domain/playlistTracks';

function anAlbum(overrides: Partial<CatalogueAlbum> = {}): CatalogueAlbum {
  return {
    id: 'a1',
    name: 'Titanic Rising',
    uri: 'spotify:album:a1',
    artist: 'Weyes Blood',
    year: '2019',
    imageUrl: null,
    totalTracks: 10,
    durationMs: 42 * 60_000,
    albumType: 'album',
    onBoard: null,
    ...overrides,
  };
}

function aPlaylistRow(overrides: Partial<ImportablePlaylist> = {}): ImportablePlaylist {
  return {
    id: 'p1',
    name: 'Road trip',
    trackCount: 40,
    imageUrl: null,
    ownerName: 'joe',
    ownedByMe: true,
    unavailable: false,
    ...overrides,
  };
}

function aTrackRow(key: string, title: string, albumId: string, totalTracks: number): PlaylistTrackRow {
  return {
    key,
    kind: 'track',
    title,
    artist: 'Fiona Apple',
    album: { id: albumId, name: 'Fetch the Bolt Cutters', totalTracks, imageUrl: null },
    reason: null,
    onBoard: null,
  };
}

/** One playlist of two albums: 13 tracks and 8, so the footer totals 21. */
const PLAYLIST_TAB = {
  'source=playlists': { playlists: [aPlaylistRow()] },
  'source=playlist&id=p1': {
    tracks: [aTrackRow('0', 'Shameika', 'alb1', 13), aTrackRow('1', 'John L', 'alb2', 8)],
  },
};

/** A fetch that answers the catalogue endpoint and records what was asked. */
function stubFetch(payloads: Record<string, unknown>) {
  const urls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const key = Object.keys(payloads).find((candidate) => url.includes(candidate)) ?? '';
    const body = payloads[key] ?? { albums: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, urls };
}

function setup(payloads: Record<string, unknown> = {}, props: Partial<Parameters<typeof AddAlbumsModal>[0]> = {}) {
  const { impl, urls } = stubFetch(payloads);
  const onAdd = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AddAlbumsModal
      isOpen
      onOpenChange={onOpenChange}
      onAdd={onAdd}
      fetchCatalogue={impl}
      {...props}
    />,
  );
  return { onAdd, onOpenChange, urls };
}

describe('AddAlbumsModal', () => {
  it('searches Spotify for what was typed', async () => {
    const { urls } = setup({ 'q=weyes': { albums: [anAlbum()] } });
    await userEvent.type(screen.getByRole('textbox'), 'weyes');
    await waitFor(() => expect(screen.getByText('Titanic Rising')).toBeInTheDocument());
    expect(urls.some((url) => url.includes('q=weyes'))).toBe(true);
  });

  it('searches for nothing when the box is empty', () => {
    const { urls } = setup();
    expect(urls).toEqual([]);
  });

  it('describes a result the way the copy calls for', async () => {
    setup({ 'q=w': { albums: [anAlbum()] } });
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() =>
      expect(screen.getByText('Weyes Blood · 2019 · 10 tracks · 42m')).toBeInTheDocument(),
    );
  });

  it('says where an album already sits rather than offering to add it twice', async () => {
    // The playlist model can't represent one album in two columns.
    setup({ 'q=w': { albums: [anAlbum({ onBoard: 'x2' })] } });
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() => expect(screen.getByText('already on board · ×2')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '+ Queue' })).not.toBeInTheDocument();
  });

  it('counts what has been picked, and what it will cost the Queue', async () => {
    setup({ 'q=w': { albums: [anAlbum()] } });
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Queue' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '+ Queue' }));
    expect(screen.getByText('1 album selected')).toBeInTheDocument();
    expect(screen.getByText(/10 tracks will be appended to/)).toBeInTheDocument();
  });

  it('lets a pick be taken back', async () => {
    setup({ 'q=w': { albums: [anAlbum()] } });
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Queue' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '+ Queue' }));
    await userEvent.click(screen.getByRole('button', { name: '✓ Added' }));
    expect(screen.getByText('0 albums selected')).toBeInTheDocument();
  });

  it('adds what was picked and closes', async () => {
    const { onAdd, onOpenChange } = setup({ 'q=w': { albums: [anAlbum()] } });
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Queue' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '+ Queue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to Queue' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(['a1']));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('will not add nothing', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Add to Queue' })).toBeDisabled();
  });

  it('cancels without adding', async () => {
    const { onAdd, onOpenChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers saved albums', async () => {
    const { urls } = setup({ 'source=saved': { albums: [anAlbum({ name: 'Front Row Seat' })] } });
    await userEvent.click(screen.getByRole('tab', { name: /Saved albums/ }));
    await waitFor(() => expect(screen.getByText('Front Row Seat')).toBeInTheDocument());
    expect(urls.some((url) => url.includes('source=saved'))).toBe(true);
  });

  it('lists playlists to pick from, then the tracks of the one picked', async () => {
    setup(PLAYLIST_TAB);
    await userEvent.click(screen.getByRole('tab', { name: 'From a playlist' }));
    await waitFor(() => expect(screen.getByText('Road trip')).toBeInTheDocument());
    expect(screen.getByText('You · 40 tracks')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Road trip/ }));
    await waitFor(() => expect(screen.getByText('Shameika')).toBeInTheDocument());
    expect(screen.getByText('You · 40 tracks · 2 albums you could add')).toBeInTheDocument();
  });

  it('says nothing is selected on the picker, where nothing can be', async () => {
    setup(PLAYLIST_TAB);
    await userEvent.click(screen.getByRole('tab', { name: 'From a playlist' }));
    await waitFor(() => expect(screen.getByText('No albums selected')).toBeInTheDocument());
  });

  it('filters the playlists by name rather than searching Spotify', async () => {
    const { urls } = setup({
      'source=playlists': {
        playlists: [aPlaylistRow(), aPlaylistRow({ id: 'p2', name: 'Kitchen' })],
      },
    });
    await userEvent.click(screen.getByRole('tab', { name: 'From a playlist' }));
    await waitFor(() => expect(screen.getByText('Kitchen')).toBeInTheDocument());

    await userEvent.type(screen.getByRole('textbox'), 'kitch');
    expect(screen.queryByText('Road trip')).not.toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(urls.some((url) => url.includes('q=kitch'))).toBe(false);
  });

  it('ticks a track and adds the album it came from, whole', async () => {
    // The load-bearing call: the album's own tracklist, not the playlist's copy
    // of the ticked track.
    const { onAdd } = setup(PLAYLIST_TAB);
    await userEvent.click(screen.getByRole('tab', { name: 'From a playlist' }));
    await waitFor(() => expect(screen.getByText('Road trip')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Road trip/ }));
    await waitFor(() => expect(screen.getByText('Shameika')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('checkbox', { name: /^Shameika/ }));
    expect(screen.getByText('1 album selected')).toBeInTheDocument();
    expect(screen.getByText(/13 tracks will be appended to/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add to Queue' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(['alb1']));
  });

  it('takes the whole playlist in one go, and gives it back', async () => {
    setup(PLAYLIST_TAB);
    await userEvent.click(screen.getByRole('tab', { name: 'From a playlist' }));
    await waitFor(() => expect(screen.getByText('Road trip')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Road trip/ }));
    await waitFor(() => expect(screen.getByText('Shameika')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all 2 albums' }));
    expect(screen.getByText('2 albums selected')).toBeInTheDocument();
    expect(screen.getByText(/21 tracks will be appended to/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('0 albums selected')).toBeInTheDocument();
  });

  it('goes back to the picker without losing what was ticked', async () => {
    setup(PLAYLIST_TAB);
    await userEvent.click(screen.getByRole('tab', { name: 'From a playlist' }));
    await waitFor(() => expect(screen.getByText('Road trip')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Road trip/ }));
    await waitFor(() => expect(screen.getByText('Shameika')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /^Shameika/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Change playlist' }));
    await waitFor(() => expect(screen.getByText('Road trip')).toBeInTheDocument());
    // The picker footer reports the picker, not the count carried over.
    expect(screen.getByText('No albums selected')).toBeInTheDocument();
  });

  it('does not offer a pasted album link on the playlist tab', async () => {
    setup(PLAYLIST_TAB);
    await userEvent.click(screen.getByRole('tab', { name: 'From a playlist' }));
    await waitFor(() => expect(screen.getByText('Road trip')).toBeInTheDocument());
    expect(screen.queryByText('Paste a Spotify album link to add directly.')).not.toBeInTheDocument();
  });

  it('reports what Spotify refused', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 }),
    ) as unknown as typeof fetch;
    render(
      <AddAlbumsModal isOpen onOpenChange={vi.fn()} onAdd={vi.fn()} fetchCatalogue={impl} />,
    );
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() => expect(screen.getByText('Rate limited')).toBeInTheDocument());
  });

  it('reports a network that would not answer', async () => {
    const impl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    render(
      <AddAlbumsModal isOpen onOpenChange={vi.fn()} onAdd={vi.fn()} fetchCatalogue={impl} />,
    );
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() => expect(screen.getByText('Could not reach Spotify')).toBeInTheDocument());
  });

  it("uses the browser's own fetch when it is given none", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch({ 'q=w': { albums: [anAlbum()] } }).impl;
    render(<AddAlbumsModal isOpen onOpenChange={vi.fn()} onAdd={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() => expect(screen.getByText('Titanic Rising')).toBeInTheDocument());
    globalThis.fetch = original;
  });

  it('falls back to a plain message when a refusal says nothing', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 500 }),
    ) as unknown as typeof fetch;
    render(<AddAlbumsModal isOpen onOpenChange={vi.fn()} onAdd={vi.fn()} fetchCatalogue={impl} />);
    await userEvent.type(screen.getByRole('textbox'), 'w');
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
  });

  it('does nothing at all while closed', () => {
    const { urls } = setup({}, { isOpen: false });
    expect(urls).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mentions that a pasted link works', async () => {
    setup();
    expect(screen.getByText('Paste a Spotify album link to add directly.')).toBeInTheDocument();
  });
});
