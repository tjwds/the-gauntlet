import { describe, expect, it } from 'vitest';
import {
  albumColumnIndex,
  buildBoard,
  columnLabel,
  columnOf,
  findCard,
  historyToPlayEvents,
  playbackToSnapshot,
} from './board';
import {
  albumTracks,
  anAlbum,
  aTrack,
  boardPlaylists,
  emptyItems,
  playbackState,
  playHistory,
  playlistEntries,
} from '@/test/fixtures';
import type { PlayEvent } from './pass';

const NOW = Date.parse('2026-07-10T12:00:00.000Z');
const ARRIVED = '2026-07-06T09:00:00.000Z';

function board(
  overrides: Partial<Parameters<typeof buildBoard>[0]> = {},
  items = emptyItems(),
) {
  return buildBoard({
    playlists: boardPlaylists(),
    history: [],
    playback: null,
    nowMs: NOW,
    items,
    ...overrides,
  });
}

describe('buildBoard', () => {
  it('always has the seven columns, empty or not', () => {
    const result = board();
    expect(result.columns.map((c) => c.id)).toEqual([
      'queue',
      'x1',
      'x2',
      'x3',
      'x4',
      'done',
      'abandoned',
    ]);
    expect(result.columns.every((c) => c.albums.length === 0)).toBe(true);
  });

  it('carries the playlist behind each column through for the Settings screen', () => {
    const queue = columnOf(board(), 'queue');
    expect(queue.playlistId).toBe('pl-queue');
    expect(queue.playlistUrl).toBe('https://open.spotify.com/playlist/pl-queue');
  });

  it('files an album under the column whose playlist holds it', () => {
    const items = emptyItems();
    items.x3 = playlistEntries(albumTracks(anAlbum(), 10), ARRIVED);
    const card = columnOf(board({}, items), 'x3').albums[0];
    expect(card?.name).toBe('In Rainbows');
    expect(card?.columnId).toBe('x3');
    expect(card?.listens).toBe(3);
    expect(card?.addedAt).toBe(ARRIVED);
  });

  it('leaves listens null in Abandoned, where the count never meant anything', () => {
    const items = emptyItems();
    items.abandoned = playlistEntries(albumTracks(anAlbum(), 2), ARRIVED);
    expect(columnOf(board({}, items), 'abandoned').albums[0]?.listens).toBeNull();
  });

  it('derives nothing for terminal columns, which nothing advances out of', () => {
    const album = anAlbum();
    const tracks = albumTracks(album, 3);
    const items = emptyItems();
    items.done = playlistEntries(tracks, ARRIVED);

    const history: PlayEvent[] = tracks.map((track, index) => ({
      trackId: track.id as string,
      albumId: album.id,
      durationMs: track.duration_ms,
      playedAtMs: Date.parse(ARRIVED) + (index + 1) * track.duration_ms,
    }));

    const card = columnOf(board({ history }, items), 'done').albums[0];
    expect(card?.pendingAdvance).toBe(0);
    expect(card?.inFlight).toBeNull();
  });

  it('marks an album that earned a move but has not been moved yet', () => {
    const album = anAlbum();
    const tracks = albumTracks(album, 3);
    const items = emptyItems();
    items.x1 = playlistEntries(tracks, ARRIVED);

    const start = Date.parse(ARRIVED) + 3_600_000;
    const history: PlayEvent[] = tracks.map((track, index) => ({
      trackId: track.id as string,
      albumId: album.id,
      durationMs: track.duration_ms,
      playedAtMs: start + (index + 1) * track.duration_ms,
    }));

    expect(columnOf(board({ history }, items), 'x1').albums[0]?.pendingAdvance).toBe(1);
  });

  it('caps the move at Done however many passes it finds', () => {
    const album = anAlbum();
    const tracks = albumTracks(album, 2);
    const items = emptyItems();
    items.x4 = playlistEntries(tracks, ARRIVED);

    const start = Date.parse(ARRIVED) + 3_600_000;
    const history: PlayEvent[] = [];
    for (let pass = 0; pass < 4; pass += 1) {
      tracks.forEach((track, index) => {
        history.push({
          trackId: track.id as string,
          albumId: album.id,
          durationMs: track.duration_ms,
          playedAtMs: start + (pass * tracks.length + index + 1) * track.duration_ms,
        });
      });
    }

    expect(columnOf(board({ history }, items), 'x4').albums[0]?.pendingAdvance).toBe(1);
  });

  it('counts tracks rather than albums for the Settings chip', () => {
    const items = emptyItems();
    items.queue = playlistEntries(albumTracks(anAlbum(), 6), ARRIVED);
    expect(columnOf(board({}, items), 'queue').trackCount).toBe(6);
  });

  it('takes a played_at reading when it is given one', () => {
    const items = emptyItems();
    items.x1 = playlistEntries(albumTracks(anAlbum(), 2), ARRIVED);
    const withReading = board({ semantics: 'start' }, items);
    expect(columnOf(withReading, 'x1').albums[0]?.pendingAdvance).toBe(0);
  });

  it('copes with a column the caller left out entirely', () => {
    const items = emptyItems();
    delete (items as Partial<typeof items>).x2;
    expect(columnOf(board({}, items), 'x2').albums).toEqual([]);
  });
});

