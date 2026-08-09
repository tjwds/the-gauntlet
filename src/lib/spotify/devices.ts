/**
 * Which device a record should start on.
 *
 * A play sent with no `device_id` targets whichever device Spotify considers
 * *active*, and Spotify drops a client out of that role not long after playback
 * stops. So the morning after a listening session there is no active device
 * even though Spotify is still open on the desk, the play answers 404
 * NO_ACTIVE_DEVICE, and the app reports there is nothing to play on.
 *
 * `/me/player/devices` is the wider view: it lists every Spotify Connect client
 * that is running and signed in, active or not, and naming one of those on the
 * play call both starts the record and makes that device active. That is the
 * whole difference between a dead Play button in the morning and music.
 *
 * It is not a complete answer — a client that has been shut, or one that has
 * been idle long enough for Spotify to drop it off Connect entirely, is not in
 * the list either, and for those "open Spotify somewhere" really is the only
 * thing to say.
 */

import type { SpotifyDevice } from './types';

/**
 * Device types as Spotify spells them, in the order this app would rather play
 * on one. The listener is at a computer looking at the board, so the computer
 * on the desk is the least surprising place for a record to come out of; a
 * phone is the next most likely thing to be in reach. Anything Spotify names
 * that isn't here sorts last rather than being ruled out.
 */
export const DEVICE_TYPE_ORDER = ['computer', 'smartphone', 'tablet', 'speaker'] as const;

/**
 * The devices a Web API command can actually reach: ones with an id to address,
 * and not the restricted kind that answers the list and refuses everything else.
 */
export function playableDevices(devices: readonly SpotifyDevice[]): SpotifyDevice[] {
  return devices.filter((device) => Boolean(device.id) && !device.is_restricted);
}

/**
 * The best device to start a record on, or null when Spotify offers none.
 *
 * Ties are broken by the order Spotify listed them in, which is as good a
 * tiebreak as this has: nothing in the device object says which one was used
 * last.
 */
export function pickPlaybackDevice(devices: readonly SpotifyDevice[]): SpotifyDevice | null {
  const usable = playableDevices(devices);
  if (usable.length === 0) return null;
  return usable.reduce((best, device) => (rank(device) < rank(best) ? device : best));
}

function rank(device: SpotifyDevice): number {
  // Whatever is already active wins outright. Spotify has a session there, so
  // it is both the likeliest thing the listener meant and the least likely to
  // refuse the command — including when it is the one in a private session,
  // where overriding the listener's own choice would be the greater surprise.
  if (device.is_active) return 0;

  const type = DEVICE_TYPE_ORDER.indexOf(
    device.type?.toLowerCase() as (typeof DEVICE_TYPE_ORDER)[number],
  );
  // Last resort: a private session plays, but Spotify keeps it out of listening
  // history, and a pass Spotify never recorded is a pass that never counted.
  const privateSession = device.is_private_session ? DEVICE_TYPE_ORDER.length + 1 : 0;
  return 1 + privateSession + (type === -1 ? DEVICE_TYPE_ORDER.length : type);
}
