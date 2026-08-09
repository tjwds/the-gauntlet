import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlbumArt } from './AlbumArt';

describe('AlbumArt', () => {
  it('shows the artwork Spotify gave us', () => {
    render(<AlbumArt src="https://i.scdn.co/mid.jpg" alt="In Rainbows" />);
    const image = screen.getByRole('img', { name: 'In Rainbows' });
    expect(image).toHaveAttribute('src', 'https://i.scdn.co/mid.jpg');
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('is decorative by default, since the title sits beside it', () => {
    render(<AlbumArt src="https://i.scdn.co/mid.jpg" />);
    expect(screen.getByRole('presentation')).toBeInTheDocument();
  });

  it('falls back to a placeholder when an album has no art', () => {
    render(<AlbumArt src={null} />);
    expect(screen.getByTestId('album-art-placeholder')).toHaveClass('art-placeholder');
  });

  it('is a block, so its size holds outside a flex container', () => {
    // An inline span ignores width and height, which collapses the art to nothing.
    render(<AlbumArt src={null} />);
    expect(screen.getByTestId('album-art-placeholder')).toHaveClass('block');
  });

  it('takes a size from the caller', () => {
    render(<AlbumArt src={null} className="size-28" />);
    expect(screen.getByTestId('album-art-placeholder')).toHaveClass('size-28');
  });
});
