/**
 * Every user-facing string comes from ui-copy.json, so wording is edited in one
 * place rather than hunted across the app. `translation` is the live value;
 * `original` is the string it was drafted from, kept so a tone edit is legible
 * as a change rather than as the only version there has ever been.
 */

import catalogue from '../../ui-copy.json';

type Entry = { context: string; original: string; translation: string };
type Catalogue = Record<string, Entry>;

export type CopyKey = Exclude<keyof typeof catalogue, '_readme'>;

const entries = catalogue as unknown as Catalogue;

export type CopyParams = Record<string, string | number>;

/** The raw string, braces unfilled. A missing key returns the key itself. */
function template(key: CopyKey): string {
  const entry = entries[key];
  if (!entry) return key;
  return entry.translation || entry.original;
}

function fill(value: string, params: CopyParams): string {
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Look up a string and fill its `{braces}`. A key with no entry returns the key
 * itself, which is loud enough to notice in the UI and harmless in production.
 */
export function t(key: CopyKey, params: CopyParams = {}): string {
  return fill(template(key), params);
}

/** A run of a filled string, marked where it came from the named value. */
export interface CopyPart {
  text: string;
  emphasis: boolean;
}

/**
 * Fill a string but keep the boundary of one value, so a component can style it
 * without markup living in the copy. `add.tracks.sub` emphasises the album,
 * because it — not the track the tick sits on — is what gets added.
 */
export function emphasise(key: CopyKey, name: string, params: CopyParams = {}): CopyPart[] {
  const value = name in params ? String(params[name]) : `{${name}}`;
  return template(key)
    .split(`{${name}}`)
    .flatMap((part, index) => [
      ...(index === 0 ? [] : [{ text: value, emphasis: true }]),
      { text: fill(part, params), emphasis: false },
    ])
    .filter((part) => part.text !== '');
}

export interface CopySegment {
  text: string;
  href?: string;
}

/**
 * Split a string carrying one markdown link into segments. Only `login.blurb`
 * needs it, but keeping it general means a future string with a link doesn't
 * have to be special-cased in a component.
 */
export function segments(key: CopyKey, params: CopyParams = {}): CopySegment[] {
  return splitLinks(t(key, params));
}

/** The same split over a raw string, which is what makes it testable in isolation. */
export function splitLinks(value: string): CopySegment[] {
  const result: CopySegment[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let match = pattern.exec(value);
  while (match !== null) {
    if (match.index > cursor) result.push({ text: value.slice(cursor, match.index) });
    result.push({ text: match[1] as string, href: match[2] as string });
    cursor = match.index + match[0].length;
    match = pattern.exec(value);
  }
  if (cursor < value.length) result.push({ text: value.slice(cursor) });
  return result;
}

/** `1 play` / `2 plays`, `1 album selected` / `2 albums selected`. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Present for tests and tooling: the keys that exist. */
export function copyKeys(): CopyKey[] {
  return Object.keys(entries).filter((key) => key !== '_readme') as CopyKey[];
}
