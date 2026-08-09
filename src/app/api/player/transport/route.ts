import { json, jsonError, readJson, withSpotify } from '@/lib/api/route';
import { playableDevices } from '@/lib/spotify/devices';

interface TransportBody {
  command?: unknown;
  deviceId?: unknown;
  value?: unknown;
}

const COMMANDS = ['resume', 'pause', 'next', 'previous', 'seek', 'volume', 'repeat', 'transfer'] as const;
type Command = (typeof COMMANDS)[number];

function isCommand(value: unknown): value is Command {
  return typeof value === 'string' && (COMMANDS as readonly string[]).includes(value);
}

/**
 * Transport, routed through the Web API rather than the browser SDK so it keeps
 * working after a handoff to a phone or a speaker.
 *
 * Shuffle is deliberately absent: a shuffled pass wouldn't count, so the app
 * turns it off when it starts a record and never turns it back on.
 */
export const POST = withSpotify(async ({ client }, request) => {
  const body = await readJson<TransportBody>(request);
  if (!body || !isCommand(body.command)) {
    return jsonError(400, `command must be one of ${COMMANDS.join(', ')}`);
  }

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : undefined;
  const value = typeof body.value === 'number' ? body.value : 0;

  switch (body.command) {
    case 'resume':
      await client.resume(deviceId);
      break;
    case 'pause':
      await client.pause(deviceId);
      break;
    case 'next':
      await client.nextTrack(deviceId);
      break;
    case 'previous':
      await client.previousTrack(deviceId);
      break;
    case 'seek':
      await client.seek(value, deviceId);
      break;
    case 'volume':
      await client.setVolume(value, deviceId);
      break;
    case 'repeat':
      await client.setRepeat(value === 0 ? 'off' : 'context', deviceId);
      break;
    default:
      if (!deviceId) return jsonError(400, 'deviceId is required to transfer playback');
      await client.transferPlayback(deviceId, true);
  }

  return json({ ok: true, command: body.command });
});

/**
 * The devices the listener can hand playback to — every Spotify Connect client
 * that is signed in, whether or not one of them is currently active, minus the
 * ones a transfer could never reach: no id to address, or restricted, which
 * Spotify documents as accepting no Web API commands at all.
 */
export const GET = withSpotify(async ({ client }) =>
  json({ devices: playableDevices(await client.devices()) }),
);
