import { json, withSpotify } from '@/lib/api/route';
import { SPOTIFY_SCOPES } from '@/lib/auth/scopes';
import { grantedScopeReport } from '@/lib/auth/granted';

/**
 * What the session actually holds, for when Spotify refuses something it looks
 * like it should allow. A 403 on playlist creation is almost always one of two
 * things: a scope that was asked for but not granted, or a user id that isn't
 * the one the token belongs to.
 */
export const GET = withSpotify(async ({ client, userId, scopes }) => {
  const me = await client.me();

  return json({
    // The id playlists are created under, and the id the token belongs to.
    // They have to match: Spotify won't let one account create a playlist for
    // another, and says so with a 403.
    sessionUserId: userId ?? null,
    spotifyUserId: me.id,
    idsMatch: userId === me.id,
    product: me.product ?? null,
    ...grantedScopeReport(scopes, SPOTIFY_SCOPES),
  });
});