describe('board lookups', () => {
  const items = emptyItems();
  items.x2 = playlistEntries(albumTracks(anAlbum({ id: 'alb1' }), 2), ARRIVED);
  items.done = playlistEntries(
    albumTracks(anAlbum({ id: 'alb2', name: 'Kid A' }), 2),
    ARRIVED,
  );
  const result = board({}, items);

  it('maps every album to its column', () => {
    expect(albumColumnIndex(result)).toEqual(
      new Map([
        ['alb1', 'x2'],
        ['alb2', 'done'],
      ]),
    );
  });

  it('finds a card wherever it sits', () => {
    expect(findCard(result, 'alb2')?.name).toBe('Kid A');
  });

  it('returns nothing for an album that is not on the board', () => {
    expect(findCard(result, 'nope')).toBeNull();
  });

  it('labels a column', () => {
    expect(columnLabel('x2')).toBe('×2');
  });
});

describe('historyToPlayEvents', () => {
  it('reads Spotify history into play events', () => {
    const track = aTrack({ id: 'trk1' });
    const events = historyToPlayEvents([playHistory(track, '2026-07-10T11:00:00.000Z')]);
    expect(events).toEqual([
      {
        trackId: 'trk1',
        albumId: 'alb1',
        durationMs: 237_000,
        playedAtMs: Date.parse('2026-07-10T11:00:00.000Z'),
      },
    ]);
  });

  it('drops entries with nothing to identify', () => {
    expect(
      historyToPlayEvents([
        playHistory(aTrack({ id: null }), '2026-07-10T11:00:00.000Z'),
        playHistory({ ...aTrack(), album: undefined }, '2026-07-10T11:00:00.000Z'),
      ]),
    ).toEqual([]);
  });
});

describe('playbackToSnapshot', () => {
  it('reads live playback into a snapshot', () => {
    expect(playbackToSnapshot(playbackState())).toEqual({
      trackId: 'trk1',
      albumId: 'alb1',
      durationMs: 237_000,
      progressMs: 60_000,
      isPlaying: true,
      shuffle: false,
      timestampMs: Date.parse('2026-07-01T12:00:00.000Z'),
    });
  });

  it('treats a missing progress as nought', () => {
    expect(playbackToSnapshot(playbackState({ progress_ms: null }))?.progressMs).toBe(0);
  });

  it('has nothing to say when nothing is playing', () => {
    expect(playbackToSnapshot(undefined)).toBeNull();
    expect(playbackToSnapshot(null)).toBeNull();
    expect(playbackToSnapshot(playbackState({ item: null }))).toBeNull();
    expect(playbackToSnapshot(playbackState({ item: aTrack({ id: null }) }))).toBeNull();
    expect(
      playbackToSnapshot(playbackState({ item: { ...aTrack(), album: undefined } })),
    ).toBeNull();
  });
});
