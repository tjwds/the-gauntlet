import { json, logSpotifyFailure, readJson, withSpotify } from '@/lib/api/route';
import { createBoardPlaylists, deleteBoardPlaylists, findBoardPlaylists } from '@/lib/board/service';
import { COLUMNS } from '@/lib/domain/columns';
import type { SpotifyClient } from '@/lib/spotify/client';
import { isSpotifyError } from '@/lib/spotify/errors';

/**
 * Spotify answers a refused write with the single word "Forbidden", so the app
 * has to supply the reason. There are two, and they are told apart by whether
 * the same token can still read the account it belongs to.
 *
 * A Spotify app starts in development mode, where only accounts added by hand
 * under User Management in the developer dashboard may use the API — the app
 * owner's own account included. That refusal is total: every request on that
 * token gets a 403, `GET /me` among them.
 */
const DEV_MODE_HINT =
  'Spotify refused this. A new Spotify app is in development mode, where only accounts listed under ' +
  'User Management in the developer dashboard can use it — including your own. Add the email on ' +
  'your Spotify account there, then try again.';

/** What setup needs to know: which of the seven already exist. */
export const GET = withSpotify(async ({ client }) => {
  const lookup = await findBoardPlaylists(client);
  return json({
    ready: lookup.playlists !== null,
    missing: lookup.missing,
    existing: COLUMNS.filter((column) => lookup.found[column.id]).map((column) => column.playlistName),
  });
});

/** Creates whichever of the seven are absent, adopting any that already exist. */
export const POST = withSpotify(async ({ client, scopes }, request) => {
  const body = await readJson<{ private?: unknown }>(request);
  const isPrivate = body?.private !== false;

  try {
    const result = await createBoardPlaylists(client, isPrivate);
    // Receipts. "Spotify returned 200" is not evidence a playlist exists; an id
    // and a link are, and they cost nothing to record.
    console.info(
      `[setup] as ${result.userId}: created ${result.created.length}, adopted ${result.adopted.length}`,
      [...result.created, ...result.adopted].map((p) => `${p.name} -> ${p.url}`),
    );
    return json(result);
  } catch (error) {
    if (isSpotifyError(error) && error.status === 403) {
      // Handled here rather than by withSpotify, so log it here too — the
      // shared handler never sees it, and this is the only record of the body.
      logSpotifyFailure(request, error);
      return json({ error: await forbiddenHint(client, { scopes, isPrivate, spotifyMessage: error.message }) }, 403);
    }
    throw error;
  }
});

interface RefusalContext {
  /** What Spotify granted, when the session recorded it. */
  scopes: string | undefined;
  isPrivate: boolean;
  spotifyMessage: string;
}

/**
 * The other reason for a 403 here is the scope, and it is easy to miss because
 * a grant is never widened after the fact: an account that authorised before a
 * scope was added keeps the narrower grant, and refreshing the token carries it
 * forward. So what the app asks for and what the session holds can differ.
 */
async function forbiddenHint(
  client: SpotifyClient,
  { scopes, isPrivate, spotifyMessage }: RefusalContext,
): Promise<string> {
  const said = ` Spotify said: "${spotifyMessage}".`;
  const account = await client.me().catch(() => null);

  // The token can't read the account it belongs to either, so nothing on this
  // app works for this listener — which is what development mode looks like.
  if (!account) return `${DEV_MODE_HINT}${said}`;

  const who = ` Acting as ${account.display_name ?? account.id} (id ${account.id}).`;
  const visibility = isPrivate ? 'private' : 'public';
  const needed = isPrivate ? 'playlist-modify-private' : 'playlist-modify-public';

  if (scopes && !scopes.split(' ').includes(needed)) {
    return (
      `Spotify refused this. Creating ${visibility} playlists needs the ${needed} scope, and this ` +
      `session wasn't granted it. Sign out and sign in again to re-consent — an older grant is ` +
      `reused as-is rather than widened.${who}${said}`
    );
  }

  // Reading the account worked, so the User Management list isn't what refused
  // this; the scope is the next thing to look at, and there's a route for it.
  return (
    `Spotify refused this. Reading the account worked, so the developer-dashboard User Management ` +
    `list isn't the cause. Creating ${visibility} playlists needs the ${needed} scope — ` +
    `GET /api/diagnostics/account reports which scopes this session actually holds.${who}${said}`
  );
}

/** Removes all seven from the library. Destructive, and the UI confirms first. */
export const DELETE = withSpotify(async ({ client }) => {
  const deleted = await deleteBoardPlaylists(client);
  return json({ deleted });
});
