'use client';

import { Button, buttonVariants, Chip, cn, Dropdown } from '@heroui/react';
import { AlbumArt } from './AlbumArt';
import { ProgressDots } from './ProgressDots';
import { PassProgress } from './PassProgress';
import { t } from '@/lib/copy';
import type { BoardCard as BoardCardModel } from '@/lib/domain/board';
import { ADVANCING_COLUMN_IDS, COLUMNS, getColumn, type ColumnId } from '@/lib/domain/columns';
import { cardMeta, narrowProgressLabel, showsDots, type NowPlaying } from '@/lib/ui/card';

export interface BoardCardActions {
  onOpen(album: BoardCardModel): void;
  onPlay(album: BoardCardModel): void;
  onMove(album: BoardCardModel, to: ColumnId): void;
  onRemove(album: BoardCardModel): void;
}

export interface BoardCardProps extends BoardCardActions {
  album: BoardCardModel;
  playing?: boolean;
  nowPlaying?: NowPlaying | null;
  justMoved?: boolean;
  /** The narrow board merges four columns, so the count moves onto a chip. */
  narrow?: boolean;
  onDragStart?(album: BoardCardModel): void;
  onDragEnd?(): void;
}

export function BoardCard({
  album,
  playing = false,
  nowPlaying = null,
  justMoved = false,
  narrow = false,
  onOpen,
  onPlay,
  onMove,
  onRemove,
  onDragStart,
  onDragEnd,
}: BoardCardProps) {
  const meta = cardMeta(album, playing ? nowPlaying : null);
  const narrowLabel = narrow ? narrowProgressLabel(album, playing, nowPlaying) : undefined;
  // Null only in Abandoned, where the count never meant anything.
  const listens = album.listens ?? 0;

  return (
    <article
      data-testid="board-card"
      data-album-id={album.id}
      draggable={onDragStart !== undefined}
      onDragStart={() => onDragStart?.(album)}
      onDragEnd={() => onDragEnd?.()}
      className={cn(
        'group relative flex gap-3 rounded-xl bg-surface p-2.5 shadow-surface transition-shadow',
        'hover:shadow-overlay',
        playing && 'ring-2 ring-accent',
        justMoved && 'ring-2 ring-accent/40',
      )}
    >
      <div className="relative size-13 shrink-0">
        <AlbumArt src={album.imageUrl} className="size-13 rounded-lg" />
        {!playing && (
          <Button
            aria-label={t('card.play.aria')}
            onPress={() => onPlay(album)}
            isIconOnly
            variant="primary"
            size="sm"
            className={cn(
              'absolute inset-0 size-13 rounded-lg opacity-0 transition-opacity',
              'group-hover:opacity-100 focus-visible:opacity-100',
              // Nothing to hover with on touch, so the control stays visible.
              '[@media(hover:none)]:opacity-100',
            )}
          >
            <PlayGlyph />
          </Button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(album)}
          className="block w-full text-left after:absolute after:inset-0 after:content-['']"
          aria-label={t('card.open.aria', { album: album.name })}
        >
          <span className="clamp-2 text-sm leading-tight font-semibold tracking-tight">
            {playing && <LevelMeter />}
            {album.name}
            {narrow && listens > 0 && (
              <Chip size="sm" className="ml-1.5 align-middle">
                {getColumn(album.columnId).name}
              </Chip>
            )}
          </span>
        </button>
        <div className="truncate text-[13px] text-muted">{album.artist}</div>
        <div className="mt-0.5 text-[11px] text-muted/80">{meta}</div>

        {showsDots(album) && (
          <ProgressDots
            listens={listens}
            showLabel={!narrow}
            {...(narrowLabel ? { label: narrowLabel } : {})}
          />
        )}

        {album.inFlight && !narrow && <PassProgress pass={album.inFlight} />}

        {justMoved && (
          <div className="mt-1.5">
            <Chip color="accent" variant="primary" size="sm">
              {t('card.movedChip')}
            </Chip>
          </div>
        )}
      </div>

      <CardMenu album={album} onPlay={onPlay} onMove={onMove} onRemove={onRemove} onOpen={onOpen} />
    </article>
  );
}

function CardMenu({ album, onPlay, onMove, onRemove }: BoardCardActions & { album: BoardCardModel }) {
  const destinations = COLUMNS.filter((column) => column.id !== album.columnId);

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={t('card.more.aria')}
        className={cn(
          // The trigger is react-aria's Button, not HeroUI's, so it takes the
          // button classes rather than the variant props.
          buttonVariants({ variant: 'tertiary', size: 'sm', isIconOnly: true }),
          'absolute top-1.5 right-1.5 z-10 size-6.5 opacity-0 transition-opacity',
          'group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
        )}
      >
        <span aria-hidden="true">⋯</span>
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          onAction={(key) => {
            if (key === 'play') return onPlay(album);
            if (key === 'remove') return onRemove(album);
            if (key === 'spotify') {
              window.open(`https://open.spotify.com/album/${album.id}`, '_blank', 'noopener');
              return;
            }
            onMove(album, String(key).replace('move:', '') as ColumnId);
          }}
        >
          <Dropdown.Item id="play">{t('album.play')}</Dropdown.Item>
          {ADVANCING_COLUMN_IDS.includes(album.columnId) && (
            <Dropdown.Item id="move:done">{t('album.action.markComplete')}</Dropdown.Item>
          )}
          <Dropdown.SubmenuTrigger>
            <Dropdown.Item id="move">{t('album.action.moveTo')}</Dropdown.Item>
            <Dropdown.Popover>
              <Dropdown.Menu onAction={(key) => onMove(album, String(key).replace('move:', '') as ColumnId)}>
                {destinations.map((column) => (
                  <Dropdown.Item key={column.id} id={`move:${column.id}`}>
                    {column.name}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.SubmenuTrigger>
          <Dropdown.Item id="move:abandoned">{t('album.action.abandon')}</Dropdown.Item>
          <Dropdown.Item id="remove">{t('album.action.remove')}</Dropdown.Item>
          <Dropdown.Item id="spotify">{t('album.openSpotify')}</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="currentColor">
      <path d="M8 5.14v13.72L19 12z" />
    </svg>
  );
}

/** Four bars in place of the play button on the card that's playing. */
function LevelMeter() {
  return (
    <span className="mr-1.5 inline-flex h-2.5 items-end gap-[2px] align-[-1px]" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <i
          key={index}
          className="eq-bar block w-[2.5px] rounded-sm bg-accent"
          style={{ height: '100%', animationDelay: `${index * 140}ms` }}
        />
      ))}
    </span>
  );
}
