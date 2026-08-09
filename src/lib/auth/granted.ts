/**
 * Comparing what was asked for with what Spotify granted.
 *
 * The two can differ. A listener who authorised an earlier version of the app
 * keeps that grant, and `show_dialog=false` means Spotify may reuse it silently
 * rather than asking again for the scopes that were added since. The symptom is
 * a 403 on an endpoint the app plainly has a scope for.
 */

export interface GrantedScopeReport {
  /** Null when the session predates scope recording — sign in again to populate it. */
  granted: string[] | null;
  missing: string[];
  /** True when every scope the app needs was granted, or unknown. */
  complete: boolean;
}

export function grantedScopeReport(
  granted: string | undefined,
  required: string,
): GrantedScopeReport {
  const requiredScopes = required.split(' ').filter(Boolean);

  if (!granted) {
    return { granted: null, missing: [], complete: true };
  }

  const grantedScopes = granted.split(' ').filter(Boolean);
  const held = new Set(grantedScopes);
  const missing = requiredScopes.filter((scope) => !held.has(scope));

  return { granted: grantedScopes, missing, complete: missing.length === 0 };
}
