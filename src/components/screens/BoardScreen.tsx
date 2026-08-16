'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner, useMediaQuery } from '@heroui/react';
import { AppHeader } from '../AppHeader';
import { Board } from '../Board';
import { AlbumDrawer } from '../AlbumDrawer';
import { AddAlbumsModal } from '../AddAlbumsModal';
import { AdvanceToast } from '../AdvanceToast';
import { PlaybackAlert } from '../PlaybackAlert';
import { Playbar } from '../Playbar';
import { t } from '@/lib/copy';
import { useBoard } from '@/hooks/useBoard';
import { usePlayer } from '@/hooks/usePlayer';
import type { Board as BoardModel, BoardCard } from '@/lib/domain/board';
import { findCard } from '@/lib/domain/board';
import { msLeftInAlbum } from '@/lib/ui/card';

export interface BoardScreenProps {
  user?: { name: string | null; image: string | null } | null;
  /** Free accounts get the board plus an "Open in Spotify" path, not playback. */
  canPlayInApp?: boolean;
  fetchImpl?: typeof fetch;
}

export function BoardScreen({ user = null, canPlayInApp = true, fetchImpl }: BoardScreenProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [queueing, setQueueing] = useState(false);

  const board = useBoard({
    ...(fetchImpl ? { fetchImpl } : {}),
    onSetupRequired: () => router.push('/setup'),
  });

  const player = usePlayer({
    ...(fetchImpl ? { fetchImpl } : {}),
    enabled: canPlayInApp,
    // A finished pass shows up as a move on the next board read, so the music
    // moving on is the cue to look again — and only that. Refreshing on every
    // poll re-reads the whole board twelve times a minute.
    onPlaybackChange: () => void board.refresh(),
  });

  // initializeWithValue: false keeps the first client render identical to the
  // server's, which is what stops a narrow screen hydrating into a mismatch.
  // The layout effect corrects it on the same tick.
  const narrow = useMediaQuery('(max-width: 900px)', {
    defaultValue: false,
    initializeWithValue: false,
  });

  const filtered = useMemo(
    () => (board.board ? filterBoard(board.board, query) : null),
    [board.board, query],
  );

  const playingAlbumId = player.state.albumId;
  const playingCard = board.board && playingAlbumId ? findCard(board.board, playingAlbumId) : null;
  const playingTrack = player.state.track;

  /**
   * Whether the record itself is on, rather than one of its tracks reached
   * through a playlist, a radio or a search. Only then does the rest of the
   * record follow the track — which is what makes "track 6 of 9 · 24m left" a
   * fact about what is about to be heard rather than a guess.
   */
  const onTheRecord = playingAlbumId !== null && player.state.albumContextId === playingAlbumId;

  const nowPlaying =
    onTheRecord && playingCard && playingTrack?.id
      ? {
          trackNumber: playingCard.tracks.findIndex((track) => track.id === playingTrack.id) + 1,
          totalTracks: playingCard.tracks.length,
          msLeft: msLeftInAlbum(playingCard, playingTrack.id, player.state.progressMs),
        }
      : null;

  /**
   * The record playing, when the board has been read and none of the seven
   * playlists holds it. Asking the board rather than remembering the click is
   * what makes the button disappear once the record is filed — and come back if
   * it is taken off the board again.
   */
  const queueablePlayingId =
    board.board !== null && playingAlbumId !== null && playingCard === null ? playingAlbumId : null;

  const openAlbum = board.board && openAlbumId ? findCard(board.board, openAlbumId) : null;

  const queuePlaying = async (albumId: string) => {
    setQueueing(true);
    await board.addAlbums([albumId]);
    setQueueing(false);
  };

  const play = (album: BoardCard) => {
    if (!canPlayInApp) {
      window.open(`https://open.spotify.com/album/${album.id}`, '_blank', 'noopener');
      return;
    }
    void player.playAlbum(album.uri);
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader
        user={user}
        query={query}
        onQueryChange={setQuery}
        onAddAlbums={() => setAddOpen(true)}
      />

      <PlaybackAlert message={player.error} onDismiss={player.dismissError} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {board.loading && (
          <div className="grid flex-1 place-items-center gap-3">
            <Spinner aria-label="Loading the board" />
            {/* Everything is derived at read time, so a large library is a real
                wait. Saying what is happening beats an unexplained spinner. */}
            <p className="text-[13px] text-muted">{t('board.loading')}</p>
          </div>
        )}

        {board.error && !board.loading && (
          <div className="grid flex-1 place-items-center px-5">
            <p role="alert" className="text-[13px] text-danger">
              {board.error}
            </p>
          </div>
        )}

        {filtered && !board.loading && (
          <Board
            board={filtered}
            narrow={narrow}
            playingAlbumId={playingAlbumId}
            nowPlaying={nowPlaying}
            justMovedIds={board.justMovedIds}
            movingTo={board.movingTo}
            onOpen={(album) => setOpenAlbumId(album.id)}
            onPlay={play}
            onMove={(album, to) => void board.move(album, to)}
            onRemove={(album) => void board.remove(album)}
            onAddAlbums={() => setAddOpen(true)}
          />
        )}

        <AdvanceToast advance={board.advance} onUndo={(advance) => void board.undo(advance)} />
      </div>

      {playingTrack && (
        <Playbar
          state={player.state}
          devices={player.devices}
          // A record played from the Spotify app has no card to take art from,
          // so fall through to what playback itself reported.
          albumArt={playingCard?.imageUrl ?? playingTrack.imageUrl}
          albumPosition={nowPlaying}
          onCommand={(command) => void player.send(command)}
          onOpenDevices={() => void player.loadDevices()}
          {...(queueablePlayingId
            ? {
                onAddToQueue: () => void queuePlaying(queueablePlayingId),
                isAddingToQueue: queueing,
              }
            : {})}
        />
      )}

      <AlbumDrawer
        album={openAlbum}
        isOpen={openAlbum !== null}
        onOpenChange={(open) => !open && setOpenAlbumId(null)}
        onPlay={play}
        onMove={(album, to) => void board.move(album, to)}
        onRemove={(album) => void board.remove(album)}
        canPlayInApp={canPlayInApp}
      />

      <AddAlbumsModal
        isOpen={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(albumIds) => board.addAlbums(albumIds)}
        {...(fetchImpl ? { fetchCatalogue: fetchImpl } : {})}
      />
    </div>
  );
}

/** The header search narrows the board rather than searching Spotify. */
export function filterBoard(board: BoardModel, query: string): BoardModel {
  const needle = query.trim().toLowerCase();
  if (needle === '') return board;
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      albums: column.albums.filter(
        (album) =>
          album.name.toLowerCase().includes(needle) || album.artist.toLowerCase().includes(needle),
      ),
    })),
  };
}
