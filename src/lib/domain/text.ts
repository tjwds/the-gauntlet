/**
 * A name is whatever was typed into Spotify, and some records take that
 * literally. Four Tet's 2020 album is titled with 993 characters, 825 of them
 * combining marks — one base character carries 63. The browser pays for each
 * mark twice, once shaping it and once hunting a font that has it, so a title
 * like that costs single-digit milliseconds to lay out where an ordinary one
 * costs none, on every card, drawer, toast and label that names the record.
 * Sixty-three marks on one character also draw far outside their line, over
 * whatever is above and below.
 *
 * Names are therefore bounded where Spotify's objects become this app's, rather
 * than at each place they are drawn: the card, the search that filters it and
 * the label a screen reader announces should all read the same string.
 *
 * Measured on the board card's title, median of 80 re-layouts: 3.9ms before,
 * 1.8ms after, against 0.0ms for `The Dark Side of the Moon`. What is left is
 * the album's 168 base characters, which are symbols and cost what symbols
 * cost — bounding those as well would be a decision about titles, not speed.
 */

/**
 * Combining marks kept per base character. Three leaves the orthographies that
 * genuinely stack them — Thai, Devanagari, pointed Hebrew — untouched, which is
 * why this is a cap per base rather than a strip, and it is what stops any one
 * character from growing tall enough to reach its neighbours.
 */
const MAX_MARKS_PER_BASE = 3;

/**
 * Combining marks kept across the whole name. The per-base cap alone still left
 * 262 of them; this is the limit that does the work. Well clear of any real
 * title — a fully-pointed Hebrew or Thai one of ordinary length spends a few
 * dozen — and it costs a Latin title nothing, because a Latin title composed
 * has none.
 */
const MAX_MARKS = 128;

/**
 * Base characters kept. An outer guard against an unbounded name rather than a
 * layout decision — CSS does the clamping, and at 500 the longest album title
 * anyone cites (Fiona Apple's second record, 444 characters) still arrives
 * whole. Length on its own is cheap: 444 Latin characters lay out in 0.3ms.
 */
const MAX_BASE_CHARS = 500;

const COMBINING_MARK = /\p{M}/u;

/** Marks a name the length guard bit, so the part shown doesn't read as all of it. */
const ELLIPSIS = '…';

/**
 * A name safe to render: composed, with combining marks and overall length
 * bounded. Ordinary names come back exactly as they went in.
 */
export function displayName(value: string): string {
  // Composing first means a decomposed "ế" counts as one character carrying no
  // marks, so the caps never land on text that is merely spelled the long way.
  let out = '';
  let run = 0;
  let marks = 0;
  let bases = 0;

  for (const char of value.normalize('NFC')) {
    if (COMBINING_MARK.test(char)) {
      if (run < MAX_MARKS_PER_BASE && marks < MAX_MARKS) {
        run += 1;
        marks += 1;
        out += char;
      }
      continue;
    }
    if (bases === MAX_BASE_CHARS) return out + ELLIPSIS;
    bases += 1;
    run = 0;
    out += char;
  }

  return out;
}

/** The same bound over a name that may be absent, which is how Spotify sends some of them. */
export function displayNameOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : displayName(value);
}
