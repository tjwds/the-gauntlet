import { describe, expect, it } from 'vitest';
import {
  albumDuration,
  albumOrder,
  albumsFromPlaylistItems,
  isFullAlbum,
  joinArtists,
  parseAlbumRef,
  pickImage,
  playlistTrack,
  summariseAlbum,
} from './albums';
import { displayName } from './text';
import {
  albumTracks,
  anAlbum,
  aTrack,
  KIERAN_HEBDEN_ALBUM,
  playlistEntries,
} from '@/test/fixtures';

describe('pickImage', () => {
  it('takes the smallest image that still covers the drawer at 112px', () => {
    expect(
      pickImage({
        images: [
          { url: 'big', height: 640, width: 640 },
          { url: 'mid', height: 300, width: 300 },
          { url: 'tiny', height: 64, width: 64 },
        ],
      }),
    ).toBe('mid');
  });

  it('falls back to the largest when nothing is big enough', () => {
    expect(
      pickImage({
        images: [
          { url: 'small', height: 160, width: 160 },
          { url: 'tiny', height: 64, width: 64 },
        ],
      }),
    ).toBe('small');
  });

  it('copes with art that carries no dimensions', () => {
    expect(pickImage({ images: [{ url: 'only', height: null, width: null }] })).toBe('only');
  });

  it('copes with an album that has no art', () => {
    expect(pickImage({ images: [] })).toBeNull();
  });

  it('copes with an album Spotify sent no images field for', () => {
    expect(pickImage({})).toBeNull();
  });
});

describe('joinArtists', () => {
  it('joins collaborators', () => {
    expect(joinArtists([{ name: 'Danger Mouse' }, { name: 'Black Thought' }])).toBe(
      'Danger Mouse, Black Thought',
    );
  });

  it('copes with nothing', () => {
    expect(joinArtists(undefined)).toBe('');
  });
});

describe('playlistTrack', () => {
  it('prefers item over the deprecated track field', () => {
    const item = aTrack({ id: 'from-item' });
    const track = aTrack({ id: 'from-track' });
    expect(playlistTrack({ added_at: '', item, track })?.id).toBe('from-item');
  });

  it('falls back to track when item is absent', () => {
    const track = aTrack({ id: 'from-track' });
    expect(playlistTrack({ added_at: '', track })?.id).toBe('from-track');
  });

  it('returns null when there is neither', () => {
    expect(playlistTrack({ added_at: '' })).toBeNull();
    expect(playlistTrack({ added_at: '', item: null, track: null })).toBeNull();
  });
});

describe('albumOrder', () => {
  it('sorts by disc, then track number', () => {
    const t = (discNumber: number, trackNumber: number) => ({
      id: `${discNumber}-${trackNumber}`,
      name: '',
      durationMs: 0,
      trackNumber,
      discNumber,
      uri: '',
    });
    const sorted = [t(2, 1), t(1, 9), t(1, 2)].sort(albumOrder).map((x) => x.id);
    expect(sorted).toEqual(['1-2', '1-9', '2-1']);
  });
});

describe('albumsFromPlaylistItems', () => {
  const album = anAlbum({ id: 'alb1', total_tracks: 3 });

  it('turns a run of tracks into one card', () => {
    const entries = playlistEntries(albumTracks(album, 3), '2026-07-06T10:00:00.000Z');
    const [card] = albumsFromPlaylistItems(entries);
    expect(card?.id).toBe('alb1');
    expect(card?.name).toBe('In Rainbows');
    expect(card?.artist).toBe('Radiohead');
    expect(card?.year).toBe('2007');
    expect(card?.tracks).toHaveLength(3);
    expect(card?.durationMs).toBe(3 * 237_000);
  });

  it('puts the tracks in album order however the playlist holds them', () => {
    const tracks = albumTracks(album, 3);
    const shuffled = [tracks[2], tracks[0], tracks[1]].filter(Boolean);
    const entries = playlistEntries(shuffled as typeof tracks, '2026-07-06T10:00:00.000Z');
    expect(albumsFromPlaylistItems(entries)[0]?.tracks.map((t) => t.trackNumber)).toEqual([1, 2, 3]);
  });

  it('keeps albums in the order they first appear', () => {
    const other = anAlbum({ id: 'alb2', name: 'Kid A' });
    const entries = [
      ...playlistEntries(albumTracks(other, 1), '2026-07-01T10:00:00.000Z'),
      ...playlistEntries(albumTracks(album, 1), '2026-07-02T10:00:00.000Z'),
    ];
    expect(albumsFromPlaylistItems(entries).map((a) => a.id)).toEqual(['alb2', 'alb1']);
  });

  it('takes the earliest added_at as the arrival in the column', () => {
    const tracks = albumTracks(album, 2);
    const entries = [
      { added_at: '2026-07-06T10:00:05.000Z', item: tracks[0] as (typeof tracks)[0] },
      { added_at: '2026-07-06T10:00:01.000Z', item: tracks[1] as (typeof tracks)[0] },
    ];
    expect(albumsFromPlaylistItems(entries)[0]?.addedAt).toBe('2026-07-06T10:00:01.000Z');
  });

  it('drops local files, which cannot be part of an album', () => {
    const entries = playlistEntries(
      [aTrack({ id: 'local', is_local: true, album })],
      '2026-07-06T10:00:00.000Z',
    );
    expect(albumsFromPlaylistItems(entries)).toEqual([]);
  });

  it('drops tracks with no id', () => {
    const entries = playlistEntries([aTrack({ id: null, album })], '2026-07-06T10:00:00.000Z');
    expect(albumsFromPlaylistItems(entries)).toEqual([]);
  });

  it('drops entries with no track at all', () => {
    expect(albumsFromPlaylistItems([{ added_at: '2026-07-06T10:00:00.000Z', item: null }])).toEqual([]);
  });

  it('drops a track with no album', () => {
    const entries = playlistEntries(
      [{ ...aTrack(), album: undefined }],
      '2026-07-06T10:00:00.000Z',
    );
    expect(albumsFromPlaylistItems(entries)).toEqual([]);
  });

  it('counts a track listed twice once', () => {
    const track = albumTracks(album, 1)[0] as ReturnType<typeof aTrack>;
    const entries = playlistEntries([track, track], '2026-07-06T10:00:00.000Z');
    expect(albumsFromPlaylistItems(entries)[0]?.tracks).toHaveLength(1);
  });
});

