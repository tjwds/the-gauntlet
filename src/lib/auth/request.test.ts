import { describe, expect, it } from 'vitest';
import { onConfiguredOrigin } from './request';

const ORIGIN = 'http://127.0.0.1:3434';

// Next reports request.url as the hostname the server is bound to — always
// `localhost` in development, whatever the browser actually asked for.
const AS_NEXT_SEES_IT = 'http://localhost:3434/api/auth/signin/spotify';

describe('onConfiguredOrigin', () => {
  it('moves the request onto the configured origin', () => {
    // Spotify only redirects back to the loopback IP, and Auth.js reads the
    // redirect_uri straight off this URL.
    const moved = onConfiguredOrigin(new Request(AS_NEXT_SEES_IT), ORIGIN);
    expect(moved.url).toBe('http://127.0.0.1:3434/api/auth/signin/spotify');
  });

  it('keeps the path and query, which carry the OAuth code', () => {
    const moved = onConfiguredOrigin(
      new Request('http://localhost:3434/api/auth/callback/spotify?code=abc&state=xyz'),
      ORIGIN,
    );
    expect(moved.url).toBe('http://127.0.0.1:3434/api/auth/callback/spotify?code=abc&state=xyz');
  });

  it('carries the method, headers and body of a sign-in POST', async () => {
    const original = new Request(AS_NEXT_SEES_IT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'a=b' },
      body: 'csrfToken=token',
    });
    const moved = onConfiguredOrigin(original, ORIGIN);

    expect(moved.method).toBe('POST');
    expect(moved.headers.get('cookie')).toBe('a=b');
    await expect(moved.text()).resolves.toBe('csrfToken=token');
  });

  it('leaves a request already on that origin untouched', () => {
    const original = new Request(`${ORIGIN}/api/auth/session`);
    expect(onConfiguredOrigin(original, ORIGIN)).toBe(original);
  });

  it('does nothing when no origin is configured', () => {
    const original = new Request(AS_NEXT_SEES_IT);
    expect(onConfiguredOrigin(original, undefined)).toBe(original);
    expect(onConfiguredOrigin(original, '')).toBe(original);
  });

  it('does nothing rather than break the handshake over a malformed origin', () => {
    const original = new Request(AS_NEXT_SEES_IT);
    expect(onConfiguredOrigin(original, 'not a url')).toBe(original);
  });

  it('moves a deployment onto its own origin too', () => {
    const moved = onConfiguredOrigin(
      new Request('http://localhost:3000/api/auth/callback/spotify'),
      'https://gauntlet.joewoods.dev',
    );
    expect(moved.url).toBe('https://gauntlet.joewoods.dev/api/auth/callback/spotify');
  });

  it('reads process.env by default', () => {
    process.env.APP_ORIGIN = ORIGIN;
    expect(onConfiguredOrigin(new Request(AS_NEXT_SEES_IT)).url).toBe(
      'http://127.0.0.1:3434/api/auth/signin/spotify',
    );
    delete process.env.APP_ORIGIN;
  });
});
