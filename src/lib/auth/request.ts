/**
 * Putting the OAuth handshake on the origin the browser is actually using.
 *
 * Two things conspire here. Next reports `request.url` as the hostname the
 * server is bound to — in development always `localhost`, whatever the browser
 * asked for. And Auth.js derives `redirect_uri` from that URL, so the callback
 * it registers with Spotify is `http://localhost:<port>/…`.
 *
 * Spotify stopped accepting `localhost` in redirect URIs: an insecure-HTTP
 * callback has to name the loopback IP literally. So `redirect_uri` has to say
 * `127.0.0.1`, which means the browser has to be on `127.0.0.1` too — same
 * server, different origin, and a cookie set on one is never sent to the other.
 * Get that wrong and the callback fails with `InvalidCheck: pkceCodeVerifier
 * value could not be parsed`, which says nothing about hostnames.
 *
 * Auth.js has `AUTH_URL` for exactly this, and under Next 16 it does nothing:
 * its rewrite rebuilds a `NextRequest`, and `new NextRequest(url, req)` resolves
 * the URL against Next's own base rather than keeping the one it's handed. A
 * plain `Request` does keep it, which is why this rebuilds one — and why the
 * origin is read from `APP_ORIGIN` rather than `AUTH_URL`. Setting `AUTH_URL`
 * would make Auth.js run its own rewrite over a plain `Request`, which has no
 * `nextUrl` for it to read, and the route would throw.
 */

export const APP_ORIGIN_VAR = 'APP_ORIGIN';

/**
 * The same request against the configured origin, or the request untouched when
 * there's nothing to change.
 */
export function onConfiguredOrigin(
  request: Request,
  configured = process.env[APP_ORIGIN_VAR],
): Request {
  if (!configured) return request;

  let origin: URL;
  let target: URL;
  try {
    origin = new URL(configured);
    target = new URL(request.url);
  } catch {
    // A malformed APP_ORIGIN shouldn't take the handshake down with it.
    return request;
  }

  if (target.origin === origin.origin) return request;

  // Set hostname and port separately: assigning `host` without a port leaves
  // the old one in place, so a deployment would keep the dev server's port.
  target.protocol = origin.protocol;
  target.hostname = origin.hostname;
  target.port = origin.port;

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(target, {
    method: request.method,
    headers: request.headers,
    ...(hasBody
      ? // `duplex` is required for a streamed body and isn't in the DOM types.
        ({ body: request.body, duplex: 'half' } as RequestInit)
      : {}),
    redirect: 'manual',
    signal: request.signal,
  });
}
