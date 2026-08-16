/**
 * The demo dataset: one board, at the shape the API answers in.
 *
 * It exists because a screenshot of the real thing is somebody's listening
 * history, and because the five-listener cap means most people reading the
 * repository can't sign in and produce one of their own to look at. The records
 * are a fixed list of twenty real records, approved for the README.
 *
 * Nothing here is reachable from the product: the screens take their data
 * through the `fetchImpl` prop they already had for tests.
 */

import type { PlayerDevice, PlayerTrack } from '@/hooks/usePlayer';
import type { Account } from '@/components/screens/SettingsScreen';
import type { CatalogueAlbum, ImportablePlaylist } from '@/lib/board/catalogue';
import type { AlbumTrack, BoardAlbum } from '@/lib/domain/albums';
import { albumColumnIndex, type Board, type BoardCard } from '@/lib/domain/board';
import { COLUMNS, type Column, type ColumnId } from '@/lib/domain/columns';
import type { InFlightPass } from '@/lib/domain/pass';
import type { PlaylistTrackRow } from '@/lib/domain/playlistTracks';
import type { Suggestion } from '@/lib/domain/suggestions';
import { demoArt, hashSeed } from './art';

const DAY_MS = 86_400_000;

/** An album before it has a column: everything but where it sits and since when. */
export type DemoAlbum = Omit<BoardAlbum, 'addedAt'>;

// ---- Building records ------------------------------------------------------

function toTrack(albumId: string, index: number, name: string, durationMs: number): AlbumTrack {
  const id = `${albumId}-t${index + 1}`;
  return { id, name, durationMs, trackNumber: index + 1, discNumber: 1, uri: `spotify:track:${id}` };
}

/** `3:57` as milliseconds. */
function clockMs(length: string): number {
  const [minutes = '0', seconds = '0'] = length.split(':');
  return (Number(minutes) * 60 + Number(seconds)) * 1000;
}

/** A tracklist written out, for the records a screenshot opens. */
function named(albumId: string, entries: Array<[string, string]>): AlbumTrack[] {
  return entries.map(([name, length], index) => toTrack(albumId, index, name, clockMs(length)));
}

/**
 * A tracklist of the right shape for the records nothing opens: the album's
 * real length and track count, divided up unevenly enough to look like a record
 * rather than a metronome. The titles are honestly generic — inventing track
 * names for real albums would put wrong facts in the screenshots.
 */
function sized(albumId: string, count: number, minutes: number): AlbumTrack[] {
  const totalMs = minutes * 60_000;
  const seed = hashSeed(albumId);
  const weights = Array.from({ length: count }, (_, index) => 1 + (((seed >>> index) % 9) - 4) / 16);
  const sum = weights.reduce((total, weight) => total + weight, 0);

  let used = 0;
  return weights.map((weight, index) => {
    const share = Math.round((totalMs * weight) / sum / 1000) * 1000;
    const durationMs = index === count - 1 ? totalMs - used : share;
    used += durationMs;
    return toTrack(albumId, index, `Track ${index + 1}`, durationMs);
  });
}

function album(
  id: string,
  name: string,
  artist: string,
  year: string,
  tracks: AlbumTrack[],
): DemoAlbum {
  return {
    id,
    name,
    artist,
    year,
    uri: `spotify:album:${id}`,
    imageUrl: demoArt(`${artist} — ${name}`),
    totalTracks: tracks.length,
    durationMs: tracks.reduce((total, track) => total + track.durationMs, 0),
    albumType: 'album',
    tracks,
  };
}

// ---- The records ----------------------------------------------------------

const FATE_EUPHORIC = album('fate-euphoric', 'Fate Euphoric', 'twen', '2025', sized('fate-euphoric', 10, 41));
const EGO_DEATH = album('ego-death', 'Ego Death', 'The Internet', '2015', sized('ego-death', 12, 57));
const NINE_TYPES = album('nine-types', 'Nine Types of Light', 'TV on the Radio', '2011', sized('nine-types', 10, 44));
const ABADDON = album('abaddon', 'Summer in Abaddon', 'Pinback', '2004', sized('abaddon', 11, 46));
const AS_TALL = album('as-tall', 'As Tall As Lions', 'As Tall As Lions', '2006', sized('as-tall', 10, 45));
const FUTURE_PERFECT = album('future-perfect', 'Future Perfect', 'Autolux', '2004', sized('future-perfect', 11, 52));

