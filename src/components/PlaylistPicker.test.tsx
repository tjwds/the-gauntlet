import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaylistPicker } from './PlaylistPicker';
import type { ImportablePlaylist } from '@/lib/board/catalogue';

function aPlaylist(overrides: Partial<ImportablePlaylist> = {}): ImportablePlaylist {
  return {
    id: 'p1',
    name: 'Long Drives',
    trackCount: 62,
    imageUrl: null,
    ownerName: 'joe',
    ownedByMe: true,
    unavailable: false,
    ...overrides,
  };
}

function setup(playlists: ImportablePlaylist[]) {
  const onOpen = vi.fn();
  render(<PlaylistPicker playlists={playlists} onOpen={onOpen} />);
  return { onOpen };
}

describe('PlaylistPicker', () => {
  it('counts tracks rather than albums, which /me/playlists never reports', () => {
    setup([aPlaylist()]);
    expect(screen.getByText('You · 62 tracks')).toBeInTheDocument();
  });

  it("names someone else's playlist by its owner", () => {
    setup([aPlaylist({ ownedByMe: false, ownerName: 'joe', trackCount: 41 })]);
    expect(screen.getByText('joe · 41 tracks')).toBeInTheDocument();
  });

  it('opens the playlist that was picked', async () => {
    const playlist = aPlaylist();
    const { onOpen } = setup([playlist]);
    await userEvent.click(screen.getByRole('button', { name: /Long Drives/ }));
    expect(onOpen).toHaveBeenCalledWith(playlist);
  });

  it("shows Spotify's own playlists unavailable rather than hiding them", async () => {
    // An unexplained absence reads as a missing feature, and Discover Weekly is
    // the first place someone will look.
    const { onOpen } = setup([
      aPlaylist({ name: 'Discover Weekly', ownedByMe: false, ownerName: 'Spotify', unavailable: true }),
    ]);
    expect(screen.getByText('Discover Weekly')).toBeInTheDocument();
    expect(screen.getByText("Spotify's own · can't be read")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discover Weekly/ })).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('says the board playlists are missing on purpose', () => {
    setup([]);
    expect(screen.getByText("Your seven Gauntlet playlists aren't listed.")).toBeInTheDocument();
  });
});
