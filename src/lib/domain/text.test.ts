import { describe, expect, it } from 'vitest';
import { displayName, displayNameOrNull } from './text';
import { KIERAN_HEBDEN_ALBUM } from '@/test/fixtures';

const MARK = /\p{M}/u;

/** U+0301, on a base that has no precomposed form with it — so NFC leaves the pair alone. */
const ACUTE = '́';
const stack = (n: number) => `x${ACUTE.repeat(n)}`;

const marksIn = (value: string) => [...value].filter((char) => MARK.test(char)).length;
const visible = (value: string) => [...value].filter((char) => !MARK.test(char)).join('');

/** The longest run of combining marks on any one base character. */
function deepestStack(value: string): number {
  let deepest = 0;
  let run = 0;
  for (const char of value) {
    run = MARK.test(char) ? run + 1 : 0;
    if (run > deepest) deepest = run;
  }
  return deepest;
}

describe('displayName', () => {
  it('leaves an ordinary title exactly as it was', () => {
    expect(displayName('In Rainbows')).toBe('In Rainbows');
  });

  it('leaves a long title whole — length on its own costs nothing to lay out', () => {
    const fionaApple =
      'When the Pawn Hits the Conflicts He Thinks like a King What He Says like a ' +
      'Blade Sharp Enough to Cut the Nail Into the Cuticle of the Middle Finger';
    expect(displayName(fionaApple)).toBe(fionaApple);
  });

  it.each([
    ['Thai, a vowel and a tone on one consonant', 'เกี้ยว'],
    ['Devanagari, virama and vowel signs', 'क्षिति'],
    ['Hebrew with points', 'שָׁלוֹם'],
  ])('leaves %s alone', (_label, name) => {
    expect(displayName(name)).toBe(name);
  });

  it('composes first, so a decomposed name is spelled the short way', () => {
    expect(displayName('Björk')).toBe('Björk');
    expect(marksIn(displayName('Björk'))).toBe(0);
  });

  it('caps a single base character at three marks', () => {
    expect(displayName(stack(20))).toBe(stack(3));
  });

  it('counts that cap per base, so the next character starts again', () => {
    expect(displayName(`${stack(5)}${stack(5)}`)).toBe(`${stack(3)}${stack(3)}`);
  });

  it('keeps marks that lead a name, which have no base of their own', () => {
    expect(displayName(ACUTE.repeat(5))).toBe(ACUTE.repeat(3));
  });

  it('spends at most 128 marks across the whole name', () => {
    // 60 bases asking for 9 marks each: 180 survive the per-base cap, 128 the budget.
    const capped = displayName(stack(9).repeat(60));
    expect(marksIn(capped)).toBe(128);
    expect(visible(capped)).toBe('x'.repeat(60));
  });

  it('truncates past 500 base characters and says so', () => {
    const capped = displayName('ab'.repeat(400));
    expect(capped).toHaveLength(501);
    expect(capped.endsWith('…')).toBe(true);
  });

  it('leaves a name of exactly 500 base characters untouched', () => {
    const exact = 'a'.repeat(500);
    expect(displayName(exact)).toBe(exact);
  });

  it('counts bases rather than code points, so marks cannot eat the length guard', () => {
    expect(visible(displayName(stack(3).repeat(200)))).toBe('x'.repeat(200));
  });

  it('copes with an empty name', () => {
    expect(displayName('')).toBe('');
  });

  /**
   * The record the caps exist for. 993 characters, 825 of them combining marks,
   * 63 of those stacked on one base — enough to draw over the cards above and
   * below it and to cost milliseconds every time the board lays it out.
   */
  it('bounds the Four Tet title that made the board sluggish', () => {
    expect(marksIn(KIERAN_HEBDEN_ALBUM)).toBe(825);
    expect(deepestStack(KIERAN_HEBDEN_ALBUM)).toBe(63);

    const capped = displayName(KIERAN_HEBDEN_ALBUM);
    expect(marksIn(capped)).toBe(128);
    expect(deepestStack(capped)).toBeLessThanOrEqual(3);
    expect([...capped]).toHaveLength(296);
  });

  it('keeps every visible character of that title — only marks are dropped', () => {
    expect(visible(displayName(KIERAN_HEBDEN_ALBUM))).toBe(visible(KIERAN_HEBDEN_ALBUM));
  });
});

describe('displayNameOrNull', () => {
  it('bounds a name that is there', () => {
    expect(displayNameOrNull(stack(9))).toBe(stack(3));
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('passes %s through', (_label, value) => {
    expect(displayNameOrNull(value)).toBeNull();
  });
});
