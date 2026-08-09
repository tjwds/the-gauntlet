'use client';

import { Button, buttonVariants, Chip, cn, Drawer, Dropdown, ProgressBar } from '@heroui/react';
import { AlbumArt } from './AlbumArt';
import { ProgressDots } from './ProgressDots';
import { t } from '@/lib/copy';
import type { BoardCard } from '@/lib/domain/board';
import { COLUMNS, getColumn, nextColumnId, type ColumnId } from '@/lib/domain/columns';
import { formatClock, formatLongDate } from '@/lib/domain/format';

export interface AlbumDrawerProps {
  album: BoardCard | null;
  isOpen: boolean;
  onOpenChange(open: boolean): void;
  onPlay(album: BoardCard): void;
  onMove(album: BoardCard, to: ColumnId): void;
  onRemove(album: BoardCard): void;
  /** Free accounts get "Open in Spotify" where the play button would be. */
  canPlayInApp?: boolean;
}

/**
 * The two questions a card can't answer: how far through the current pass am I,
 * and how did this album get here. The second is one line, because one line is
 * all Spotify can tell us — a full timeline would be a private event log, which
 * is the largest single reason this would have needed a database.
 */
export function AlbumDrawer({
  album,
  isOpen,
  onOpenChange,
  onPlay,
  onMove,
  onRemove,
  canPlayInApp = true,
}: AlbumDrawerProps) {
  return (
    <Drawer.Root isOpen={isOpen && album !== null} onOpenChange={onOpenChange}>
      <Drawer.Backdrop>
        {/*
          Content is the full-viewport positioning layer — it has to stay
          `inset-0` for `justify-end` to reach the right edge. The panel width
          belongs on the dialog, and the padding with the sections below.
        */}
        <Drawer.Content placement="right">
          <Drawer.Dialog aria-label={t('album.drawer.kicker')} className="w-full max-w-110 p-0">
            {album && (
              <DrawerContents
                album={album}
                onPlay={onPlay}
                onMove={onMove}
                onRemove={onRemove}
                canPlayInApp={canPlayInApp}
                onClose={() => onOpenChange(false)}
              />
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer.Root>
  );
}

function DrawerContents({
  album,
  onPlay,
  onMove,
  onRemove,
  canPlayInApp,
  onClose,
}: {
  album: BoardCard;
  onPlay(album: BoardCard): void;
  onMove(album: BoardCard, to: ColumnId): void;
  onRemove(album: BoardCard): void;
  canPlayInApp: boolean;
  onClose(): void;
}) {
  const column = getColumn(album.columnId);
  const listens = album.listens ?? 0;
  const pass = album.inFlight;
  const next = nextColumnId(album.columnId);

  return (
    <>
      {/* `flex-row` is load-bearing: the header slot is a column by default. */}
      <Drawer.Header className="flex flex-row items-center gap-2.5 px-5 pt-4.5 pb-3">
        <strong className="text-[13px] text-muted">{t('album.drawer.kicker')}</strong>
        <Chip color="accent" variant="soft" size="sm">
          {t('album.drawer.columnChip', { column: column.name })}
        </Chip>
        <Drawer.CloseTrigger
          aria-label={t('common.close.aria')}
          className={cn(buttonVariants({ variant: 'tertiary', isIconOnly: true }), 'ml-auto')}
        >
          <span aria-hidden="true">✕</span>
        </Drawer.CloseTrigger>
      </Drawer.Header>

      <Drawer.Body className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        <div className="flex gap-3.5">
          <AlbumArt src={album.imageUrl} className="size-28 rounded-xl" />
          <div className="min-w-0">
            <h2 className="text-xl leading-tight font-bold tracking-tight">{album.name}</h2>
            <div className="text-muted">{album.artist}</div>
            <div className="mt-1.5 text-[13px] text-muted">
              {t('album.meta', {
                year: album.year,
                n: album.totalTracks,
                duration: formatClock(album.durationMs),
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {canPlayInApp ? (
            <Button variant="primary" onPress={() => onPlay(album)}>
              ▶ {t('album.play')}
            </Button>
          ) : null}
          <a
            className={buttonVariants({ variant: 'ghost' })}
            href={`https://open.spotify.com/album/${album.id}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('album.openSpotify')}
          </a>
        </div>

        <hr className="my-5 border-separator" />

        <div className="flex items-center gap-2.5">
          <ProgressDots listens={listens} showLabel={false} />
          <div className="text-[13px]">
            <strong>{t('album.listens', { n: listens })}</strong>
          </div>
        </div>

        {pass && (
          <div className="mt-3">
            <div className="flex justify-between text-[13px]">
              <span>{t('album.pass.label', { n: listens + 1 })}</span>
              <span className="font-mono text-xs">
                {t('album.pass.count', { done: pass.tracksDone, total: pass.total })}
              </span>
            </div>
            <ProgressBar
              aria-label={t('album.pass.label', { n: listens + 1 })}
              value={pass.total === 0 ? 0 : (pass.tracksDone / pass.total) * 100}
              className="mt-1.5"
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          </div>
        )}

        <h3 className="mt-5 mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          {t('album.tracks.head')}
        </h3>
        {/*
          Ticks are the current pass only and reset when the album advances. The
          rule is album order with no skips, so this is a position marker rather
          than a checklist: everything above the line is done, everything below
          is still owed.
        */}
        <ol className="flex flex-col gap-px">
          {album.tracks.map((track, index) => {
            const heard = index < (pass?.tracksDone ?? 0);
            return (
              <li
                key={track.id}
                data-testid={heard ? 'track-heard' : 'track-pending'}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px]',
                  !heard && 'text-muted',
                )}
              >
                <span className={cn('w-4 text-center text-xs', heard ? 'text-accent' : 'text-muted')}>
                  {heard ? '✓' : '·'}
                </span>
                <span className="w-4 text-right text-[11px] text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{track.name}</span>
                <span className="text-[11px] tabular-nums text-muted">
                  {formatClock(track.durationMs)}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-5 border-t border-separator pt-3.5 text-[13px] text-muted">
          {t('album.sinceLine', {
            column: column.name,
            date: formatLongDate(album.addedAt),
          })}
        </p>
      </Drawer.Body>

      {/* As with the header: the footer slot justifies to the end by default. */}
      <Drawer.Footer className="flex flex-wrap justify-start gap-2 border-t border-separator px-5 py-3.5">
        <Dropdown>
          <Dropdown.Trigger className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            {t('album.action.moveTo')}
          </Dropdown.Trigger>
          <Dropdown.Popover placement="top start">
            <Dropdown.Menu
              onAction={(key) => {
                onMove(album, key as ColumnId);
                onClose();
              }}
            >
              {COLUMNS.filter((candidate) => candidate.id !== album.columnId).map((candidate) => (
                <Dropdown.Item key={candidate.id} id={candidate.id}>
                  {candidate.name}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        {/* For a listen on vinyl, another service, or one the history window lost. */}
        {next && (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              onMove(album, next);
              onClose();
            }}
          >
            {t('album.action.markComplete')}
          </Button>
        )}

        {album.columnId !== 'abandoned' && (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              onMove(album, 'abandoned');
              onClose();
            }}
          >
            {t('album.action.abandon')}
          </Button>
        )}

        <Button
          variant="tertiary"
          size="sm"
          onPress={() => {
            onRemove(album);
            onClose();
          }}
        >
          {t('album.action.remove')}
        </Button>
      </Drawer.Footer>
    </>
  );
}
