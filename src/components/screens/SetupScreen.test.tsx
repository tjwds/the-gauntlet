import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupScreen } from './SetupScreen';

describe('SetupScreen', () => {
  it('names all seven playlists it is about to create', () => {
    render(<SetupScreen userName="joe" onCreate={vi.fn()} />);
    for (const name of [
      'Gauntlet · Queue',
      'Gauntlet · ×1',
      'Gauntlet · ×2',
      'Gauntlet · ×3',
      'Gauntlet · ×4',
      'Gauntlet · Done',
      'Gauntlet · Abandoned',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('says whose account they go in', () => {
    render(<SetupScreen userName="joe" onCreate={vi.fn()} />);
    expect(screen.getByText('— 7 total, in your account joe')).toBeInTheDocument();
  });

  it('spells out what each column means in plays', () => {
    render(<SetupScreen userName="joe" onCreate={vi.fn()} />);
    expect(screen.getByText('0 plays')).toBeInTheDocument();
    expect(screen.getByText('1 play')).toBeInTheDocument();
    expect(screen.getByText('4 plays')).toBeInTheDocument();
    expect(screen.getByText('5 plays')).toBeInTheDocument();
    // Abandoned has no count, because it never meant one.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('warns against renaming, which really would orphan a column', () => {
    render(<SetupScreen userName="joe" onCreate={vi.fn()} />);
    expect(
      screen.getByText("Don't rename these, otherwise you'll lose your place!"),
    ).toBeInTheDocument();
  });

  it('links out to the method instead of restating the rules', () => {
    render(<SetupScreen userName="joe" onCreate={vi.fn()} learnMoreUrl="https://example.com/post" />);
    expect(screen.getByRole('link', { name: 'Learn more about The Album Gauntlet' })).toHaveAttribute(
      'href',
      'https://example.com/post',
    );
  });

  it('creates them private by default', async () => {
    const onCreate = vi.fn();
    render(<SetupScreen userName="joe" onCreate={onCreate} />);
    await userEvent.click(screen.getByRole('button', { name: "Let's go" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(true));
  });

  it('creates them public when the switch is turned off', async () => {
    const onCreate = vi.fn();
    render(<SetupScreen userName="joe" onCreate={onCreate} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }));
    await userEvent.click(screen.getByRole('button', { name: "Let's go" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(false));
  });

  it('says what Spotify refused, rather than moving on to a board that cannot exist', () => {
    render(
      <SetupScreen
        userName="joe"
        onCreate={vi.fn()}
        error="Spotify refused: insufficient client scope"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('insufficient client scope');
  });

  it('shows no alert when nothing has gone wrong', () => {
    render(<SetupScreen userName="joe" onCreate={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('waits out a slow creation rather than firing twice', async () => {
    let release: () => void = () => {};
    const onCreate = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    render(<SetupScreen userName="joe" onCreate={onCreate} />);

    await userEvent.click(screen.getByRole('button', { name: /Let's go/ }));
    // React Aria keeps a pending button focusable and marks it aria-disabled
    // rather than disabled, so the busy state is announced rather than silent.
    const button = screen.getByRole('button', { name: /Let's go/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(within(button).getByTestId('pending-spinner')).toBeInTheDocument();
    release();
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  });
});
