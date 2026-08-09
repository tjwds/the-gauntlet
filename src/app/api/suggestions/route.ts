import { json, withSpotify } from '@/lib/api/route';
import { albumsAlreadyOnBoard, findBoardPlaylists } from '@/lib/board/service';
import { suggestionsFromTopTracks } from '@/lib/domain/suggestions';
import type { TimeRange } from '@/lib/spotify/types';

const RANGES: Record<string, TimeRange> = {
  short: 'short_term',
  medium: 'medium_term',
  long: 'long_term',
};

/**
 * Records the listener already knows a song from, from `/me/top/tracks`.
 * A new account returns nothing, and the onboarding screen skips itself.
 */
export const GET = withSpotify(async ({ client }, request) => {
  const url = new URL(request.url);
  const range = RANGES[url.searchParams.get('range') ?? 'medium'] ?? 'medium_term';

  const topTracks = await client.topTracks(range);
  const suggestions = suggestionsFromTopTracks(topTracks);

  // Onboarding runs before there's anything on the board, but Add albums reuses
  // this list, so hide what's already filed.
  const lookup = await findBoardPlaylists(client);
  const onBoard = lookup.playlists
    ? await albumsAlreadyOnBoard(client, lookup.playlists)
    : new Map<string, string>();

  return json({
    range,
    suggestions: suggestions.map((suggestion) => ({
      ...suggestion,
      onBoard: onBoard.get(suggestion.id) ?? null,
    })),
  });
});
