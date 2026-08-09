import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingButton } from './PendingButton';

describe('PendingButton', () => {
  it('is an ordinary button when there is nothing in flight', async () => {
    const onPress = vi.fn();
    render(<PendingButton onPress={onPress}>Let&apos;s go</PendingButton>);

    expect(screen.queryByTestId('pending-spinner')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows a spinner while working, and keeps the label', () => {
    render(<PendingButton isPending>Let&apos;s go</PendingButton>);
    expect(screen.getByTestId('pending-spinner')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent("Let's go");
  });

  it('refuses a second press while working', async () => {
    const onPress = vi.fn();
    render(
      <PendingButton isPending onPress={onPress}>
        Let&apos;s go
      </PendingButton>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('announces the busy state rather than just going dead', () => {
    // aria-disabled rather than disabled, so the button keeps focus and a
    // screen reader is told why the press did nothing.
    render(<PendingButton isPending>Let&apos;s go</PendingButton>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('data-pending', 'true');
    expect(button).not.toBeDisabled();
  });

  it('can still be disabled outright, for a button with nothing to submit', async () => {
    const onPress = vi.fn();
    render(
      <PendingButton isDisabled onPress={onPress}>
        Add to Queue
      </PendingButton>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.click(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('passes the HeroUI variants through', () => {
    render(
      <PendingButton variant="primary" size="lg">
        Go
      </PendingButton>,
    );
    expect(screen.getByRole('button').className).toContain('button--primary');
    expect(screen.getByRole('button').className).toContain('button--lg');
  });
});
