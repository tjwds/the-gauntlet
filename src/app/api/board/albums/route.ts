import { json, jsonError, readJson, withSpotify } from '@/lib/api/route';
import { addAlbumsToColumn, findBoardPlaylists, removeAlbumFromBoard } from '@/lib/board/service';
import { isColumnId, type ColumnId } from '@/lib/domain/columns';

interface AddBody {
  albumIds?: unknown;
  to?: unknown;
}

interface RemoveBody {
  albumId?: unknown;
  from?: unknown;
}

/** Put albums on the board. Anything already there is skipped, not duplicated. */
export const POST = withSpotify(async ({ client, userId }, request) => {
  const body = await readJson<AddBody>(request);
  const albumIds = Array.isArray(body?.albumIds)
    ? body.albumIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (albumIds.length === 0) return jsonError(400, 'albumIds is required');

  const to: ColumnId = isColumnId(body?.to) ? (body.to as ColumnId) : 'queue';

  const lookup = await findBoardPlaylists(client, { ...(userId ? { cacheKey: userId } : {}) });
  if (!lookup.playlists) {
    return jsonError(409, `Board playlists missing: ${lookup.missing.join(', ')}`);
  }

  const result = await addAlbumsToColumn(client, lookup.playlists, { albumIds, to });
  return json({ ...result, to });
});

/** Take an album off the board. The album stays in the listener's library. */
export const DELETE = withSpotify(async ({ client, userId }, request) => {
  const body = await readJson<RemoveBody>(request);
  if (!body || typeof body.albumId !== 'string' || !isColumnId(body.from)) {
    return jsonError(400, 'albumId and from are required');
  }

  const lookup = await findBoardPlaylists(client, { ...(userId ? { cacheKey: userId } : {}) });
  if (!lookup.playlists) {
    return jsonError(409, `Board playlists missing: ${lookup.missing.join(', ')}`);
  }

  const result = await removeAlbumFromBoard(client, lookup.playlists, {
    albumId: body.albumId,
    from: body.from as ColumnId,
  });
  return json(result);
});
