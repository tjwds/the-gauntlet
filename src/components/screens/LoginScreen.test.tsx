import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from './LoginScreen';
import { SCOPE_ROWS } from '@/lib/auth/scopes';

describe('LoginScreen', () => {
  it('links out to the method rather than explaining it', () => {
    // Nothing else in the product explains the rules; this link is the whole
    // onboarding for someone who arrives without context.
    render(<LoginScreen onSignIn={vi.fn()} />);
    const link = screen.getByRole('link', {
      name: "Joe's system for giving records a fair shake by listening to them five times",
    });
    expect(link).toHaveAttribute(
      'href',
      'https://blog.joewoods.dev/music/the-album-gauntlet-over-engineered-music-appreciation/',
    );
  });

  it('shows the six columns a record travels through', () => {
    render(<LoginScreen onSignIn={vi.fn()} />);
    for (const name of ['Queue', '×1', '×2', '×3', '×4', 'Done']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // Abandoned isn't part of the journey, so it isn't in the flow.
    expect(screen.queryByText('Abandoned')).not.toBeInTheDocument();
  });

  it('starts the handshake', async () => {
    const onSignIn = vi.fn();
    render(<LoginScreen onSignIn={onSignIn} />);
    await userEvent.click(screen.getByRole('button', { name: 'Log in with Spotify' }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it('says Premium is needed to play in the app, and what free accounts still get', () => {
    render(<LoginScreen onSignIn={vi.fn()} />);
    expect(
      screen.getByText(
        'Spotify Premium is required to play inside the app; free accounts can still use the board and open albums in the Spotify app.',
      ),
    ).toBeInTheDocument();
  });

  it('makes the no-database claim where the decision is being made', () => {
    render(<LoginScreen onSignIn={vi.fn()} />);
    expect(
      screen.getByText("We don't track any data about you; everything lives in Spotify."),
    ).toBeInTheDocument();
  });

  it('discloses every scope before the redirect, not after', async () => {
    render(<LoginScreen onSignIn={vi.fn()} />);
    await userEvent.click(screen.getByText('What access are we asking for?'));
    for (const row of SCOPE_ROWS) {
      expect(screen.getByText(row.scope)).toBeInTheDocument();
    }
    expect(screen.getByText('Credit listens that happened outside the app')).toBeInTheDocument();
  });

  it('explains a rejection from Spotify, since we cannot catch it beforehand', () => {
    render(<LoginScreen onSignIn={vi.fn()} error="Spotify wouldn't let that account in." />);
    expect(screen.getByRole('alert')).toHaveTextContent("Spotify wouldn't let that account in.");
  });

  it('shows no alert when nothing went wrong', () => {
    render(<LoginScreen onSignIn={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('points at the repo, which is where the quota policy is described', () => {
    render(<LoginScreen onSignIn={vi.fn()} repoUrl="https://example.com/repo" />);
    expect(screen.getByRole('link', { name: 'Open source on GitHub' })).toHaveAttribute(
      'href',
      'https://example.com/repo',
    );
  });
});
