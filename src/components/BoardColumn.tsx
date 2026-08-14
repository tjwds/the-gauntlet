'use client';

import { cn } from '@heroui/react';
import { BoardCard, type BoardCardProps } from './BoardCard';
import { t } from '@/lib/copy';
import type { BoardColumn as BoardColumnModel } from '@/lib/domain/board';
import type { BoardCard as BoardCardModel } from '@/lib/domain/board';
import type { ColumnId } from '@/lib/domain/columns';

type CardHandlers = Pick<BoardCardProps, 'onOpen' | 'onPlay' | 'onMove' | 'onRemove'>;

export interface BoardColumnProps extends CardHandlers {
  column: Pick<BoardColumnModel, 'id' | 'name' | 'terminal'> & { albums: BoardCardModel[] };
  /** Overrides the heading, for the merged column on the narrow board. */
  heading?: string;
  subheading?: string;
  narrow?: boolean;
  playingAlbumId?: string | null;
  nowPlaying?: BoardCardProps['nowPlaying'];
  justMovedIds?: ReadonlySet<string>;
  /** Cards with a move in flight, against the column each is on its way to. */
  movingTo?: ReadonlyMap<string, ColumnId>;
  emptyLabel?: string;
  footer?: React.ReactNode;
  draggingAlbum?: BoardCardModel | null;
  onDragStart?(album: BoardCardModel): void;
  onDragEnd?(): void;
  onDropInto?(columnId: ColumnId): void;
}

export function BoardColumn({
  column,
  heading,
  subheading,
  narrow = false,
  playingAlbumId = null,
  nowPlaying = null,
  justMovedIds,
  movingTo,
  emptyLabel,
  footer,
  draggingAlbum = null,
  onDragStart,
  onDragEnd,
  onDropInto,
  ...handlers
}: BoardColumnProps) {
  const canDrop = draggingAlbum !== null && draggingAlbum.columnId !== column.id;

  return (
    <section
      data-testid={`column-${column.id}`}
      aria-label={heading ?? column.name}
      className={cn(
        'flex min-h-0 flex-col rounded-2xl',
        column.terminal ? 'bg-surface-tertiary' : 'bg-surface-secondary',
      )}
      onDragOver={(event) => {
        if (canDrop) event.preventDefault();
      }}
      onDrop={() => {
        if (canDrop) onDropInto?.(column.id);
      }}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-3">
        <span className="text-[15px] font-semibold tracking-tight">{heading ?? column.name}</span>
        <span className="ml-auto grid h-5.5 min-w-5.5 place-items-center rounded-full bg-surface px-1.5 text-[11px] font-semibold text-muted">
          {column.albums.length}
        </span>
      </div>

      {subheading && <div className="-mt-2 px-3.5 pb-3 text-xs text-muted">{subheading}</div>}

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pt-0.5 pb-2.5">
        {canDrop && (
          <div
            data-testid={`drop-slot-${column.id}`}
            className="rounded-2xl border-2 border-dashed border-accent bg-accent-soft px-3.5 py-4 text-center text-[13px] font-medium text-accent-soft-foreground"
          >
            {t('board.dropSlot.title')}
            <br />
            <span className="text-xs">
              {t('board.dropSlot.detail', { album: draggingAlbum.name, column: column.name })}
            </span>
          </div>
        )}

        {column.albums.length === 0 && !canDrop && (
          <div className="rounded-2xl border-2 border-dashed border-separator px-3.5 py-6 text-center text-[13px] text-muted">
            {emptyLabel ?? t('column.x4.empty')}
          </div>
        )}

        {column.albums.map((album) => (
          <BoardCard
            key={album.id}
            album={album}
            narrow={narrow}
            playing={playingAlbumId === album.id}
            nowPlaying={playingAlbumId === album.id ? nowPlaying : null}
            justMoved={justMovedIds?.has(album.id) ?? false}
            movingTo={movingTo?.get(album.id) ?? null}
            {...(onDragStart ? { onDragStart } : {})}
            {...(onDragEnd ? { onDragEnd } : {})}
            {...handlers}
          />
        ))}

        {footer}
      </div>
    </section>
  );
}
