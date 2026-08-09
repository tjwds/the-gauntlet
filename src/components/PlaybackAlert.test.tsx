import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaybackAlert } from './PlaybackAlert';

describe('PlaybackAlert', () => {
  it('says what went wrong', () => {
    render(<PlaybackAlert message="Nothing to play on." onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing to play on.');
  });

  it('can be dismissed', async () => {
    const onDismiss = vi.fn();
    render(<PlaybackAlert message="Nothing to play on." onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('is nothing at all while playback is behaving', () => {
    const { container } = render(<PlaybackAlert message={null} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
