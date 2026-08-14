import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardCard } from './BoardCard';
import { aCard, tracksOf } from '@/test/board';
import type { BoardCard as BoardCardModel } from '@/lib/domain/board';

function setup(album: BoardCardModel = aCard(), props: Partial<Parameters<typeof BoardCard>[0]> = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onPlay: vi.fn(),
    onMove: vi.fn(),
    onRemove: vi.fn(),
  };
  render(<BoardCard album={album} {...handlers} {...props} />);
  return handlers;
}

describe('BoardCard', () => {
  it('names the record and who made it', () => {
    setup();
    expect(screen.getByText('In Rainbows')).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
  });

  it('opens the drawer when the body is clicked', async () => {
    const handlers = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Open In Rainbows' }));
    expect(handlers.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'alb1' }));
  });

  it('starts the record from the play button without opening anything', async () => {
    const handlers = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Play album' }));
    expect(handlers.onPlay).toHaveBeenCalled();
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });

  it('shows the listens banked', () => {
    setup(aCard({ columnId: 'x3', listens: 3 }));
    expect(screen.getByText('3 of 5')).toBeInTheDocument();
  });

  it('leaves the dots off an untouched record in the Queue', () => {
    setup(aCard({ columnId: 'queue', listens: 0 }));
    expect(screen.queryByText(/of 5/)).not.toBeInTheDocument();
  });

  it('shows the pass underway, and only then', () => {
    setup(aCard({ inFlight: { tracksDone: 4, total: 13 } }));
    expect(screen.getByText('4 / 13')).toBeInTheDocument();
  });

  it('drops the pass row when no pass is underway', () => {
    setup(aCard({ inFlight: null }));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  describe('while it is playing', () => {
    const playing = { trackNumber: 6, totalTracks: 7, msLeft: 12 * 60_000 };

    it('swaps the play button for a level meter', () => {
      setup(aCard(), { playing: true, nowPlaying: playing });
      expect(screen.queryByRole('button', { name: 'Play album' })).not.toBeInTheDocument();
    });

    it('reports position in the record, not in the track', () => {
      setup(aCard(), { playing: true, nowPlaying: playing });
      expect(screen.getByText('track 6 of 7 · 12m left')).toBeInTheDocument();
    });
  });

  it('marks a card that just moved', () => {
    setup(aCard(), { justMoved: true });
    expect(screen.getByText('moved just now')).toBeInTheDocument();
  });

  describe('while a move it was asked to make is being written', () => {
    it('spins over the art and names where the record is going', () => {
      setup(aCard({ columnId: 'x1' }), { movingTo: 'x3' });
      expect(screen.getByTestId('moving-spinner')).toBeInTheDocument();
      expect(screen.getByText('moving to ×3…')).toBeInTheDocument();
    });

    it('marks the card busy', () => {
      setup(aCard({ columnId: 'x1' }), { movingTo: 'done' });
      expect(screen.getByTestId('board-card')).toHaveAttribute('aria-busy', 'true');
    });

    it('says nothing of the sort when the record is where it belongs', () => {
      setup();
      expect(screen.queryByTestId('moving-spinner')).not.toBeInTheDocument();
      expect(screen.getByTestId('board-card')).toHaveAttribute('aria-busy', 'false');
    });

    it('takes the play button off the art the spinner is over', () => {
      setup(aCard(), { movingTo: 'x4' });
      expect(screen.queryByRole('button', { name: 'Play album' })).not.toBeInTheDocument();
    });

    it('is not a card to pick up and drop somewhere else', () => {
      setup(aCard(), { movingTo: 'x4', onDragStart: vi.fn() });
      expect(screen.getByTestId('board-card')).toHaveAttribute('draggable', 'false');
    });

    it('replaces the chip of the move before it, which is no longer the news', () => {
      setup(aCard(), { justMoved: true, movingTo: 'abandoned' });
      expect(screen.getByText('moving to Abandoned…')).toBeInTheDocument();
      expect(screen.queryByText('moved just now')).not.toBeInTheDocument();
    });
  });

  it('puts the column on a chip on the narrow board, where position cannot say it', () => {
    setup(aCard({ columnId: 'x3', listens: 3 }), { narrow: true });
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('shows the pass in the label rather than a bar when narrow', () => {
    setup(aCard({ columnId: 'x1', listens: 1, inFlight: { tracksDone: 4, total: 13 } }), {
      narrow: true,
    });
    expect(screen.getByText('Listen #2 · 4/13')).toBeInTheDocument();
    expect(screen.queryByText('4 / 13')).not.toBeInTheDocument();
  });

  describe('the overflow menu', () => {
    it('offers play, the moves, and a way out to Spotify', async () => {
      setup();
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      expect(screen.getByRole('menuitem', { name: 'Play album' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Abandon' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Remove from board' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Open in Spotify' })).toBeInTheDocument();
    });

    it('plays from the menu', async () => {
      const handlers = setup();
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Play album' }));
      expect(handlers.onPlay).toHaveBeenCalled();
    });

    it('abandons from the menu', async () => {
      const handlers = setup();
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Abandon' }));
      expect(handlers.onMove).toHaveBeenCalledWith(expect.anything(), 'abandoned');
    });

    it('removes from the menu', async () => {
      const handlers = setup();
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from board' }));
      expect(handlers.onRemove).toHaveBeenCalled();
    });

    it('offers to advance a record that still has somewhere to go', async () => {
      setup(aCard({ columnId: 'x2' }));
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      expect(screen.getByRole('menuitem', { name: 'Advance to next column' })).toBeInTheDocument();
    });

    it('does not offer to advance a record that is already Done', async () => {
      setup(aCard({ columnId: 'done' }));
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      expect(
        screen.queryByRole('menuitem', { name: 'Advance to next column' }),
      ).not.toBeInTheDocument();
    });

    it('sends an advance straight to Done from the menu', async () => {
      const handlers = setup(aCard({ columnId: 'x2' }));
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Advance to next column' }));
      expect(handlers.onMove).toHaveBeenCalledWith(expect.anything(), 'done');
    });

    it('opens the album in Spotify in a new tab', async () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      setup();
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Open in Spotify' }));
      expect(open).toHaveBeenCalledWith(
        'https://open.spotify.com/album/alb1',
        '_blank',
        'noopener',
      );
      open.mockRestore();
    });

    it('offers every column but the one the record is already in', async () => {
      const handlers = setup(aCard({ columnId: 'x3' }));
      await userEvent.click(screen.getByRole('button', { name: 'More' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Move to ▾' }));
      expect(screen.queryByRole('menuitem', { name: '×3' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('menuitem', { name: 'Queue' }));
      expect(handlers.onMove).toHaveBeenCalledWith(expect.anything(), 'queue');
    });
  });

  describe('dragging', () => {
    it('is draggable only when the board offers it', () => {
      setup();
      expect(screen.getByTestId('board-card')).not.toHaveAttribute('draggable', 'true');
    });

    it('reports the card being dragged', () => {
      const onDragStart = vi.fn();
      const onDragEnd = vi.fn();
      setup(aCard(), { onDragStart, onDragEnd });
      const card = screen.getByTestId('board-card');
      expect(card).toHaveAttribute('draggable', 'true');
      fireEvent.dragStart(card);
      expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'alb1' }));
      fireEvent.dragEnd(card);
      expect(onDragEnd).toHaveBeenCalled();
    });
  });

  it('shows no listen count in Abandoned, where it never meant anything', () => {
    setup(aCard({ columnId: 'abandoned', listens: null }));
    expect(screen.queryByText(/of 5/)).not.toBeInTheDocument();
    expect(screen.getByText(/^dropped/)).toBeInTheDocument();
  });

  it('copes with a record whose art Spotify has none of', () => {
    setup(aCard({ imageUrl: null, tracks: tracksOf('alb1', 2) }));
    expect(screen.getByTestId('album-art-placeholder')).toBeInTheDocument();
  });
});
