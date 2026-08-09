'use client';

import { buttonVariants, Chip, cn } from '@heroui/react';
import { AlbumArt } from './AlbumArt';
import { t } from '@/lib/copy';
import type { ImportablePlaylist } from '@/lib/board/catalogue';

export interface PlaylistPickerProps {
  playlists: ImportablePlaylist[];
  onOpen(playlist: ImportablePlaylist): void;
}

/**
 * Pick a playlist to browse. Rows count tracks rather than albums: working out
 * how many albums a playlist would yield means reading every one of its tracks,
 * which for a listener with forty playlists is forty paged reads before this
 * list could render. The album count appears on the next screen, where one read
 * has already happened.
 */
export function PlaylistPicker({ playlists, onOpen }: PlaylistPickerProps) {
  return (
    <>
      <ul className="flex flex-col gap-0.5">
        {playlists.map((playlist) => (
          <li key={playlist.id}>
            <PlaylistRow playlist={playlist} onOpen={() => onOpen(playlist)} />
          </li>
        ))}
      </ul>

      <p className="mt-1.5 px-2 text-[13px] text-muted">{t('add.playlist.boardHidden')}</p>
    </>
  );
}

function PlaylistRow({
  playlist,
  onOpen,
}: {
  playlist: ImportablePlaylist;
  onOpen(): void;
}) {
  const meta = t('add.playlist.meta', {
    owner: playlist.ownedByMe ? t('add.playlist.owner.you') : playlist.ownerName,
    n: playlist.trackCount,
  });

  const body = (
    <>
      <AlbumArt src={playlist.imageUrl} className="size-12" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{playlist.name}</span>
        <span className="block truncate text-[13px] text-muted">{meta}</span>
      </span>
    </>
  );

  // Spotify's own algorithmic playlists can't be read at all, so the row is
  // shown dimmed and inert rather than dropped: Discover Weekly is the first
  // place someone looks, and an unexplained absence reads as a missing feature.
  if (playlist.unavailable) {
    return (
      <div className="flex items-center gap-3.5 rounded-xl p-2.5 opacity-50">
        {body}
        <Chip size="sm">{t('add.playlist.chip.unavailable')}</Chip>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3.5 rounded-xl p-2.5 text-left hover:bg-surface-secondary"
    >
      {body}
      {/* A span, not a button: the whole row is already the click target. */}
      <span className={cn(buttonVariants({ variant: 'tertiary', size: 'sm' }), 'pointer-events-none')}>
        {t('add.playlist.browse')}
      </span>
    </button>
  );
}
