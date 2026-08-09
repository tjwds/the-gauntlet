import { json, jsonError, readJson, withSpotify } from '@/lib/api/route';
import { findBoardPlaylists, moveAlbum } from '@/lib/board/service';
import { isColumnId, type ColumnId } from '@/lib/domain/columns';

interface MoveBody {
  albumId?: unknown;
  from?: unknown;
  to?: unknown;
}

/**
 * One album, one column to another. Automatic advancement, drag, "Advance to
 * next column" and undo all land here — they are the same two playlist writes.
 */
export const POST = withSpotify(async ({ client, userId }, request) => {
  const body = await readJson<MoveBody>(request);
  if (!body || typeof body.albumId !== 'string' || !isColumnId(body.from) || !isColumnId(body.to)) {
    return jsonError(400, 'albumId, from and to are required');
  }

  const lookup = await findBoardPlaylists(client, { ...(userId ? { cacheKey: userId } : {}) });
  if (!lookup.playlists) {
    return jsonError(409, `Board playlists missing: ${lookup.missing.join(', ')}`);
  }

  const result = await moveAlbum(client, lookup.playlists, {
    albumId: body.albumId,
    from: body.from as ColumnId,
    to: body.to as ColumnId,
  });
  return json(result);
});