describe('summariseAlbum and albumDuration', () => {
  it('summarises without a runtime when there are no tracks to add up', () => {
    expect(summariseAlbum(anAlbum()).durationMs).toBe(0);
  });

  it('adds up a fully-fetched album', () => {
    const album = anAlbum();
    const withTracks = {
      ...album,
      tracks: { items: albumTracks(album, 4), next: null, total: 4, limit: 50, offset: 0 },
    };
    expect(albumDuration(withTracks)).toBe(4 * 237_000);
  });

  it('adds up to nothing when tracks were not fetched', () => {
    expect(albumDuration(anAlbum())).toBe(0);
  });
});

describe('isFullAlbum', () => {
  it.each([
    ['album', true],
    ['single', false],
    ['compilation', false],
  ] as const)('%s -> %s', (albumType, expected) => {
    expect(isFullAlbum({ album_type: albumType })).toBe(expected);
  });
});

describe('parseAlbumRef', () => {
  it.each([
    ['spotify:album:4Gfnly5CzMJQqkUFfoHaP3', '4Gfnly5CzMJQqkUFfoHaP3'],
    ['https://open.spotify.com/album/4Gfnly5CzMJQqkUFfoHaP3', '4Gfnly5CzMJQqkUFfoHaP3'],
    ['https://open.spotify.com/album/4Gfnly5CzMJQqkUFfoHaP3?si=abc', '4Gfnly5CzMJQqkUFfoHaP3'],
    ['https://open.spotify.com/intl-de/album/4Gfnly5CzMJQqkUFfoHaP3', '4Gfnly5CzMJQqkUFfoHaP3'],
    ['  spotify:album:abc123  ', 'abc123'],
  ])('reads %s', (input, expected) => {
    expect(parseAlbumRef(input)).toBe(expected);
  });

  it.each([
    'weyes blood',
    'spotify:track:4Gfnly5CzMJQqkUFfoHaP3',
    'https://open.spotify.com/playlist/abc',
    '',
  ])('refuses %s', (input) => {
    expect(parseAlbumRef(input)).toBeNull();
  });
});

/**
 * The board takes whatever Spotify holds, and one record holds a thousand
 * characters of stacked combining marks. Bounding it here rather than at each
 * render site is what keeps a card, its search filter and its aria-label
 * saying the same thing — see `displayName`.
 */
describe('names arrive bounded', () => {
  const bounded = displayName(KIERAN_HEBDEN_ALBUM);

  it('bounds an album name', () => {
    expect(summariseAlbum(anAlbum({ name: KIERAN_HEBDEN_ALBUM })).name).toBe(bounded);
  });

  it('bounds an artist name', () => {
    expect(joinArtists([{ name: KIERAN_HEBDEN_ALBUM }, { name: 'Four Tet' }])).toBe(
      `${bounded}, Four Tet`,
    );
  });

  it('bounds a track name', () => {
    const entries = playlistEntries(
      [aTrack({ name: KIERAN_HEBDEN_ALBUM })],
      '2026-07-06T10:00:00.000Z',
    );
    expect(albumsFromPlaylistItems(entries)[0]?.tracks[0]?.name).toBe(bounded);
  });
});
