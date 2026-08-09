/**
 * Every scope the app asks for, with the reason it needs one. The login screen
 * renders this table before the redirect, so Spotify's consent screen isn't the
 * first time the listener sees the list.
 */

import type { CopyKey } from '@/lib/copy';

export interface ScopeRow {
  scope: string;
  copyKey: CopyKey;
}

export const SCOPE_ROWS: readonly ScopeRow[] = [
  { scope: 'playlist-modify-private', copyKey: 'login.scope.playlistModify' },
  // Spotify checks a different scope per visibility: `public: false` is checked
  // against playlist-modify-private, `public: true` against this one. Setup
  // offers that choice, so asking for only one of the pair makes the Private
  // switch a 403 waiting to happen.
  { scope: 'playlist-modify-public', copyKey: 'login.scope.playlistModifyPublic' },
  { scope: 'playlist-read-private', copyKey: 'login.scope.playlistRead' },
  { scope: 'user-read-playback-state', copyKey: 'login.scope.readPlayback' },
  { scope: 'user-modify-playback-state', copyKey: 'login.scope.modifyPlayback' },
  { scope: 'user-read-recently-played', copyKey: 'login.scope.recentlyPlayed' },
  { scope: 'user-top-read', copyKey: 'login.scope.topRead' },
  { scope: 'user-library-read', copyKey: 'login.scope.libraryRead' },
  { scope: 'streaming', copyKey: 'login.scope.streaming' },
  // `product` and `country` on /me are withheld without this. Settings reads
  // `product` to name the tier, and reported everyone as Free while it was
  // absent — an undefined field and a free account are indistinguishable.
  { scope: 'user-read-private', copyKey: 'login.scope.readPrivate' },
];

/**
 * `user-read-email` is not in the table because it isn't ours to justify —
 * Auth.js needs it to identify the account, and Spotify shows it regardless.
 */
export const SPOTIFY_SCOPES = [
  'user-read-email',
  ...SCOPE_ROWS.map((row) => row.scope),
].join(' ');

/**
 * Spotify's consent endpoint. Stated here because overriding `authorization`
 * to add scopes replaces the provider's own value rather than merging with it.
 */
export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
