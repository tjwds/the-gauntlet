import { cn } from '@heroui/react';

export interface AlbumArtProps {
  src: string | null;
  alt?: string;
  className?: string;
}

/**
 * Album art, or the crossed placeholder box when Spotify has none. Served
 * straight from Spotify's CDN at the size they already offer, rather than
 * proxied and re-encoded on the way through.
 */
export function AlbumArt({ src, alt = '', className }: AlbumArtProps) {
  // `block` matters: the placeholder is a span, and an inline element ignores
  // width and height outside a flex container, collapsing the art to nothing.
  const shape = cn('block shrink-0 rounded-lg object-cover', className);

  if (!src) {
    return (
      <span
        data-testid="album-art-placeholder"
        aria-hidden="true"
        className={cn(shape, 'art-placeholder')}
      />
    );
  }

  return <img src={src} alt={alt} loading="lazy" decoding="async" className={shape} />;
}