/** Written out: the record playing in the `playing` screenshot. */
const THIS_IS_HAPPENING = album('this-is-happening', 'This Is Happening', 'LCD Soundsystem', '2010', named('this-is-happening', [
  ['Dance Yrself Clean', '8:56'],
  ['Drunk Girls', '3:42'],
  ['One Touch', '7:46'],
  ['All I Want', '6:41'],
  ['I Can Change', '5:56'],
  ['You Wanted a Hit', '9:06'],
  ['Pow Pow', '8:23'],
  ["Somebody's Calling Me", '6:53'],
  ['Home', '7:53'],
]));

const HISSING_FAUNA = album('hissing-fauna', 'Hissing Fauna, Are You the Destroyer?', 'of Montreal', '2007', sized('hissing-fauna', 12, 51));
const SILENT_ALARM = album('silent-alarm', 'Silent Alarm', 'Bloc Party', '2005', sized('silent-alarm', 13, 51));
const AM = album('am', 'AM', 'Arctic Monkeys', '2013', sized('am', 12, 42));
const TRANSATLANTICISM = album('transatlanticism', 'Transatlanticism', 'Death Cab for Cutie', '2003', sized('transatlanticism', 11, 46));

/** Written out: the record the album-drawer screenshot opens. */
const THE_SLIP = album('the-slip', 'The Slip', 'Nine Inch Nails', '2008', named('the-slip', [
  ['999,999', '1:26'],
  ['1,000,000', '3:56'],
  ['Letting You', '3:50'],
  ['Discipline', '4:19'],
  ['Echoplex', '4:45'],
  ['Head Down', '4:55'],
  ['Lights in the Sky', '3:30'],
  ['Corona Radiata', '7:34'],
  ['The Four of Us Are Dying', '4:38'],
  ['Demon Seed', '4:58'],
]));

const GA_GA = album('ga-ga', 'Ga Ga Ga Ga Ga', 'Spoon', '2007', sized('ga-ga', 10, 37));
const XX = album('xx', 'xx', 'The xx', '2009', sized('xx', 11, 39));
const BARBARA = album('barbara', 'Barbara Barbara, We Face a Shining Future', 'Underworld', '2016', sized('barbara', 7, 45));
const WITH_TEETH = album('with-teeth', 'With Teeth', 'Nine Inch Nails', '2005', sized('with-teeth', 13, 56));
const CHEATAHS = album('cheatahs', 'Cheatahs', 'Cheatahs', '2014', sized('cheatahs', 12, 46));

/** In the library but not on the board — what Add albums has to offer. */
const SANTIGOLD = album('santigold', 'Santigold', 'Santigold', '2008', sized('santigold', 12, 41));
const DO_YOU_FEEL_OK = album('do-you-feel-ok', 'Do You Feel OK?', 'Superhumanoids', '2015', sized('do-you-feel-ok', 11, 41));
const SINKING_ISLANDS = album('sinking-islands', 'Sinking Islands', 'Absofacto', '2011', sized('sinking-islands', 10, 43));

/** Everything the demo knows about, which is what search looks through. */
export const DEMO_ALBUMS: readonly DemoAlbum[] = [
  FATE_EUPHORIC, EGO_DEATH, NINE_TYPES, ABADDON, AS_TALL, FUTURE_PERFECT,
  THIS_IS_HAPPENING, HISSING_FAUNA, SILENT_ALARM,
  AM, TRANSATLANTICISM,
  THE_SLIP, GA_GA,
  XX, BARBARA, WITH_TEETH,
  CHEATAHS,
  SANTIGOLD, DO_YOU_FEEL_OK, SINKING_ISLANDS,
];

// ---- The board -------------------------------------------------------------

