import { describe, expect, it, vi } from 'vitest';
import {
  base64,
  isExpired,
  refreshAccessToken,
  REFRESH_MARGIN_MS,
  SPOTIFY_TOKEN_URL,
  type TokenSet,
} from './token';

const NOW = Date.parse('2026-07-01T12:00:00.000Z');

const token: TokenSet = {
  accessToken: 'old-access',
  refreshToken: 'the-refresh',
  expiresAt: NOW + 3_600_000,
};

const deps = { clientId: 'id', clientSecret: 'secret', nowMs: NOW };

function respond(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
}

describe('isExpired', () => {
  it('is false well before the deadline', () => {
    expect(isExpired(token, NOW)).toBe(false);
  });

  it('is true inside the margin, so no request races the expiry', () => {
    expect(isExpired(token, token.expiresAt - REFRESH_MARGIN_MS)).toBe(true);
    expect(isExpired(token, token.expiresAt - REFRESH_MARGIN_MS - 1)).toBe(false);
  });

  it('is true after the deadline', () => {
    expect(isExpired(token, token.expiresAt + 1)).toBe(true);
  });
});

describe('refreshAccessToken', () => {
  it('trades the refresh token for a new access token', async () => {
    const fetchImpl = respond({ access_token: 'new-access', expires_in: 3600 });
    const result = await refreshAccessToken(token, { ...deps, fetchImpl: fetchImpl as typeof fetch });

    expect(result).toEqual({
      accessToken: 'new-access',
      refreshToken: 'the-refresh',
      expiresAt: NOW + 3_600_000,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SPOTIFY_TOKEN_URL);
    expect(init.body).toBe('grant_type=refresh_token&refresh_token=the-refresh');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${base64('id:secret')}`,
    );
  });

  it('takes a rotated refresh token when Spotify sends one', async () => {
    const fetchImpl = respond({ access_token: 'a', expires_in: 60, refresh_token: 'rotated' });
    const result = await refreshAccessToken(token, { ...deps, fetchImpl: fetchImpl as typeof fetch });
    expect(result.refreshToken).toBe('rotated');
  });

  it('keeps the old refresh token when Spotify sends none', async () => {
    const fetchImpl = respond({ access_token: 'a', expires_in: 60 });
    const result = await refreshAccessToken(token, { ...deps, fetchImpl: fetchImpl as typeof fetch });
    expect(result.refreshToken).toBe('the-refresh');
  });

  it('flags a refusal rather than throwing, so the session can ask for a fresh sign-in', async () => {
    const fetchImpl = respond({ error: 'invalid_grant' }, false);
    const result = await refreshAccessToken(token, { ...deps, fetchImpl: fetchImpl as typeof fetch });
    expect(result).toEqual({ ...token, error: 'RefreshFailed' });
  });

  it('flags a network failure the same way', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const result = await refreshAccessToken(token, { ...deps, fetchImpl: fetchImpl as typeof fetch });
    expect(result.error).toBe('RefreshFailed');
  });

  it('falls back to the global fetch and the real clock', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = respond({ access_token: 'a', expires_in: 10 }) as unknown as typeof fetch;
    const result = await refreshAccessToken(token, { clientId: 'id', clientSecret: 'secret' });
    expect(result.accessToken).toBe('a');
    expect(result.expiresAt).toBeGreaterThan(0);
    globalThis.fetch = original;
  });
});

describe('base64', () => {
  it('encodes the client credentials the way the token endpoint wants', () => {
    expect(base64('id:secret')).toBe('aWQ6c2VjcmV0');
  });
});
