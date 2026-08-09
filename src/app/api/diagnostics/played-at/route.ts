import { configuredSemantics, json, withSpotify } from '@/lib/api/route';
import { analysePlayedAtSemantics } from '@/lib/domain/pass';

/**
 * Settles the one load-bearing unknown: whether `played_at` marks the start or
 * the end of a track. Reads the listener's own history and reports which
 * reading the gaps actually fit. Run this once against a real account before
 * trusting automatic advancement.
 */
export const GET = withSpotify(async ({ client }) => {
  const history = await client.recentlyPlayed();

  const verdict = analysePlayedAtSemantics(
    history
      .filter((entry) => entry.track?.id)
      .map((entry) => ({
        trackId: entry.track.id as string,
        albumId: entry.track.album?.id ?? '',
        trackName: entry.track.name,
        durationMs: entry.track.duration_ms,
        playedAtMs: Date.parse(entry.played_at),
      })),
  );

  return json({
    configured: configuredSemantics(),
    bestFit: verdict.bestFit,
    sampleSize: verdict.sampleSize,
    meanErrorMs: { start: verdict.startErrorMs, end: verdict.endErrorMs },
    agrees: verdict.bestFit === null ? null : verdict.bestFit === configuredSemantics(),
    readings: verdict.readings,
  });
});
