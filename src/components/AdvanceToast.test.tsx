import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvanceToast } from './AdvanceToast';
import { aCard } from '@/test/board';
import type { Advance } from '@/hooks/useBoard';

const advance: Advance = {
  album: aCard({ id: 'a1', name: 'Titanic Rising' }),
  from: 'x1',
  to: 'x2',
  listen: 2,
};

describe('AdvanceToast', () => {
  it('names the record, the listen and where it went', () => {
    render(<AdvanceToast advance={advance} onUndo={vi.fn()} />);
    expect(
      screen.getByText('Titanic Rising finished — 2nd listen. Moved to ×2.'),
    ).toBeInTheDocument();
  });

  it('reverses the move on undo', async () => {
    const onUndo = vi.fn();
    render(<AdvanceToast advance={advance} onUndo={onUndo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledWith(advance);
  });

  it('announces itself without stealing focus', () => {
    render(<AdvanceToast advance={advance} onUndo={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('says the fifth listen is the fifth', () => {
    render(
      <AdvanceToast advance={{ ...advance, to: 'done', listen: 5 }} onUndo={vi.fn()} />,
    );
    expect(screen.getByText(/5th listen\. Moved to Done\./)).toBeInTheDocument();
  });

  it('is nothing at all when no card has moved', () => {
    const { container } = render(<AdvanceToast advance={null} onUndo={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
