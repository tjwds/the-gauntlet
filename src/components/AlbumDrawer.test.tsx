import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumDrawer } from './AlbumDrawer';
import { aCard, tracksOf } from '@/test/board';
import type { BoardCard } from '@/lib/domain/board';

function setup(album: BoardCard | null = aCard(), props: Partial<Parameters<typeof AlbumDrawer>[0]> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onPlay: vi.fn(),
    onMove: vi.fn(),
    onRemove: vi.fn(),
  };
  render(<AlbumDrawer album={album} isOpen {...handlers} {...props} />);
  return handlers;
}

describe('AlbumDrawer', () => {
  it('names the record, the artist and the runtime', () => {
    setup(aCard({ tracks: tracksOf('alb1', 10, 254_400) }));
    expect(screen.getByRole('heading', { name: 'In Rainbows' })).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('2007 · 10 tracks · 42:24')).toBeInTheDocument();
  });

  it('says which column the record is in', () => {
    setup(aCard({ columnId: 'x3' }));
    expect(screen.getByText('in ×3')).toBeInTheDocument();
  });

  it('states the listens banked', () => {
    setup(aCard({ listens: 3 }));
    expect(screen.getByText('3 complete listens.')).toBeInTheDocument();
  });

  it('shows which pass is underway and how far in', () => {
    setup(aCard({ listens: 3, inFlight: { tracksDone: 4, total: 10 } }));
    expect(screen.getByText('On listen #4')).toBeInTheDocument();
    expect(screen.getByText('4 / 10 tracks')).toBeInTheDocument();
  });

  it('leaves the progress row out when no pass is underway', () => {
    setup(aCard({ inFlight: null }));
    expect(screen.queryByText(/On listen/)).not.toBeInTheDocument();
  });

  it('ticks the tracks heard this pass and no others', () => {
    // A position marker, not a checklist: the rule is album order with no skips,
    // so everything above the line is done and everything below is still owed.
    setup(aCard({ tracks: tracksOf('alb1', 10), inFlight: { tracksDone: 4, total: 10 } }));
    expect(screen.getAllByTestId('track-heard')).toHaveLength(4);
    expect(screen.getAllByTestId('track-pending')).toHaveLength(6);
  });

  it('resets the ticks when nothing is underway', () => {
    setup(aCard({ tracks: tracksOf('alb1', 10), inFlight: null }));
    expect(screen.queryAllByTestId('track-heard')).toHaveLength(0);
  });

  it('gives the one line of history Spotify can actually tell us', () => {
    setup(aCard({ columnId: 'x3', addedAt: '2026-07-06T09:00:00.000Z' }));
    expect(screen.getByText('In ×3 since 6 July.')).toBeInTheDocument();
  });

  it('starts the record from track one', async () => {
    const handlers = setup();
    await userEvent.click(screen.getByRole('button', { name: /Play album/ }));
    expect(handlers.onPlay).toHaveBeenCalled();
  });

  it('offers Spotify instead of playback on a free account', () => {
    setup(aCard(), { canPlayInApp: false });
    expect(screen.queryByRole('button', { name: /Play album/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/alb1',
    );
  });

  describe('the manual actions', () => {
    it('advances a column without playback, for a listen on vinyl', async () => {
      const handlers = setup(aCard({ columnId: 'x2' }));
      await userEvent.click(screen.getByRole('button', { name: 'Advance to next column' }));
      expect(handlers.onMove).toHaveBeenCalledWith(expect.anything(), 'x3');
      expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('offers no advance from a terminal column', () => {
      setup(aCard({ columnId: 'done' }));
      expect(
        screen.queryByRole('button', { name: 'Advance to next column' }),
      ).not.toBeInTheDocument();
    });

    it('abandons a record', async () => {
      const handlers = setup(aCard({ columnId: 'x1' }));
      await userEvent.click(screen.getByRole('button', { name: 'Abandon' }));
      expect(handlers.onMove).toHaveBeenCalledWith(expect.anything(), 'abandoned');
    });

    it('offers no abandon to a record already abandoned', () => {
      setup(aCard({ columnId: 'abandoned' }));
      expect(screen.queryByRole('button', { name: 'Abandon' })).not.toBeInTheDocument();
    });

    it('takes a record off the board', async () => {
      const handlers = setup();
      await userEvent.click(screen.getByRole('button', { name: 'Remove from board' }));
      expect(handlers.onRemove).toHaveBeenCalled();
    });

    it('moves to a named column, which is dragging for the keyboard', async () => {
      const handlers = setup(aCard({ columnId: 'x3' }));
      await userEvent.click(screen.getByRole('button', { name: 'Move to ▾' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Queue' }));
      expect(handlers.onMove).toHaveBeenCalledWith(expect.anything(), 'queue');
    });
  });

  it('closes on the ✕', async () => {
    const handlers = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    const handlers = setup();
    await userEvent.keyboard('{Escape}');
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows no listens for an abandoned record, which never banked a count', () => {
    setup(aCard({ columnId: 'abandoned', listens: null }));
    expect(screen.getByText('0 complete listens.')).toBeInTheDocument();
  });

  it('does not divide by a record with no tracks on it', () => {
    setup(aCard({ tracks: [], inFlight: { tracksDone: 0, total: 0 } }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows nothing when no album is open', () => {
    setup(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
