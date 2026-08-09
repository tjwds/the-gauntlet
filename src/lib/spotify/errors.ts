/**
 * The player endpoints answer a refusal with a machine-readable `reason`
 * alongside the prose. These are the two the app can say something better about
 * than Spotify does; anything else falls back to quoting Spotify.
 */
export const NO_ACTIVE_DEVICE = 'NO_ACTIVE_DEVICE';
export const PREMIUM_REQUIRED = 'PREMIUM_REQUIRED';

export class SpotifyError extends Error {
  readonly status: number;
  readonly body: unknown;
  /**
   * `NO_ACTIVE_DEVICE` and friends. Only the player endpoints send one, and it
   * is the part of the body worth acting on — the message beside it is written
   * for whoever is reading the log, not for the listener.
   */
  readonly reason: string | null;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
    this.body = body;
    this.reason = readReason(body);
  }
}

/** The token is gone or was rejected: the listener has to sign in again. */
export class SpotifyAuthError extends SpotifyError {
  constructor(message = 'Spotify rejected the access token', body?: unknown) {
    super(401, message, body);
    this.name = 'SpotifyAuthError';
  }
}

/**
 * Premium-only endpoints answer 403 for free accounts, which is a supported
 * state rather than a fault — the board works, in-app playback doesn't.
 */
export class SpotifyForbiddenError extends SpotifyError {
  constructor(message = 'Spotify refused the request', body?: unknown) {
    super(403, message, body);
    this.name = 'SpotifyForbiddenError';
  }
}

/**
 * Spotify is throttling us, and has asked us to wait longer than any request
 * should. Raised rather than slept through: a handler that quietly waits out a
 * multi-hour Retry-After is indistinguishable from one that has hung.
 */
export class SpotifyRateLimitError extends SpotifyError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, url: string) {
    super(429, `Spotify is rate limiting this app for another ${describe(retryAfterSeconds)}.`, {
      url,
      retryAfterSeconds,
    });
    this.name = 'SpotifyRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function describe(seconds: number): string {
  if (seconds < 90) return `${Math.ceil(seconds)} seconds`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 3600)} hours`;
}

export function isSpotifyError(error: unknown): error is SpotifyError {
  return error instanceof SpotifyError;
}

function readReason(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (error && typeof error === 'object' && 'reason' in error) {
      const reason = (error as { reason: unknown }).reason;
      if (typeof reason === 'string') return reason;
    }
  }
  return null;
}
