import { describe, expect, it } from 'vitest';
import { suggestionsFromTopTracks } from './suggestions';
import { displayName } from './text';
import { anAlbum, aTrack, KIERAN_HEBDEN_ALBUM } from '@/test/fixtures';

const ants = anAlbum({ id: 'ants', name: 'Ants From Up There' });
const bolt = anAlbum({ id: 'bolt', name: 'Fetch the Bolt Cutters' });
const singleRelease = anAlbum({ id: 'sng', name: 'A Single', album_type: 'single' });
const hits = anAlbum({ id: 'hits', name: 'Greatest Hits', album_type: 'compilation' });

function top(...albums: Array<{ album: ReturnType<typeof anAlbum>; name: string }>) {
  return albums.map(({ album, name }, index) =>
    aTrack({ id: `t${index}`, name, album }),
  );
}

describe('suggestionsFromTopTracks', () => {
  it('groups top songs into the records they came off', () => {
    const result = suggestionsFromTopTracks(
      top(
        { album: ants, name: 'Concorde' },
        { album: ants, name: 'Basketball Shoes' },
      ),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Ants From Up There');
    expect(result[0]?.matches.map((m) => m.name)).toEqual(['Concorde', 'Basketball Shoes']);
  });

  it('ranks a record the listener knows two songs from above one they know better', () => {
    // Two songs off one record is the strongest signal it is worth a pass.
    const result = suggestionsFromTopTracks(
      top(
        { album: bolt, name: 'Shameika' },
        { album: ants, name: 'Concorde' },
        { album: ants, name: 'Basketball Shoes' },
      ),
    );
    expect(result.map((s) => s.id)).toEqual(['ants', 'bolt']);
  });

  it('breaks a tie on the best rank among the matches', () => {
    const result = suggestionsFromTopTracks(
      top(
        { album: bolt, name: 'Shameika' },
        { album: ants, name: 'Concorde' },
      ),
    );
    expect(result.map((s) => s.id)).toEqual(['bolt', 'ants']);
    expect(result[0]?.bestRank).toBe(1);
    expect(result[1]?.bestRank).toBe(2);
  });

  it('records the position in the top songs, never a play count', () => {
    const result = suggestionsFromTopTracks(
      top(
        { album: bolt, name: 'A' },
        { album: bolt, name: 'B' },
      ),
    );
    expect(result[0]?.matches).toEqual([
      { name: 'A', rank: 1 },
      { name: 'B', rank: 2 },
    ]);
  });

  it('leaves singles off the list', () => {
    const result = suggestionsFromTopTracks(top({ album: singleRelease, name: 'A Single' }));
    expect(result).toEqual([]);
  });

  it('leaves compilations off too, because five passes through a hits package is not the exercise', () => {
    expect(suggestionsFromTopTracks(top({ album: hits, name: 'Hit' }))).toEqual([]);
  });

  it('skips a track with no album', () => {
    expect(suggestionsFromTopTracks([{ ...aTrack(), album: undefined }])).toEqual([]);
  });

  it('has nothing to suggest for an account with no listening history', () => {
    expect(suggestionsFromTopTracks([])).toEqual([]);
  });
});

describe('names arrive bounded', () => {
  it('bounds the song a suggestion is offered on', () => {
    const [suggestion] = suggestionsFromTopTracks(
      top({ album: ants, name: KIERAN_HEBDEN_ALBUM }),
    );
    expect(suggestion?.matches[0]?.name).toBe(displayName(KIERAN_HEBDEN_ALBUM));
  });
});
