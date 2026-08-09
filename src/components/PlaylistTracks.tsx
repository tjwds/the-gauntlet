'use client';

import type { ReactNode } from 'react';
import { Button, Checkbox, Chip, cn } from '@heroui/react';
import { AlbumArt } from './AlbumArt';
import { emphasise, t, type CopyKey } from '@/lib/copy';
import type { ImportablePlaylist } from '@/lib/board/catalogue';
import { getColumn } from '@/lib/domain/columns';
import {
  addableAlbumIds,
  isAddable,
  type AlbumTrackRow,
  type PlaylistTrackRow,
} from '@/lib/domain/playlistTracks';

/** The selected albums, each remembering which row ticked it. */
export type TrackSelection = ReadonlyMap<string, { rowKey?: string }>;

export interface PlaylistTracksProps {
  playlist: ImportablePlaylist;
  rows: PlaylistTrackRow[];
  selection: TrackSelection;
  onToggle(row: AlbumTrackRow): void;
  onSelectAll(albumIds: string[]): void;
  onClear(): void;
  onChangePlaylist(): void;
}

/**
 * A playlist's tracks, ticked to add the records they came from.
 *
 * Every row and both counts come out of the one read of the playlist: the
 * simplified album on each track carries its id, name, type, total_tracks and
 * art, so nothing here needs a follow-up lookup.
 */
export function PlaylistTracks({
  playlist,
  rows,
  selection,
  onToggle,
  onSelectAll,
  onChangePlaylist,
  onClear,
}: PlaylistTracksProps) {
  const addableIds = addableAlbumIds(rows);
  const selectedCount = addableIds.filter((id) => selection.has(id)).length;
  const primary = primaryKeys(rows, selection);

  return (
    <>
      <div className="mb-2.5 flex items-center gap-3 rounded-xl bg-surface-secondary p-3">
        <AlbumArt src={playlist.imageUrl} className="size-13" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-tight">{playlist.name}</div>
          <div className="truncate text-[13px] text-muted">
            {t('add.tracks.meta', {
              owner: playlist.ownedByMe ? t('add.playlist.owner.you') : playlist.ownerName,
              n: playlist.trackCount,
              a: addableIds.length,
            })}
          </div>
        </div>
        <Button variant="tertiary" size="sm" onPress={onChangePlaylist}>
          {t('add.tracks.changePlaylist')}
        </Button>
      </div>

      {/* The one thing this screen has to make legible. */}
      <p className="mb-3 px-0.5 text-[13px] text-muted">{t('add.tracks.hint')}</p>

      <div className="mb-1.5 flex items-center gap-3 border-b border-separator px-2.5 pb-2">
        {/* Indeterminate matters here: HeroUI draws it as a filled box with a
            dash, which is what a part-selected select-all has to say. */}
        <Checkbox
          isSelected={selectedCount > 0 && selectedCount === addableIds.length}
          isIndeterminate={selectedCount > 0 && selectedCount < addableIds.length}
          onChange={(isSelected) => (isSelected ? onSelectAll(addableIds) : onClear())}
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('add.tracks.selectAll', { n: addableIds.length })}
          </Checkbox.Content>
        </Checkbox>
        <Button className="ml-auto" variant="tertiary" size="sm" onPress={onClear}>
          {t('add.tracks.clear')}
        </Button>
      </div>

      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.key}>
            <TrackRow
              row={row}
              isPrimary={primary.has(row.key)}
              isSelected={isAddable(row) && selection.has(row.album.id)}
              onToggle={onToggle}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Which row wears the tick for each selected album: the one that was clicked,
 * or the first one in the list when the click happened somewhere else — after a
 * *Select all*, or on a different playlist. Without the fallback a selection
 * made elsewhere would leave every row of that album reading *same album*, with
 * no row left to untick it from.
 */
function primaryKeys(rows: PlaylistTrackRow[], selection: TrackSelection): Set<string> {
  const byAlbum = new Map<string, string>();
  for (const row of rows) {
    if (!isAddable(row)) continue;
    const chosen = selection.get(row.album.id);
    if (!chosen) continue;
    if (chosen.rowKey === row.key || !byAlbum.has(row.album.id)) byAlbum.set(row.album.id, row.key);
  }
  return new Set(byAlbum.values());
}

const ROW = 'flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left';

