import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaylistTracks, type TrackSelection } from './PlaylistTracks';
import type { ImportablePlaylist } from '@/lib/board/catalogue';
import type { PlaylistTrackRow } from '@/lib/domain/playlistTracks';

const PLAYLIST: ImportablePlaylist = {
  id: 'p1',
  name: 'Long Drives',
  trackCount: 62,
  imageUrl: null,
  ownerName: 'joe',
  ownedByMe: true,
  unavailable: false,
};

/** A track row resolving to an album the board could take. */
function track(key: string, title: string, albumId: string, overrides: Partial<PlaylistTrackRow> = {}) {
  return {
    key,
    kind: 'track',
    title,
    artist: 'Fiona Apple',
    album: { id: albumId, name: 'Fetch the Bolt Cutters', totalTracks: 13, imageUrl: null },
    reason: null,
    onBoard: null,
    ...overrides,
  } as PlaylistTrackRow;
}

function setup(rows: PlaylistTrackRow[], selection: TrackSelection = new Map()) {
  const props = {
    onToggle: vi.fn(),
    onSelectAll: vi.fn(),
    onClear: vi.fn(),
    onChangePlaylist: vi.fn(),
  };
  render(<PlaylistTracks playlist={PLAYLIST} rows={rows} selection={selection} {...props} />);
  return props;
}

