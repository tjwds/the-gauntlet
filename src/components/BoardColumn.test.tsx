import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardColumn } from './BoardColumn';
import { aCard } from '@/test/board';
import { getColumn } from '@/lib/domain/columns';

const handlers = () => ({
  onOpen: vi.fn(),
  onPlay: vi.fn(),
  onMove: vi.fn(),
  onRemove: vi.fn(),
});

const column = (id: Parameters<typeof getColumn>[0], albums = [aCard()]) => ({
  ...getColumn(id),
  albums: albums.map((album) => ({ ...album, columnId: id })),
});

describe('BoardColumn', () => {
  it('heads the column with its name and how many are in it', () => {
    render(<BoardColumn column={column('x3', [aCard(), aCard({ id: 'alb2' })])} {...handlers()} />);
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('takes a heading of its own for the merged narrow column', () => {
    render(
      <BoardColumn
        column={column('x1', [])}
        heading="In progress"
        subheading="Sorted by listens"
        {...handlers()}
      />,
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Sorted by listens')).toBeInTheDocument();
  });

  it('says nothing is here yet when the column is empty', () => {
    render(<BoardColumn column={column('x4', [])} {...handlers()} />);
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
  });

  it('takes a shorter empty state where there is less room', () => {
    render(<BoardColumn column={column('x4', [])} emptyLabel="Empty" {...handlers()} />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('renders whatever footer the board gives it', () => {
    render(
      <BoardColumn column={column('queue', [])} footer={<button>+ Add albums</button>} {...handlers()} />,
    );
    expect(screen.getByRole('button', { name: '+ Add albums' })).toBeInTheDocument();
  });

  it('marks the card that is playing', () => {
    render(
      <BoardColumn
        column={column('x1')}
        playingAlbumId="alb1"
        nowPlaying={{ trackNumber: 2, totalTracks: 5, msLeft: 60_000 }}
        {...handlers()}
      />,
    );
    expect(screen.getByText('track 2 of 5 · 1m left')).toBeInTheDocument();
  });

  it('marks a card that just moved', () => {
    render(
      <BoardColumn column={column('x2')} justMovedIds={new Set(['alb1'])} {...handlers()} />,
    );
    expect(screen.getByText('moved just now')).toBeInTheDocument();
  });

  describe('as a drop target', () => {
    it('offers a slot for a card dragged in from elsewhere', () => {
      render(
        <BoardColumn
          column={column('x2', [])}
          draggingAlbum={aCard({ columnId: 'x1', name: 'Titanic Rising' })}
          {...handlers()}
        />,
      );
      expect(screen.getByTestId('drop-slot-x2')).toBeInTheDocument();
      expect(screen.getByText('Titanic Rising → ×2')).toBeInTheDocument();
    });

    it('offers no slot to a card already in this column', () => {
      render(
        <BoardColumn
          column={column('x2', [])}
          draggingAlbum={aCard({ columnId: 'x2' })}
          {...handlers()}
        />,
      );
      expect(screen.queryByTestId('drop-slot-x2')).not.toBeInTheDocument();
    });

    it('files the card where it was dropped', () => {
      const onDropInto = vi.fn();
      render(
        <BoardColumn
          column={column('x2', [])}
          draggingAlbum={aCard({ columnId: 'x1' })}
          onDropInto={onDropInto}
          {...handlers()}
        />,
      );
      const target = screen.getByTestId('column-x2');
      fireEvent.dragOver(target);
      fireEvent.drop(target);
      expect(onDropInto).toHaveBeenCalledWith('x2');
    });

    it('does not accept a drag when nothing is in hand', () => {
      render(<BoardColumn column={column('x2', [])} {...handlers()} />);
      const event = new Event('dragover', { bubbles: true, cancelable: true });
      fireEvent(screen.getByTestId('column-x2'), event);
      expect(event.defaultPrevented).toBe(false);
    });

    it('ignores a drop when nothing is being dragged', () => {
      const onDropInto = vi.fn();
      render(<BoardColumn column={column('x2', [])} onDropInto={onDropInto} {...handlers()} />);
      fireEvent.drop(screen.getByTestId('column-x2'));
      expect(onDropInto).not.toHaveBeenCalled();
    });
  });

  it('passes clicks on its cards back up', async () => {
    const props = handlers();
    render(<BoardColumn column={column('x3')} {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open In Rainbows' }));
    expect(props.onOpen).toHaveBeenCalled();
  });
});
