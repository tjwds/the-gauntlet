/**
 * The seven columns, which are also the seven playlists, which are also the
 * entire store. Nothing here is configurable: a column's name is the key the
 * app finds its playlist by on every load, so an editable name would have to
 * be written down somewhere, and there is nowhere to write it.
 */

export type ColumnId = 'queue' | 'x1' | 'x2' | 'x3' | 'x4' | 'done' | 'abandoned';

export type BandId = 'queue' | 'progress' | 'finished';

export interface Column {
  id: ColumnId;
  /** Heading on the board. Uses U+00D7, not the letter x. */
  name: string;
  /** Exact Spotify playlist name. The lookup key — see the module comment. */
  playlistName: string;
  /** Completed listens an album in this column has banked, or null for Abandoned. */
  listens: number | null;
  band: BandId;
  /** Done and Abandoned are read-mostly and nothing advances out of them. */
  terminal: boolean;
}

/** Prefix shared by all seven playlists. U+00B7 middle dot. */
export const PLAYLIST_PREFIX = 'Gauntlet · ';

/** Listens required to retire a record. Fixed, which is what fixes the column count. */
export const LISTENS_TO_DONE = 5;

const stage = (n: number): Column => ({
  id: `x${n}` as ColumnId,
  name: `×${n}`,
  playlistName: `${PLAYLIST_PREFIX}×${n}`,
  listens: n,
  band: 'progress',
  terminal: false,
});

export const COLUMNS: readonly Column[] = [
  {
    id: 'queue',
    name: 'Queue',
    playlistName: `${PLAYLIST_PREFIX}Queue`,
    listens: 0,
    band: 'queue',
    terminal: false,
  },
  stage(1),
  stage(2),
  stage(3),
  stage(4),
  {
    id: 'done',
    name: 'Done',
    playlistName: `${PLAYLIST_PREFIX}Done`,
    listens: LISTENS_TO_DONE,
    band: 'finished',
    terminal: true,
  },
  {
    id: 'abandoned',
    name: 'Abandoned',
    playlistName: `${PLAYLIST_PREFIX}Abandoned`,
    listens: null,
    band: 'finished',
    terminal: true,
  },
];

export const COLUMN_IDS: readonly ColumnId[] = COLUMNS.map((c) => c.id);

/** The five columns an album advances through by being listened to. */
export const ADVANCING_COLUMN_IDS: readonly ColumnId[] = ['queue', 'x1', 'x2', 'x3', 'x4'];

const BY_ID = new Map<ColumnId, Column>(COLUMNS.map((c) => [c.id, c]));
const BY_PLAYLIST_NAME = new Map<string, Column>(COLUMNS.map((c) => [c.playlistName, c]));

export function getColumn(id: ColumnId): Column {
  const column = BY_ID.get(id);
  /* c8 ignore next 3 -- unreachable while ColumnId is the only way in; kept as a guard for untyped callers. */
  if (!column) {
    throw new Error(`Unknown column: ${id}`);
  }
  return column;
}

export function isColumnId(value: unknown): value is ColumnId {
  return typeof value === 'string' && BY_ID.has(value as ColumnId);
}

/** Match a Spotify playlist back to its column by exact name. */
export function columnForPlaylistName(name: string): Column | undefined {
  return BY_PLAYLIST_NAME.get(name);
}

/**
 * Where a completed listen sends an album. Done and Abandoned go nowhere;
 * ×4 goes to Done, which is the fifth listen.
 */
export function nextColumnId(id: ColumnId): ColumnId | null {
  const index = ADVANCING_COLUMN_IDS.indexOf(id);
  if (index === -1) return null;
  return index === ADVANCING_COLUMN_IDS.length - 1
    ? 'done'
    : (ADVANCING_COLUMN_IDS[index + 1] as ColumnId);
}

/**
 * Where `passes` completed listens send an album, capped at Done. Returns null
 * when the album cannot advance at all — it is already terminal, or passes is 0.
 */
export function advanceBy(id: ColumnId, passes: number): ColumnId | null {
  if (passes <= 0) return null;
  let current: ColumnId = id;
  for (let i = 0; i < passes; i += 1) {
    const next = nextColumnId(current);
    if (next === null) break;
    current = next;
  }
  return current === id ? null : current;
}

/** How many more complete listens this album owes before it retires. */
export function listensRemaining(id: ColumnId): number | null {
  const { listens } = getColumn(id);
  return listens === null ? null : Math.max(0, LISTENS_TO_DONE - listens);
}
