import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PassProgress } from './PassProgress';

describe('PassProgress', () => {
  it('shows how far into the pass, unlabelled, because the row only exists mid-pass', () => {
    render(<PassProgress pass={{ tracksDone: 4, total: 13 }} />);
    expect(screen.getByText('4 / 13')).toBeInTheDocument();
  });

  it('describes itself to a screen reader, where the bare numbers would not read', () => {
    render(<PassProgress pass={{ tracksDone: 4, total: 13 }} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(
      'Pass progress: 4 of 13 tracks',
    );
  });

  it('does not divide by an album with no tracks', () => {
    render(<PassProgress pass={{ tracksDone: 0, total: 0 }} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
