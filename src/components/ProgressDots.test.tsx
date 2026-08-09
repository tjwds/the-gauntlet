import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressDots } from './ProgressDots';

describe('ProgressDots', () => {
  it('always draws five, however many are filled', () => {
    render(<ProgressDots listens={2} />);
    expect(screen.getAllByTestId('dot-on')).toHaveLength(2);
    expect(screen.getAllByTestId('dot-off')).toHaveLength(3);
  });

  it('labels the count', () => {
    render(<ProgressDots listens={3} />);
    expect(screen.getByText('3 of 5')).toBeInTheDocument();
  });

  it('reads the count out even when the label is hidden', () => {
    render(<ProgressDots listens={3} showLabel={false} />);
    expect(screen.queryByText('3 of 5')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '3 of 5' })).toBeInTheDocument();
  });

  it('takes a label of its own for the narrow board', () => {
    render(<ProgressDots listens={1} showLabel={false} label="playing · track 6 of 7" />);
    expect(screen.getByText('playing · track 6 of 7')).toBeInTheDocument();
  });

  it('draws five empty dots for a record with no listens', () => {
    render(<ProgressDots listens={0} />);
    expect(screen.queryAllByTestId('dot-on')).toHaveLength(0);
  });
});
