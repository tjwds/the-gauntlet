/**
 * The Auth.js callbacks, exercised directly. The session is a signed cookie with
 * no adapter, because there's no database to adapt to — so these two callbacks
 * are the entire session lifecycle.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenSet } from '@/lib/auth/token';

const mocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  nextAuth: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
  spotify: vi.fn((config: unknown) => ({ id: 'spotify', config })),
}));

vi.mock('next-auth', () => ({ default: mocks.nextAuth }));
vi.mock('next-auth/providers/spotify', () => ({ default: mocks.spotify }));
vi.mock('@/lib/auth/token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/token')>();
  return { ...actual, refreshAccessToken: mocks.refreshAccessToken };
});

const { authConfig } = await import('./auth');

// Captured at import time: the provider factory runs once, and the shared
// afterEach clears mock call history before the second test could read it.
const providerConfig = mocks.spotify.mock.calls[0]?.[0] as {
  authorization: { url: string; params: { scope: string } };
};

// Auth.js types these against its own JWT and Session shapes; the tests only
// care about the fields this app puts on them.
const jwt = authConfig.callbacks?.jwt as unknown as (
  args: unknown,
) => Promise<Record<string, unknown>>;
const session = authConfig.callbacks?.session as unknown as (args: unknown) => Promise<{
  accessToken?: string;
  scopes?: string;
  error?: string;
  user: { id?: string };
}>;

const NOW = Date.parse('2026-07-01T12:00:00.000Z');
const fresh: TokenSet = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: NOW + 3_600_000,
};


beforeEach(() => {
  vi.setSystemTime(NOW);
  mocks.refreshAccessToken.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the Spotify provider', () => {
  it('names the consent endpoint, since overriding it replaces the default', () => {
    // Auth.js declares Spotify's `authorization` as a plain string, so an
    // object here replaces it whole. Passing only `params` leaves no endpoint,
    // and the sign-in fails with "Invalid URL" at the moment of redirect.
    const { url } = providerConfig.authorization;
    expect(() => new URL(url)).not.toThrow();
    expect(url).toBe('https://accounts.spotify.com/authorize');
  });

  it('asks for every scope the app needs, and no more', () => {
    const scopes = providerConfig.authorization.params.scope.split(' ');
    expect(scopes).toEqual([
      'user-read-email',
      'playlist-modify-private',
      // Setup can create the seven public, and Spotify checks that against a
      // different scope than the private case.
      'playlist-modify-public',
      'playlist-read-private',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-recently-played',
      'user-top-read',
      'user-library-read',
      'streaming',
      // Without it Spotify withholds `product`, and Settings calls every
      // account Free rather than saying it doesn't know.
      'user-read-private',
    ]);
  });

  it('keeps the session in a cookie, with no adapter behind it', () => {
    expect(authConfig.session?.strategy).toBe('jwt');
    expect(authConfig.adapter).toBeUndefined();
  });

  it('sends failures back to the login screen, which explains them', () => {
    expect(authConfig.pages).toEqual({ signIn: '/login', error: '/login' });
  });
});

describe('the jwt callback', () => {
  it('stores the tokens Spotify handed back at sign-in', async () => {
    const token = await jwt({
      token: {},
      account: { access_token: 'a', refresh_token: 'r', expires_at: NOW / 1000 + 3600 },
      profile: { id: 'joe' },
    });
    expect(token.spotify).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: NOW + 3_600_000,
    });
    expect(token.spotifyId).toBe('joe');
  });

  it('records the scopes Spotify actually granted', async () => {
    // Not always what was asked for: an older grant gets reused silently, and
    // the symptom is a 403 on an endpoint the app plainly has a scope for.
    const token = await jwt({
      token: {},
      account: {
        access_token: 'a',
        refresh_token: 'r',
        expires_at: NOW / 1000 + 3600,
        scope: 'user-read-email streaming',
      },
      profile: { id: 'joe' },
    });
    expect(token.spotifyScopes).toBe('user-read-email streaming');
  });

  it('copes with a grant that reported no scopes', async () => {
    const token = await jwt({
      token: {},
      account: { access_token: 'a', refresh_token: 'r', expires_at: NOW / 1000 + 3600 },
      profile: { id: 'joe' },
    });
    expect(token.spotifyScopes).toBeUndefined();
  });

  it('copes with a profile carrying no id', async () => {
    const token = await jwt({
      token: {},
      account: { access_token: 'a', refresh_token: 'r', expires_at: NOW / 1000 + 3600 },
      profile: {},
    });
    expect(token.spotifyId).toBeUndefined();
  });

  it('copes with no profile at all', async () => {
    const token = await jwt({
      token: {},
      account: { access_token: 'a', refresh_token: 'r', expires_at: NOW / 1000 + 3600 },
      profile: null,
    });
    expect(token.spotify).toBeDefined();
  });

  it('leaves a token alone that has not expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const token = await jwt({ token: { spotify: fresh }, account: null });
    expect(token.spotify).toEqual(fresh);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes a token that is about to expire', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const refreshed = { ...fresh, accessToken: 'new' };
    mocks.refreshAccessToken.mockResolvedValue(refreshed);

    const token = await jwt({
      token: { spotify: { ...fresh, expiresAt: NOW + 1000 } },
      account: null,
    });
    expect(token.spotify).toEqual(refreshed);
  });

  it('passes the app credentials to the refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.AUTH_SPOTIFY_ID = 'the-id';
    process.env.AUTH_SPOTIFY_SECRET = 'the-secret';
    mocks.refreshAccessToken.mockResolvedValue(fresh);

    await jwt({ token: { spotify: { ...fresh, expiresAt: 0 } }, account: null });
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(expect.anything(), {
      clientId: 'the-id',
      clientSecret: 'the-secret',
    });

    delete process.env.AUTH_SPOTIFY_ID;
    delete process.env.AUTH_SPOTIFY_SECRET;
  });

  it('falls back to empty credentials when the instance has none configured', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.refreshAccessToken.mockResolvedValue(fresh);
    await jwt({ token: { spotify: { ...fresh, expiresAt: 0 } }, account: null });
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(expect.anything(), {
      clientId: '',
      clientSecret: '',
    });
  });

  it('leaves a token with no Spotify tokens on it alone', async () => {
    const token = await jwt({ token: { sub: 'x' }, account: null });
    expect(token).toEqual({ sub: 'x' });
  });
});

describe('the session callback', () => {
  it('hands the access token to the page', async () => {
    const result = await session({
      session: { user: {} },
      token: { spotify: fresh, spotifyId: 'joe' },
    });
    expect(result.accessToken).toBe('access');
    expect(result.user.id).toBe('joe');
    expect(result.error).toBeUndefined();
  });

  it('hands the granted scopes to the page', async () => {
    const result = await session({
      session: { user: {} },
      token: { spotify: fresh, spotifyScopes: 'user-read-email streaming' },
    });
    expect(result.scopes).toBe('user-read-email streaming');
  });

  it('flags a refresh that failed, so the app asks for a fresh sign-in', async () => {
    const result = await session({
      session: { user: {} },
      token: { spotify: { ...fresh, error: 'RefreshFailed' } },
    });
    expect(result.error).toBe('RefreshFailed');
  });

  it('copes with a token carrying nothing of ours', async () => {
    const result = await session({ session: { user: {} }, token: {} });
    expect(result.accessToken).toBeUndefined();
    expect(result.user.id).toBeUndefined();
  });
});
