import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  it('carries the product name back to the board', () => {
    render(<AppHeader />);
    expect(screen.getByRole('link', { name: /The Gauntlet/ })).toHaveAttribute('href', '/');
  });

  it('links to Settings', () => {
    render(<AppHeader />);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('reports what was typed into the search box', async () => {
    const onQueryChange = vi.fn();
    render(<AppHeader onQueryChange={onQueryChange} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search the board' }), 'we');
    expect(onQueryChange).toHaveBeenLastCalledWith('e');
  });

  it('opens the add-albums modal', async () => {
    const onAddAlbums = vi.fn();
    render(<AppHeader onAddAlbums={onAddAlbums} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add albums' }));
    expect(onAddAlbums).toHaveBeenCalled();
  });

  it('leaves the add button out where there is nothing to add to', () => {
    render(<AppHeader />);
    expect(screen.queryByRole('button', { name: '+ Add albums' })).not.toBeInTheDocument();
  });

  it('marks Settings as where you already are', () => {
    render(<AppHeader settingsActive />);
    expect(screen.getByRole('link', { name: 'Settings' }).className).toContain('secondary');
  });

  it('shows who is signed in', () => {
    render(<AppHeader user={{ name: 'joe', image: 'https://i.scdn.co/avatar.jpg' }} />);
    expect(screen.getByText('joe')).toBeInTheDocument();
  });

  it('falls back to an initial when an account has no picture', () => {
    render(<AppHeader user={{ name: 'joe', image: null }} />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('copes with an account that has no name either', () => {
    render(<AppHeader user={{ name: null, image: null }} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
