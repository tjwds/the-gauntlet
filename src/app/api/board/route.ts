import { configuredSemantics, json, withSpotify } from '@/lib/api/route';
import { loadBoard } from '@/lib/board/service';

/** The whole board, rebuilt from the seven playlists on every call. */
export const GET = withSpotify(async ({ client, userId }, request) => {
  const force = new URL(request.url).searchParams.get('rescan') === '1';
  const result = await loadBoard(client, {
    semantics: configuredSemantics(),
    ...(userId ? { cacheKey: userId } : {}),
    ...(force ? { force: true } : {}),
  });
  if (result.setupRequired) {
    return json({ setupRequired: true, missing: result.missing }, 200);
  }
  return json({ setupRequired: false, board: result.board });
});
