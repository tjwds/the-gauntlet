/**
 * Access-token lifecycle, kept away from the Auth.js wiring so it can be tested
 * without a framework. The session is a signed cookie and there is no adapter,
 * because there is no database to adapt to.
 */

export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

/** Refresh this far before expiry so a request never races the deadline. */
export const REFRESH_MARGIN_MS = 60_000;

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  error?: 'RefreshFailed';
}

export interface RefreshDeps {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}

export function isExpired(token: Pick<TokenSet, 'expiresAt'>, nowMs: number): boolean {
  return nowMs >= token.expiresAt - REFRESH_MARGIN_MS;
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Trade the refresh token for a new access token. Spotify may or may not hand
 * back a new refresh token; when it doesn't, the old one stays valid.
 */
export async function refreshAccessToken(
  token: TokenSet,
  { clientId, clientSecret, fetchImpl, nowMs }: RefreshDeps,
): Promise<TokenSet> {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = nowMs ?? Date.now();

  try {
    const response = await doFetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${base64(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      return { ...token, error: 'RefreshFailed' };
    }

    const payload = (await response.json()) as RefreshResponse;
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? token.refreshToken,
      expiresAt: now + payload.expires_in * 1000,
    };
  } catch {
    return { ...token, error: 'RefreshFailed' };
  }
}

export function base64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}