describe('PlaylistTracks', () => {
  it('names the playlist and how many albums it could yield', () => {
    setup([track('0', 'Shameika', 'a1'), track('1', 'John L', 'a2')]);
    expect(screen.getByText('Long Drives')).toBeInTheDocument();
    expect(screen.getByText('You · 62 tracks · 2 albums you could add')).toBeInTheDocument();
  });

  it('states that a tick takes the whole record', () => {
    setup([track('0', 'Shameika', 'a1')]);
    expect(
      screen.getByText('Ticking a track adds the album it came from — every track, in album order.'),
    ).toBeInTheDocument();
  });

  it("shows the album's own track count, not the playlist's copy of it", () => {
    setup([track('0', 'Shameika', 'a1')]);
    expect(screen.getByText('13 tracks')).toBeInTheDocument();
  });

  it('emphasises the album, since that is what gets added', () => {
    setup([track('0', 'Shameika', 'a1')]);
    expect(screen.getByText('Fiona Apple · from')).toBeInTheDocument();
    expect(screen.getByText('Fetch the Bolt Cutters')).toBeInTheDocument();
  });

  it('ticks the album the row came from', async () => {
    const row = track('0', 'Shameika', 'a1');
    const { onToggle } = setup([row]);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Shameika — Fetch the Bolt Cutters' }));
    expect(onToggle).toHaveBeenCalledWith(row);
  });

  it('marks a ticked row as adding the record', () => {
    setup([track('0', 'Shameika', 'a1')], new Map([['a1', { rowKey: '0' }]]));
    expect(screen.getByText('+13 tracks')).toBeInTheDocument();
  });

  it('says "same album" on a second track off a record already selected', async () => {
    // There is no second thing to choose, so the row reads as a consequence.
    const { onToggle } = setup(
      [track('0', 'Shameika', 'a1'), track('1', 'I Want You to Love Me', 'a1')],
      new Map([['a1', { rowKey: '0' }]]),
    );
    expect(screen.getByText('same album')).toBeInTheDocument();
    expect(screen.getByText('+13 tracks')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2); // the row plus select-all
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('wears the tick on the row that was clicked, not the first one', () => {
    setup(
      [track('0', 'Shameika', 'a1'), track('1', 'I Want You to Love Me', 'a1')],
      new Map([['a1', { rowKey: '1' }]]),
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('same album');
    expect(rows[1]).toHaveTextContent('+13 tracks');
  });

  it('falls back to the first row when the tick was made elsewhere', () => {
    // Otherwise a select-all, or a pick made on another playlist, would leave
    // every row of that album reading "same album" with none left to untick.
    setup([track('0', 'Shameika', 'a1'), track('1', 'I Want You to Love Me', 'a1')], new Map([['a1', {}]]));
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('+13 tracks');
    expect(rows[1]).toHaveTextContent('same album');
  });

  it('shows where an album already sits instead of a tick, undimmed', () => {
    setup([track('0', 'Nude', 'a1', { onBoard: 'x3' } as Partial<PlaylistTrackRow>)]);
    expect(screen.getByText('already on board · ×3')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Nude/ })).not.toBeInTheDocument();
  });

  it.each([
    ['single', { reason: 'single' }, 'single'],
    ['compilation', { reason: 'compilation' }, 'compilation'],
  ])('keeps a %s in place with a chip saying why', (_name, overrides, chip) => {
    setup([track('0', 'Nothing Matters', 'a1', overrides as Partial<PlaylistTrackRow>)]);
    expect(screen.getByText('Nothing Matters')).toBeInTheDocument();
    expect(screen.getByText(chip)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Nothing Matters/ })).not.toBeInTheDocument();
  });

  it('keeps a local file in place, with no artist to name', () => {
    setup([{ key: '0', kind: 'local', title: 'voice memo 04' }]);
    expect(screen.getByText('voice memo 04')).toBeInTheDocument();
    expect(screen.getByText('local file')).toBeInTheDocument();
    expect(screen.getByText('Added by you · not on Spotify')).toBeInTheDocument();
  });

  it('keeps a podcast episode in place, named by its show', () => {
    setup([{ key: '0', kind: 'episode', title: 'Weyes Blood — Titanic Rising', showName: 'Song Exploder' }]);
    expect(screen.getByText('episode')).toBeInTheDocument();
    expect(screen.getByText('Song Exploder')).toBeInTheDocument();
  });

  it('renders an episode with no show name', () => {
    setup([{ key: '0', kind: 'episode', title: 'Untitled', showName: null }]);
    expect(screen.getByText('episode')).toBeInTheDocument();
  });

  it('offers the whole playlist at once, counting only what it could add', async () => {
    const { onSelectAll } = setup([
      track('0', 'Shameika', 'a1'),
      track('1', 'John L', 'a2'),
      track('2', 'Nude', 'a3', { onBoard: 'x3' } as Partial<PlaylistTrackRow>),
      { key: '3', kind: 'episode', title: 'An episode', showName: null },
    ]);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all 2 albums' }));
    expect(onSelectAll).toHaveBeenCalledWith(['a1', 'a2']);
  });

  it('reads part-selected when only some albums are ticked', () => {
    setup([track('0', 'Shameika', 'a1'), track('1', 'John L', 'a2')], new Map([['a1', { rowKey: '0' }]]));
    const box = screen.getByRole('checkbox', { name: 'Select all 2 albums' }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(box).not.toBeChecked();
  });

  it('reads fully selected once every album is ticked', () => {
    setup(
      [track('0', 'Shameika', 'a1'), track('1', 'John L', 'a2')],
      new Map([
        ['a1', { rowKey: '0' }],
        ['a2', { rowKey: '1' }],
      ]),
    );
    expect(screen.getByRole('checkbox', { name: 'Select all 2 albums' })).toBeChecked();
  });

  it('clears the selection from the select-all box', async () => {
    const { onClear } = setup(
      [track('0', 'Shameika', 'a1')],
      new Map([['a1', { rowKey: '0' }]]),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all 1 albums' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('clears the selection from the Clear button', async () => {
    const { onClear } = setup([track('0', 'Shameika', 'a1')]);
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('goes back to the playlist picker', async () => {
    const { onChangePlaylist } = setup([track('0', 'Shameika', 'a1')]);
    await userEvent.click(screen.getByRole('button', { name: 'Change playlist' }));
    expect(onChangePlaylist).toHaveBeenCalled();
  });
});