interface Placement {
  album: DemoAlbum;
  /** Days since the record landed in this column — what `added_at` would say. */
  daysAgo: number;
  /** A pass underway. Only the two records a screenshot is about have one. */
  inFlight?: InFlightPass;
  /** A pass completed while nobody was looking, waiting to be filed. */
  earned?: boolean;
}

const LAYOUT: Record<ColumnId, Placement[]> = {
  queue: [
    { album: FATE_EUPHORIC, daysAgo: 2 },
    { album: EGO_DEATH, daysAgo: 2 },
    { album: NINE_TYPES, daysAgo: 5 },
    { album: ABADDON, daysAgo: 9 },
    { album: AS_TALL, daysAgo: 14 },
  ],
  x1: [
    { album: THIS_IS_HAPPENING, daysAgo: 3, inFlight: { tracksDone: 5, total: 9 } },
    { album: HISSING_FAUNA, daysAgo: 8 },
    { album: SILENT_ALARM, daysAgo: 11 },
  ],
  x2: [
    { album: AM, daysAgo: 4, earned: true },
    { album: TRANSATLANTICISM, daysAgo: 12 },
  ],
  x3: [
    { album: THE_SLIP, daysAgo: 29, inFlight: { tracksDone: 4, total: 10 } },
    { album: GA_GA, daysAgo: 34 },
  ],
  x4: [],
  done: [
    { album: XX, daysAgo: 23 },
    { album: BARBARA, daysAgo: 33 },
    { album: WITH_TEETH, daysAgo: 41 },
  ],
  abandoned: [
    { album: CHEATAHS, daysAgo: 32 },
    { album: FUTURE_PERFECT, daysAgo: 37 },
  ],
};

export interface DemoBoardOptions {
  /**
   * Whether the record that has earned a column arrives already advanced or
   * still owing the move. Owing it is what produces the toast and its undo,
   * because the board files its own advances on the first read.
   */
  withEarnedPass?: boolean;
}

function toCard(placement: Placement, column: Column, nowMs: number, earned: boolean): BoardCard {
  return {
    ...placement.album,
    columnId: column.id,
    listens: column.listens,
    addedAt: new Date(nowMs - placement.daysAgo * DAY_MS).toISOString(),
    inFlight: placement.inFlight ?? null,
    pendingAdvance: earned && placement.earned === true ? 1 : 0,
  };
}

export function demoBoard(nowMs: number, options: DemoBoardOptions = {}): Board {
  const earned = options.withEarnedPass === true;
  return {
    generatedAt: nowMs,
    columns: COLUMNS.map((column) => {
      const albums = LAYOUT[column.id].map((placement) => toCard(placement, column, nowMs, earned));
      return {
        ...column,
        playlistId: `demo-${column.id}`,
        playlistUrl: `https://open.spotify.com/playlist/demo-${column.id}`,
        trackCount: albums.reduce((total, card) => total + card.tracks.length, 0),
        albums,
      };
    }),
  };
}

/** A record by id, for the writes the demo has to answer. */
export function demoAlbum(id: string): DemoAlbum | undefined {
  return DEMO_ALBUMS.find((candidate) => candidate.id === id);
}

// ---- Playback --------------------------------------------------------------

export const DEMO_DEVICES: readonly PlayerDevice[] = [
  { id: 'demo-mac', name: 'MacBook Pro', type: 'Computer', is_active: true, volume_percent: 64 },
  { id: 'demo-phone', name: 'iPhone', type: 'Smartphone', is_active: false, volume_percent: 100 },
  { id: 'demo-speaker', name: 'Kitchen', type: 'Speaker', is_active: false, volume_percent: 40 },
];

/** What `GET /api/player` answers with, which is a snapshot plus its track. */
export interface DemoPlayback {
  playback: {
    trackId: string;
    albumId: string;
    durationMs: number;
    progressMs: number;
    isPlaying: boolean;
    shuffle: boolean;
    timestampMs: number;
  } | null;
  device: PlayerDevice | null;
  repeat: 'off' | 'track' | 'context';
  /** The record that was put on, which the demo always plays as a record. */
  albumContextId: string | null;
  track: PlayerTrack | null;
}

