import { json, jsonError, withSpotify } from '@/lib/api/route';
import {
  albumFromRef,
  importablePlaylists,
  playlistTracksForBoard,
  savedAlbumsForBoard,
  searchAlbumsForBoard,
  type CatalogueAlbum,
} from '@/lib/board/catalogue';
import { albumsAlreadyOnBoard, findBoardPlaylists } from '@/lib/board/service';
import type { ColumnId } from '@/lib/domain/columns';

/**
 * Backs every tab of the add-albums modal. `source` picks the tab; the
 * already-on-board index is read once and shared across all of them.
 */
export const GET = withSpotify(async ({ client, userId }, request) => {
  const url = new URL(request.url);
  const source = url.searchParams.get('source') ?? 'search';

  if (source === 'playlists') {
    return json({ source, playlists: await importablePlaylists(client, userId) });
  }

  const lookup = await findBoardPlaylists(client);
  const onBoard = lookup.playlists
    ? await albumsAlreadyOnBoard(client, lookup.playlists)
    : new Map<string, ColumnId>();

  // One playlist, listed as tracks. The selection is still the album, so the
  // rows answer separately from `albums`.
  if (source === 'playlist') {
    const playlistId = url.searchParams.get('id');
    if (!playlistId) return jsonError(400, 'id is required for source=playlist');
    return json({ source, tracks: await playlistTracksForBoard(client, playlistId, onBoard) });
  }

  let albums: CatalogueAlbum[] = [];

  if (source === 'saved') {
    albums = await savedAlbumsForBoard(client, onBoard);
  } else if (source === 'link') {
    const ref = url.searchParams.get('ref') ?? '';
    const album = await albumFromRef(client, ref, onBoard);
    if (!album) return jsonError(400, "That doesn't look like a Spotify album link");
    albums = [album];
  } else {
    const query = url.searchParams.get('q')?.trim() ?? '';
    // A pasted link in the search box should just work.
    const asLink = query ? await albumFromRef(client, query, onBoard) : null;
    albums = asLink ? [asLink] : query ? await searchAlbumsForBoard(client, query, onBoard) : [];
  }

  return json({ source, albums });
});