/**
 * A tick, and only a tick, heads every row — including the ones that can't be
 * ticked, so the list reads as one column rather than three.
 */
function Tick({ state }: { state: 'on' | 'implied' | 'off' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full border-2 text-[10px]',
        state === 'on' && 'border-accent bg-accent text-accent-foreground',
        state === 'implied' && 'border-accent-soft bg-accent-soft text-accent-soft-foreground',
        state === 'off' && 'border-surface-tertiary bg-surface-secondary text-transparent',
      )}
    >
      ✓
    </span>
  );
}

function Body({ row, dimmed = false }: { row: PlaylistTrackRow; dimmed?: boolean }) {
  return (
    <span className={cn('min-w-0 flex-1', dimmed && 'opacity-55')}>
      <span className="block truncate text-[13px] font-medium">{row.title}</span>
      <span className="block truncate text-xs text-muted">
        <SubLine row={row} />
      </span>
    </span>
  );
}

function TrackRow({
  row,
  isPrimary,
  isSelected,
  onToggle,
}: {
  row: PlaylistTrackRow;
  isPrimary: boolean;
  isSelected: boolean;
  onToggle(row: AlbumTrackRow): void;
}) {
  // Rows that can't resolve to an album the board takes. They keep their place
  // and say why, because a playlist is a list the listener can already see in
  // Spotify — a row quietly missing from it reads as a bug.
  if (row.kind !== 'track' || row.reason !== null) {
    return (
      <div className={ROW}>
        <Tick state="off" />
        <AlbumArt src={null} className="size-10 opacity-55" />
        <Body row={row} dimmed />
        <Chip size="sm">{t(chipCopy(row))}</Chip>
      </div>
    );
  }

  const art = <AlbumArt src={row.album.imageUrl} className="size-10" />;

  // Already on the board, in some column, so there is nothing to add. Not
  // dimmed: the album is fine, it's just already here, and that reads
  // differently from a track this screen can't use at all.
  if (row.onBoard !== null) {
    return (
      <div className={ROW}>
        <Tick state="off" />
        {art}
        <Body row={row} />
        <Chip size="sm">{t('add.chip.onBoard', { column: getColumn(row.onBoard).name })}</Chip>
      </div>
    );
  }

  // Coming along because another row already selected this album. Ticked, but
  // not by this row — so it reads as a consequence rather than a second choice.
  if (isSelected && !isPrimary) {
    return (
      <div className={cn(ROW, 'bg-accent-soft')}>
        <Tick state="implied" />
        {art}
        <Body row={row} />
        <Chip color="accent" variant="soft" size="sm">
          {t('add.tracks.chip.sameAlbum')}
        </Chip>
      </div>
    );
  }

  return (
    <label
      className={cn(
        ROW,
        'cursor-pointer',
        isSelected ? 'bg-accent-soft ring-2 ring-accent ring-inset' : 'hover:bg-surface-secondary',
      )}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(row)}
        className="sr-only"
        aria-label={`${row.title} — ${row.album.name}`}
      />
      <Tick state={isSelected ? 'on' : 'off'} />
      {art}
      <Body row={row} />
      <span
        className={cn(
          'shrink-0 text-[11px] tabular-nums',
          isSelected ? 'font-semibold text-accent-soft-foreground' : 'text-muted',
        )}
      >
        {t(isSelected ? 'add.tracks.willAdd' : 'add.tracks.count', { n: row.album.totalTracks })}
      </span>
    </label>
  );
}

function chipCopy(row: PlaylistTrackRow): CopyKey {
  if (row.kind === 'episode') return 'add.tracks.chip.episode';
  if (row.kind === 'local') return 'add.tracks.chip.localFile';
  return row.reason === 'single' ? 'add.tracks.chip.single' : 'add.tracks.chip.compilation';
}

/** The album is emphasised because it, not the track, is what gets added. */
function SubLine({ row }: { row: PlaylistTrackRow }): ReactNode {
  if (row.kind === 'episode') return row.showName;
  if (row.kind === 'local') return t('add.tracks.localSub');
  return emphasise('add.tracks.sub', 'album', {
    artist: row.artist,
    album: row.album.name,
  }).map((part) => (
    <span key={part.text} className={cn(part.emphasis && 'font-semibold text-foreground')}>
      {part.text}
    </span>
  ));
}