export const IDLE_PLAYBACK: DemoPlayback = {
  playback: null,
  device: null,
  repeat: 'off',
  albumContextId: null,
  track: null,
};

/**
 * A record part-way through, from the middle of it rather than the start:
 * a board that has never been listened to says nothing about what the board is
 * for. This Is Happening is on its sixth track, five into the pass its card
 * shows.
 */
export function playing(
  target: DemoAlbum,
  trackNumber: number,
  progressMs: number,
  nowMs: number,
): DemoPlayback {
  const track = target.tracks.at(trackNumber - 1) ?? target.tracks[0];
  if (!track) return IDLE_PLAYBACK;
  return {
    playback: {
      trackId: track.id,
      albumId: target.id,
      durationMs: track.durationMs,
      progressMs,
      isPlaying: true,
      shuffle: false,
      timestampMs: nowMs,
    },
    device: DEMO_DEVICES[0] ?? null,
    repeat: 'off',
    albumContextId: target.id,
    track: {
      id: track.id,
      name: track.name,
      artist: target.artist,
      albumName: target.name,
      albumId: target.id,
      imageUrl: target.imageUrl,
      durationMs: track.durationMs,
      trackNumber: track.trackNumber,
    },
  };
}

export function demoPlayback(nowMs: number): DemoPlayback {
  return playing(THIS_IS_HAPPENING, 6, 288_000, nowMs);
}

// ---- Settings --------------------------------------------------------------

export function demoAccount(board: Board): Account {
  return {
    user: {
      id: 'joe',
      name: 'joe',
      email: 'joe@example.com',
      product: 'premium',
      image: null,
    },
    playlists: board.columns.map((column) => ({
      columnId: column.id,
      name: column.playlistName,
      missing: false,
      url: column.playlistUrl,
      albums: column.albums.length,
      tracks: column.trackCount,
    })),
    ready: true,
  };
}

// ---- First records ---------------------------------------------------------

/** `[record, matched track, its rank in the top songs]`, best match first. */
const TOP_SONG_MATCHES: Array<[DemoAlbum, Array<[string, number]>]> = [
  [AM, [['Do I Wanna Know?', 3], ['R U Mine?', 12]]],
  [THIS_IS_HAPPENING, [['I Can Change', 4], ['Dance Yrself Clean', 19]]],
  [TRANSATLANTICISM, [['The Sound of Settling', 8], ['Title and Registration', 23]]],
  [XX, [['Crystalised', 6]]],
  [SILENT_ALARM, [['Banquet', 9]]],
  [HISSING_FAUNA, [['Gronlandic Edit', 11]]],
  [GA_GA, [['The Underdog', 14]]],
  [NINE_TYPES, [['Will Do', 17]]],
  [SANTIGOLD, [['L.E.S. Artistes', 21]]],
  [THE_SLIP, [['Discipline', 26]]],
  [EGO_DEATH, [['Girl', 29]]],
  [SINKING_ISLANDS, [['Nobody on the Subway', 33]]],
];

export interface DemoSuggestion extends Suggestion {
  onBoard: ColumnId | null;
}

/**
 * Records the listener already knows a song from. Four weeks of listening is a
 * narrower window than six months, so the short range answers with less — the
 * tabs have to do something visible or the screenshot misrepresents them.
 */
export function demoSuggestions(range: string | null, board: Board): DemoSuggestion[] {
  const onBoard = albumColumnIndex(board);
  const matches = range === 'short' ? TOP_SONG_MATCHES.slice(0, 7) : TOP_SONG_MATCHES;

  return matches.map(([record, tracks]) => ({
    id: record.id,
    name: record.name,
    uri: record.uri,
    artist: record.artist,
    year: record.year,
    imageUrl: record.imageUrl,
    totalTracks: record.totalTracks,
    durationMs: record.durationMs,
    albumType: record.albumType,
    matches: tracks.map(([name, rank]) => ({ name, rank })),
    bestRank: Math.min(...tracks.map(([, rank]) => rank)),
    onBoard: onBoard.get(record.id) ?? null,
  }));
}

