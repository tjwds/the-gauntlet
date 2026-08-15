import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemePicker } from './ThemePicker';
import { THEME_STORAGE_KEY } from '@/lib/ui/theme';

const root = () => document.documentElement;

afterEach(() => {
  localStorage.clear();
  root().className = '';
  root().removeAttribute('data-theme');
});

describe('ThemePicker', () => {
  it('offers the three, and follows the device until told otherwise', () => {
    render(<ThemePicker />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('writes the choice down where the next page load will find it', async () => {
    render(<ThemePicker />);

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(root()).toHaveAttribute('data-theme', 'dark');
    expect(root()).toHaveClass('dark');
  });

  it('goes back to following the device, and says so', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemePicker />);
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'System' }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    // jsdom reports no preference, which is the light one.
    expect(root()).toHaveAttribute('data-theme', 'light');
  });

  it('shows System for a stored value that is none of the three', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    render(<ThemePicker />);

    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('names the group, since its label is the row it sits in', () => {
    render(<ThemePicker />);
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName('Theme');
  });
});
