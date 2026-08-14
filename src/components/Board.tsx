'use client';

import { useState } from 'react';
import { buttonVariants, cn } from '@heroui/react';
import { BoardColumn, type BoardColumnProps } from './BoardColumn';
import { t } from '@/lib/copy';
import type { Board as BoardModel, BoardCard as BoardCardModel } from '@/lib/domain/board';
import { ADVANCING_COLUMN_IDS, type ColumnId } from '@/lib/domain/columns';

type Handlers = Pick<BoardColumnProps, 'onOpen' | 'onPlay' | 'onMove' | 'onRemove'>;

export interface BoardProps extends Handlers {
  board: BoardModel;
  /** Below roughly 900px the seven columns collapse to three. Not a view the user picks. */
  narrow?: boolean;
  playingAlbumId?: string | null;
  nowPlaying?: BoardColumnProps['nowPlaying'];
  justMovedIds?: ReadonlySet<string>;
  movingTo?: ReadonlyMap<string, ColumnId>;
  onAddAlbums(): void;
}

export function Board({ narrow = false, ...props }: BoardProps) {
  return narrow ? <NarrowBoard {...props} /> : <WideBoard {...props} />;
}

/** Shared drag state: dropping is the manual override, not the normal path. */
function useDragging(onMove: Handlers['onMove']) {
  const [dragging, setDragging] = useState<BoardCardModel | null>(null);
  return {
    draggingAlbum: dragging,
    onDragStart: (album: BoardCardModel) => setDragging(album),
    onDragEnd: () => setDragging(null),
    onDropInto: (columnId: ColumnId) => {
      /* c8 ignore next -- a column only offers a drop target while a card is in hand. */
      if (dragging) onMove(dragging, columnId);
      setDragging(null);
    },
  };
}

function WideBoard({ board, onAddAlbums, justMovedIds, movingTo, playingAlbumId, nowPlaying, ...handlers }: Omit<BoardProps, 'narrow'>) {
  const drag = useDragging(handlers.onMove);

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background p-4 pt-4 pb-5 lg:px-5">
      <div className="grid h-full min-w-max grid-cols-[repeat(7,var(--spacing-column))] grid-rows-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2.5">
        <Band>{t('column.queue.name')}</Band>
        <Band span={4}>{t('band.inProgress')}</Band>
        <Band span={2}>{t('band.finished')}</Band>

        {board.columns.map((column) => (
          <BoardColumn
            key={column.id}
            column={column}
            playingAlbumId={playingAlbumId ?? null}
            nowPlaying={nowPlaying ?? null}
            {...(justMovedIds ? { justMovedIds } : {})}
            {...(movingTo ? { movingTo } : {})}
            {...(column.id === 'queue'
              ? {
                  footer: (
                    <button
                      type="button"
                      onClick={onAddAlbums}
                      className={cn(buttonVariants({ variant: 'ghost' }), 'mt-0.5 w-full')}
                    >
                      {t('nav.addAlbums')}
                    </button>
                  ),
                }
              : {})}
            {...(column.id === 'x4' ? {} : { emptyLabel: t('column.empty.short') })}
            {...drag}
            {...handlers}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Three columns instead of seven, with the play count on a chip. The four
 * ×N columns merge, which costs the spatial ordering — so In progress states
 * its sort, since a sort the user can't see is a sort they won't trust.
 */
function NarrowBoard({ board, onAddAlbums, justMovedIds, movingTo, playingAlbumId, nowPlaying, ...handlers }: Omit<BoardProps, 'narrow'>) {
  const drag = useDragging(handlers.onMove);
  const byId = (id: ColumnId) => board.columns.find((column) => column.id === id);

  const queue = byId('queue');
  const done = byId('done');
  const abandoned = byId('abandoned');

  // Merging four columns costs the spatial ordering, so listens replace it —
  // read off the column each card came from rather than a nullable count.
  const inProgress = board.columns
    .filter((column) => column.band === 'progress')
    .flatMap((column) => column.albums)
    .sort(
      (a, b) =>
        ADVANCING_COLUMN_IDS.indexOf(b.columnId) - ADVANCING_COLUMN_IDS.indexOf(a.columnId),
    );

  /* c8 ignore next -- every board carries all seven columns; guards a malformed one. */
  if (!queue || !done || !abandoned) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background p-3.5">
      <div className="grid grid-cols-1 gap-3 board:h-full board:grid-cols-3 board:grid-rows-[auto_minmax(0,1fr)] board:gap-x-3.5">
        <Band className="hidden board:flex">{t('column.queue.name')}</Band>
        <Band className="hidden board:flex">
          {t('band.inProgress')}
          <span className="text-xs font-normal tracking-normal text-muted normal-case">
            {t('narrow.band.inProgress.note')}
          </span>
        </Band>
        <Band className="hidden board:flex">{t('band.finished')}</Band>

        <BoardColumn
          column={queue}
          narrow
          playingAlbumId={playingAlbumId ?? null}
          nowPlaying={nowPlaying ?? null}
          {...(justMovedIds ? { justMovedIds } : {})}
          {...(movingTo ? { movingTo } : {})}
          emptyLabel={t('column.empty.short')}
          footer={
            <button
              type="button"
              onClick={onAddAlbums}
              className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
            >
              {t('nav.addAlbums')}
            </button>
          }
          {...drag}
          {...handlers}
        />

        <BoardColumn
          column={{ id: 'x1', name: t('narrow.column.inProgress.name'), terminal: false, albums: inProgress }}
          heading={t('narrow.column.inProgress.name')}
          subheading={t('narrow.column.inProgress.sub')}
          narrow
          playingAlbumId={playingAlbumId ?? null}
          nowPlaying={nowPlaying ?? null}
          {...(justMovedIds ? { justMovedIds } : {})}
          {...(movingTo ? { movingTo } : {})}
          emptyLabel={t('column.x4.empty')}
          {...drag}
          {...handlers}
        />

        <BoardColumn
          column={done}
          narrow
          playingAlbumId={playingAlbumId ?? null}
          nowPlaying={nowPlaying ?? null}
          {...(justMovedIds ? { justMovedIds } : {})}
          {...(movingTo ? { movingTo } : {})}
          emptyLabel={t('column.empty.short')}
          footer={
            abandoned.albums.length > 0 ? (
              <details className="mt-1.5">
                <summary className="cursor-pointer px-0.5 py-1.5 text-[13px] text-muted">
                  {t('narrow.abandoned.summary', { n: abandoned.albums.length })}
                </summary>
                <div className="mt-1.5 flex flex-col gap-2">
                  {abandoned.albums.map((album) => (
                    <AbandonedRow key={album.id} album={album} onOpen={handlers.onOpen} />
                  ))}
                </div>
              </details>
            ) : null
          }
          {...drag}
          {...handlers}
        />
      </div>
    </div>
  );
}

function AbandonedRow({ album, onOpen }: { album: BoardCardModel; onOpen: Handlers['onOpen'] }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(album)}
      className="flex items-center gap-3 rounded-xl bg-surface p-2.5 text-left shadow-surface"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{album.name}</span>
        <span className="block truncate text-[13px] text-muted">{album.artist}</span>
      </span>
    </button>
  );
}

function Band({ children, span = 1, className }: { children: React.ReactNode; span?: number; className?: string }) {
  return (
    <div
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
      className={cn(
        'flex items-center gap-2.5 px-1.5 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase',
        className,
      )}
    >
      {children}
    </div>
  );
}
