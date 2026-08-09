/**
 * Shared plumbing for the route handlers: session in, Spotify client out, and
 * one place that decides what a Spotify failure looks like to the browser.
 */

import { auth } from '@/auth';
import { SpotifyClient } from '@/lib/spotify/client';
import { BoardWriteError } from '@/lib/board/service';
import { isSpotifyError, type SpotifyError } from '@/lib/spotify/errors';
import { DEFAULT_SEMANTICS, type PlayedAtSemantics } from '@/lib/domain/pass';

export interface ApiContext {
  client: SpotifyClient;
  accessToken: string;
  userId: string | undefined;
  /** Space-separated scopes Spotify granted, when the session recorded them. */
  scopes: string | undefined;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * `reason` is Spotify's machine-readable name for a player refusal, passed on
 * so the browser can say something better than the prose beside it — matching
 * on the message would mean string-matching Spotify's wording.
 */
export function jsonError(status: number, message: string, reason?: string | null): Response {
  return json({ error: message, ...(reason ? { reason } : {}) }, status);
}

type Handler = (context: ApiContext, request: Request) => Promise<Response>;

export function withSpotify(handler: Handler): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const session = await auth();
    if (!session?.accessToken || session.error) {
      return jsonError(401, 'Not signed in to Spotify');
    }

    const client = new SpotifyClient({ accessToken: session.accessToken });

    try {
      return await handler(
        {
          client,
          accessToken: session.accessToken,
          userId: session.user?.id,
          scopes: session.scopes,
        },
        request,
      );
    } catch (error) {
      if (isSpotifyError(error)) {
        logSpotifyFailure(request, error);
        return jsonError(error.status, error.message, error.reason);
      }
      if (error instanceof BoardWriteError) {
        return jsonError(409, error.message);
      }
      // Anything else is a bug rather than a Spotify problem, so it goes up to
      // Next rather than being dressed as an API failure.
      throw error;
    }
  };
}

/**
 * Spotify's own words, in the server log. A self-hosted instance has no other
 * way to find out why a write was refused: the browser only ever sees the
 * message, never the body that explains it. Routes that catch a Spotify failure
 * themselves have to call this, or the record is lost.
 */
export function logSpotifyFailure(request: Request, error: SpotifyError): void {
  console.error(
    `[spotify] ${request.method} ${new URL(request.url).pathname} -> ${error.status} ${error.message}`,
    error.body ?? '',
  );
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Which end of a track `played_at` marks. Set once, after checking a real
 * account against `/api/diagnostics/played-at`.
 */
export function configuredSemantics(): PlayedAtSemantics {
  const value = process.env.PLAYED_AT_SEMANTICS;
  return value === 'start' || value === 'end' ? value : DEFAULT_SEMANTICS;
}
