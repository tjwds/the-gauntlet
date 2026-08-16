import { json, jsonError, readJson, withSpotify } from '@/lib/api/route';
import { joinArtists, pickImage } from '@/lib/domain/albums';
import { albumContextId, playbackToSnapshot } from '@/lib/domain/board';
import { displayName } from '@/lib/domain/text';
import { pickPlaybackDevice } from '@/lib/spotify/devices';
import { NO_ACTIVE_DEVICE } from '@/lib/spotify/errors';

/** Live playback state. Polled while the tab is open to extend a pass as it happens. */
export const GET = withSpotify(async ({ client }) => {
  const state = await client.playbackState();
  return json({
    playback: playbackToSnapshot(state),
    device: state?.device ?? null,
    repeat: state?.repeat_state ?? 'off',
    // Which record is on, as against which record the current track came from.
    // The two part company the moment playback is a playlist or a radio, and
    // position in the record is only a fact while they agree.
    albumContextId: albumContextId(state),
    track: state?.item
      ? {
          id: state.item.id,
          name: displayName(state.item.name),
          artist: joinArtists(state.item.artists),
          albumName: displayName(state.item.album?.name ?? ''),
          albumId: state.item.album?.id ?? null,
          // The playbar needs art for records that aren't on the board, which
          // have no card to take it from. `/me/player` carries it, so ask once
          // here rather than fetching the album again to find out.
          imageUrl: state.item.album ? pickImage(state.item.album) : null,
          durationMs: state.item.duration_ms,
          trackNumber: state.item.track_number,
        }
      : null,
  });
});

interface PlayBody {
  albumUri?: unknown;
  deviceId?: unknown;
}

/**
 * Start a record from track 1, on a device named explicitly.
 *
 * Naming it is the point. A play with no `device_id` goes to whichever device
 * Spotify currently calls active, and Spotify stops calling anything active
 * shortly after playback ends — so opening the board the morning after a
 * listening session used to 404 with NO_ACTIVE_DEVICE while Spotify sat open on
 * the same desk. `/me/player/devices` still lists that client, and playing to it
 * by id wakes it. See `lib/spotify/devices`.
 *
 * Shuffle is turned off around the same call — a shuffled pass wouldn't count,
 * and the app shouldn't let someone spend an hour finding out — but it is set
 * after the record starts rather than before. Only `play` can wake a dormant
 * device; shuffle sent to one first is a coin flip, and losing it would stop the
 * record for the sake of a setting that track 1 doesn't depend on anyway.
 */
export const PUT = withSpotify(async ({ client }, request) => {
  const body = await readJson<PlayBody>(request);
  if (!body || typeof body.albumUri !== 'string') {
    return jsonError(400, 'albumUri is required');
  }

  // An empty string counts as "no device given" rather than as a device: it
  // would otherwise be sent as `device_id=`, which Spotify has no answer for.
  const deviceId =
    typeof body.deviceId === 'string' && body.deviceId !== ''
      ? body.deviceId
      : (pickPlaybackDevice(await client.devices())?.id ?? null);
  if (deviceId === null) {
    // Said in Spotify's own vocabulary so the browser reaches the same words it
    // would for a 404 from the play endpoint itself. Now it means what it says:
    // the device list really was empty, rather than merely nothing being active.
    return jsonError(404, 'Spotify has no device open to play on', NO_ACTIVE_DEVICE);
  }

  await client.playAlbum(body.albumUri, deviceId);
  await client.setShuffle(false, deviceId);
  return json({ playing: body.albumUri, deviceId });
});
