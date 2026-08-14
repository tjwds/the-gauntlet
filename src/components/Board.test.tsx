import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Board } from './Board';
import { aBoard, aCard } from '@/test/board';

const handlers = () => ({
  onOpen: vi.fn(),
  onPlay: vi.fn(),
  onMove: vi.fn(),
  onRemove: vi.fn(),
  onAddAlbums: vi.fn(),
});

describe('the wide board', () => {
  it('draws all seven columns under three bands', () => {
    render(<Board board={aBoard()} {...handlers()} />);
    for (const id of ['queue', 'x1', 'x2', 'x3', 'x4', 'done', 'abandoned']) {
      expect(screen.getByTestId(`column-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  it('puts each record in its own column', () => {
    const board = aBoard({
      queue: [aCard({ id: 'a1', name: 'Blue Rev' })],
      x3: [aCard({ id: 'a2', name: 'In Rainbows' })],
    });
    render(<Board board={board} {...handlers()} />);
    expect(within(screen.getByTestId('column-queue')).getByText('Blue Rev')).toBeInTheDocument();
    expect(within(screen.getByTestId('column-x3')).getByText('In Rainbows')).toBeInTheDocument();
  });

  it('offers to add albums from the foot of the Queue', async () => {
    const props = handlers();
    render(<Board board={aBoard()} {...props} />);
    const queue = within(screen.getByTestId('column-queue'));
    await userEvent.click(queue.getByRole('button', { name: '+ Add albums' }));
    expect(props.onAddAlbums).toHaveBeenCalled();
  });

  it('reassures in ×4 that you never file a card there yourself', () => {
    render(<Board board={aBoard()} {...handlers()} />);
    expect(within(screen.getByTestId('column-x4')).getByText('Nothing yet.')).toBeInTheDocument();
    expect(within(screen.getByTestId('column-x2')).getByText('Empty')).toBeInTheDocument();
  });

  it('files a card into the column it is dropped on', () => {
    const props = handlers();
    render(<Board board={aBoard({ x1: [aCard({ id: 'a1' })] })} {...props} />);

    fireEvent.dragStart(screen.getByTestId('board-card'));
    const target = screen.getByTestId('column-x3');
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(props.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), 'x3');
  });

  it('shows a card that has been dropped somewhere on its way there', () => {
    const board = aBoard({ x1: [aCard({ id: 'a1' })] });
    render(<Board board={board} movingTo={new Map([['a1', 'x3' as const]])} {...handlers()} />);
    // Still drawn in the column it is leaving, because that is where Spotify
    // still has it — with a spinner rather than nothing to show for the drop.
    const card = within(screen.getByTestId('column-x1')).getByTestId('board-card');
    expect(within(card).getByTestId('moving-spinner')).toBeInTheDocument();
    expect(within(card).getByText('moving to ×3…')).toBeInTheDocument();
  });

  it('does nothing when a drag ends outside a column', () => {
    const props = handlers();
    render(<Board board={aBoard({ x1: [aCard({ id: 'a1' })] })} {...props} />);
    const card = screen.getByTestId('board-card');
    fireEvent.dragStart(card);
    fireEvent.dragEnd(card);
    expect(props.onMove).not.toHaveBeenCalled();
  });
});

describe('the narrow board', () => {
  const board = aBoard({
    queue: [aCard({ id: 'q1', name: 'Blue Rev' })],
    x1: [aCard({ id: 'a1', name: 'Sunbather' })],
    x3: [aCard({ id: 'a3', name: 'In Rainbows' })],
    done: [aCard({ id: 'd1', name: 'Kid A' })],
    abandoned: [aCard({ id: 'ab1', name: 'Trout Mask Replica' })],
  });

  it('collapses seven columns into three', () => {
    render(<Board board={board} narrow {...handlers()} />);
    expect(screen.getByTestId('column-queue')).toBeInTheDocument();
    expect(screen.getByTestId('column-done')).toBeInTheDocument();
    expect(screen.queryByTestId('column-x3')).not.toBeInTheDocument();
    // Twice over: once as the band label, once as the merged column heading.
    expect(screen.getAllByText('In progress')).toHaveLength(2);
  });

  it('merges the four stages and sorts them by listens', () => {
    render(<Board board={board} narrow {...handlers()} />);
    const merged = screen.getByTestId('column-x1');
    const titles = within(merged)
      .getAllByTestId('board-card')
      .map((card) => card.getAttribute('data-album-id'));
    // ×3 outranks ×1: merging costs the spatial ordering, so listens replace it.
    expect(titles).toEqual(['a3', 'a1']);
  });

  it('states the sort, since a sort you cannot see is one you will not trust', () => {
    render(<Board board={board} narrow {...handlers()} />);
    expect(screen.getByText('Sorted by listens')).toBeInTheDocument();
  });

  it('tucks Abandoned under Done rather than giving it a column', async () => {
    render(<Board board={board} narrow {...handlers()} />);
    expect(screen.queryByTestId('column-abandoned')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Abandoned (1)'));
    expect(screen.getByText('Trout Mask Replica')).toBeInTheDocument();
  });

  it('leaves the Abandoned disclosure out when nothing has been dropped', () => {
    render(<Board board={aBoard({ done: [aCard({ id: 'd1' })] })} narrow {...handlers()} />);
    expect(screen.queryByText(/^Abandoned \(/)).not.toBeInTheDocument();
  });

  it('opens an abandoned record from the disclosure', async () => {
    const props = handlers();
    render(<Board board={board} narrow {...props} />);
    await userEvent.click(screen.getByText('Abandoned (1)'));
    await userEvent.click(screen.getByRole('button', { name: /Trout Mask Replica/ }));
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'ab1' }));
  });

  it('still offers to add albums', async () => {
    const props = handlers();
    render(<Board board={board} narrow {...props} />);
    await userEvent.click(
      within(screen.getByTestId('column-queue')).getByRole('button', { name: '+ Add albums' }),
    );
    expect(props.onAddAlbums).toHaveBeenCalled();
  });

  it('shows a card on its way in the merged column too', () => {
    render(
      <Board board={board} narrow movingTo={new Map([['a1', 'done' as const]])} {...handlers()} />,
    );
    const merged = within(screen.getByTestId('column-x1'));
    expect(merged.getByText('moving to Done…')).toBeInTheDocument();
    expect(merged.getByTestId('moving-spinner')).toBeInTheDocument();
  });

  it('files a dragged card into the merged column', () => {
    const props = handlers();
    render(<Board board={board} narrow {...props} />);
    fireEvent.dragStart(within(screen.getByTestId('column-queue')).getByTestId('board-card'));
    const target = screen.getByTestId('column-done');
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    expect(props.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }), 'done');
  });
});
