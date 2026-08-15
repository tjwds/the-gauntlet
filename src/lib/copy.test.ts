import { describe, expect, it } from 'vitest';
import { copyKeys, emphasise, plural, segments, splitLinks, t, type CopyKey } from './copy';

describe('t', () => {
  it('returns a plain string', () => {
    expect(t('app.name')).toBe('The Gauntlet');
    expect(t('login.cta')).toBe('Log in with Spotify');
  });

  it('fills the braces', () => {
    expect(t('card.dots.label', { n: 3 })).toBe('3 of 5');
    expect(t('album.sinceLine', { column: '×3', date: '6 July' })).toBe('In ×3 since 6 July.');
  });

  it('leaves a brace it was given nothing for, so the gap is visible', () => {
    expect(t('card.dots.label')).toBe('{n} of 5');
  });

  it('returns the key itself for a string that does not exist', () => {
    expect(t('nope.not.here' as CopyKey)).toBe('nope.not.here');
  });

  it('writes stage names with a multiplication sign', () => {
    expect(t('column.stage.name', { n: 2 })).toBe('×2');
  });

  it('holds every string in the product, and only those', () => {
    const keys = copyKeys();
    expect(keys).toHaveLength(159);
    expect(keys).not.toContain('_readme');
  });

  it('has no empty strings left in it', () => {
    for (const key of copyKeys()) {
      expect(t(key), key).not.toBe('');
    }
  });
});

describe('segments', () => {
  it('splits the login blurb around its link', () => {
    const parts = segments('login.blurb');
    expect(parts).toHaveLength(3);
    expect(parts[0]?.text).toBe('A kanban visualization tool for ');
    expect(parts[1]?.text).toBe(
      "Joe's system for giving records a fair shake by listening to them five times",
    );
    expect(parts[1]?.href).toBe(
      'https://blog.joewoods.dev/music/the-album-gauntlet-over-engineered-music-appreciation/',
    );
    expect(parts[2]?.text).toBe('.');
  });

  it('returns one plain segment for a string with no link', () => {
    expect(segments('login.cta')).toEqual([{ text: 'Log in with Spotify' }]);
  });

  it('returns nothing for an empty string', () => {
    expect(segments('_readme' as CopyKey)).toEqual([]);
  });
});

describe('emphasise', () => {
  it('keeps the boundary of the named value, filling the rest', () => {
    expect(emphasise('add.tracks.sub', 'album', { artist: 'Fiona Apple', album: 'Fetch the Bolt Cutters' })).toEqual([
      { text: 'Fiona Apple · from ', emphasis: false },
      { text: 'Fetch the Bolt Cutters', emphasis: true },
    ]);
  });

  it('marks the value when it opens the string', () => {
    expect(emphasise('add.playlist.meta', 'owner', { owner: 'You', n: 62 })).toEqual([
      { text: 'You', emphasis: true },
      { text: ' · 62 tracks', emphasis: false },
    ]);
  });

  it('leaves a brace it was given nothing for, so the gap is visible', () => {
    expect(emphasise('add.tracks.sub', 'album', { artist: 'Yard Act' })).toEqual([
      { text: 'Yard Act · from ', emphasis: false },
      { text: '{album}', emphasis: true },
    ]);
  });

  it('returns one plain part when the string has no such value', () => {
    expect(emphasise('add.tracks.clear', 'album')).toEqual([{ text: 'Clear', emphasis: false }]);
  });
});

describe('splitLinks', () => {
  it('copes with a string that opens with its link', () => {
    expect(splitLinks('[Read the post](https://example.com) first.')).toEqual([
      { text: 'Read the post', href: 'https://example.com' },
      { text: ' first.' },
    ]);
  });

  it('handles more than one link', () => {
    expect(splitLinks('[a](1) and [b](2)')).toEqual([
      { text: 'a', href: '1' },
      { text: ' and ' },
      { text: 'b', href: '2' },
    ]);
  });
});

describe('plural', () => {
  it('picks the singular at one', () => {
    expect(plural(1, '1 play', '2 plays')).toBe('1 play');
    expect(plural(0, 'one', 'many')).toBe('many');
    expect(plural(2, 'one', 'many')).toBe('many');
  });
});