// ---- Add albums ------------------------------------------------------------

/** The listener's saved albums, some of which are already filed. */
const SAVED: readonly DemoAlbum[] = [
  SANTIGOLD, AM, DO_YOU_FEEL_OK, THE_SLIP, SINKING_ISLANDS,
  TRANSATLANTICISM, XX, WITH_TEETH, GA_GA, EGO_DEATH,
];

function toCatalogue(record: DemoAlbum, onBoard: Map<string, ColumnId>): CatalogueAlbum {
  return {
    id: record.id,
    name: record.name,
    uri: record.uri,
    artist: record.artist,
    year: record.year,
    imageUrl: record.imageUrl,
    totalTracks: record.totalTracks,
    durationMs: record.durationMs,
    albumType: record.albumType,
    onBoard: onBoard.get(record.id) ?? null,
  };
}

export function demoSaved(board: Board): CatalogueAlbum[] {
  const onBoard = albumColumnIndex(board);
  return SAVED.map((record) => toCatalogue(record, onBoard));
}

export function demoSearch(query: string, board: Board): CatalogueAlbum[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const onBoard = albumColumnIndex(board);
  return DEMO_ALBUMS.filter(
    (record) =>
      record.name.toLowerCase().includes(needle) || record.artist.toLowerCase().includes(needle),
  ).map((record) => toCatalogue(record, onBoard));
}

export const DEMO_PLAYLISTS: readonly ImportablePlaylist[] = [
  {
    id: 'pl-late-night',
    name: 'Late night',
    trackCount: 84,
    imageUrl: demoArt('Late night'),
    ownerName: 'joe',
    ownedByMe: true,
    unavailable: false,
  },
  {
    id: 'pl-records-to-try',
    name: 'Records to try',
    trackCount: 41,
    imageUrl: demoArt('Records to try'),
    ownerName: 'joe',
    ownedByMe: true,
    unavailable: false,
  },
  {
    id: 'pl-friday',
    name: 'Friday kitchen',
    trackCount: 120,
    imageUrl: demoArt('Friday kitchen'),
    ownerName: 'joe',
    ownedByMe: false,
    unavailable: false,
  },
  {
    // Spotify closed its own editorial and algorithmic playlists to new apps in
    // November 2024; they are listed and marked rather than hidden.
    id: 'pl-discover-weekly',
    name: 'Discover Weekly',
    trackCount: 30,
    imageUrl: demoArt('Discover Weekly'),
    ownerName: 'Spotify',
    ownedByMe: false,
    unavailable: true,
  },
];

/**
 * One playlist read as rows. It carries the three kinds a playlist can hold —
 * a track that resolves to an album, a podcast episode, a local file — because
 * the screen exists to tell them apart.
 */
export function demoPlaylistRows(board: Board): PlaylistTrackRow[] {
  const onBoard = albumColumnIndex(board);
  const rowsFrom = (record: DemoAlbum, trackNumbers: number[], offset: number): PlaylistTrackRow[] =>
    trackNumbers.flatMap((trackNumber, index) => {
      const track = record.tracks.at(trackNumber - 1);
      if (!track) return [];
      return [
        {
          key: String(offset + index),
          title: track.name,
          kind: 'track' as const,
          artist: record.artist,
          album: {
            id: record.id,
            name: record.name,
            totalTracks: record.totalTracks,
            imageUrl: record.imageUrl,
          },
          reason: null,
          onBoard: onBoard.get(record.id) ?? null,
        },
      ];
    });

  return [
    ...rowsFrom(SANTIGOLD, [1, 4], 0),
    ...rowsFrom(THE_SLIP, [5], 2),
    { key: '3', title: 'Death Cab for Cutie — El Dorado', kind: 'episode', showName: 'Song Exploder' },
    ...rowsFrom(SINKING_ISLANDS, [2, 5], 4),
    { key: '6', title: 'untitled sketch 3.m4a', kind: 'local' },
    ...rowsFrom(DO_YOU_FEEL_OK, [1], 7),
  ];
}
