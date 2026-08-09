import { json, withSpotify } from '@/lib/api/route';
import { findBoardPlaylists } from '@/lib/board/service';
import { albumsFromPlaylistItems } from '@/lib/domain/albums';
import { COLUMNS } from '@/lib/domain/columns';
import { displayNameOrNull } from '@/lib/domain/text';

/** Everything the Settings screen shows: an account, seven playlists, nothing to set. */
export const GET = withSpotify(async ({ client }) => {
  const [user, lookup] = await Promise.all([client.me(), findBoardPlaylists(client)]);

  const playlists = await Promise.all(
    COLUMNS.map(async (column) => {
      const playlist = lookup.found[column.id];
      if (!playlist) {
        return { columnId: column.id, name: column.playlistName, missing: true as const };
      }
      const items = await client.playlistItems(playlist.id);
      return {
        columnId: column.id,
        name: column.playlistName,
        missing: false as const,
        url: playlist.external_urls.spotify,
        albums: albumsFromPlaylistItems(items).length,
        tracks: items.length,
      };
    }),
  );

  return json({
    user: {
      id: user.id,
      name: displayNameOrNull(user.display_name),
      email: user.email ?? null,
      product: user.product ?? null,
      image: user.images?.[0]?.url ?? null,
    },
    playlists,
    ready: lookup.playlists !== null,
  });
});
