import { describe, expect, it } from 'vitest';
import { pickPlaybackDevice, playableDevices } from './devices';
import type { SpotifyDevice } from './types';

function aDevice(overrides: Partial<SpotifyDevice> = {}): SpotifyDevice {
  return {
    id: 'dev1',
    name: 'MacBook Pro',
    type: 'Computer',
    is_active: false,
    volume_percent: 64,
    ...overrides,
  };
}

describe('playableDevices', () => {
  it('keeps a device that is open but idle, which is the whole point', () => {
    // The morning case: Spotify is running, nothing has played since yesterday,
    // so nothing is active. `/me/player` has nothing to say about this device
    // and `/me/player/devices` lists it.
    const idle = aDevice({ is_active: false });
    expect(playableDevices([idle])).toEqual([idle]);
  });

  it('drops a device with no id, which nothing can be addressed to', () => {
    expect(playableDevices([aDevice({ id: null })])).toEqual([]);
  });

  it('drops a restricted device, which answers the list and refuses the command', () => {
    expect(playableDevices([aDevice({ is_restricted: true })])).toEqual([]);
  });

  it('leaves the order Spotify gave alone', () => {
    const first = aDevice({ id: 'a', type: 'Speaker' });
    const second = aDevice({ id: 'b', type: 'Computer' });
    expect(playableDevices([first, second])).toEqual([first, second]);
  });
});

describe('pickPlaybackDevice', () => {
  it('finds nothing when Spotify lists nothing', () => {
    expect(pickPlaybackDevice([])).toBeNull();
  });

  it('finds nothing when everything listed is unreachable', () => {
    expect(
      pickPlaybackDevice([aDevice({ id: null }), aDevice({ id: 'b', is_restricted: true })]),
    ).toBeNull();
  });

  it('takes the active device when there is one', () => {
    const speaker = aDevice({ id: 'spk', type: 'Speaker', is_active: true });
    const chosen = pickPlaybackDevice([aDevice({ id: 'mac', type: 'Computer' }), speaker]);
    expect(chosen).toBe(speaker);
  });

  it('takes the computer when nothing is active', () => {
    // What the board is being looked at on, and so the least surprising place
    // for a record to come out of.
    const mac = aDevice({ id: 'mac', type: 'Computer' });
    const chosen = pickPlaybackDevice([
      aDevice({ id: 'spk', type: 'Speaker' }),
      aDevice({ id: 'phone', type: 'Smartphone' }),
      mac,
    ]);
    expect(chosen).toBe(mac);
  });

  it('falls to the phone, then the speaker, then whatever is left', () => {
    const phone = aDevice({ id: 'phone', type: 'Smartphone' });
    expect(pickPlaybackDevice([aDevice({ id: 'spk', type: 'Speaker' }), phone])).toBe(phone);

    const speaker = aDevice({ id: 'spk', type: 'Speaker' });
    expect(pickPlaybackDevice([aDevice({ id: 'car', type: 'Automobile' }), speaker])).toBe(speaker);

    const car = aDevice({ id: 'car', type: 'Automobile' });
    expect(pickPlaybackDevice([car])).toBe(car);
  });

  it('takes an unreachable device out of the running rather than picking it', () => {
    const phone = aDevice({ id: 'phone', type: 'Smartphone' });
    const chosen = pickPlaybackDevice([
      aDevice({ id: 'mac', type: 'Computer', is_restricted: true }),
      phone,
    ]);
    expect(chosen).toBe(phone);
  });

  it('leaves a private session until last, since a pass there is never recorded', () => {
    // Spotify keeps a private session out of listening history, and history is
    // the only place a pass can be counted from.
    const speaker = aDevice({ id: 'spk', type: 'Speaker' });
    const chosen = pickPlaybackDevice([
      aDevice({ id: 'mac', type: 'Computer', is_private_session: true }),
      speaker,
    ]);
    expect(chosen).toBe(speaker);
  });

  it('still plays to a private session when it is all there is', () => {
    const mac = aDevice({ id: 'mac', is_private_session: true });
    expect(pickPlaybackDevice([mac])).toBe(mac);
  });

  it('keeps the active device even when it is the private one', () => {
    // The listener chose that session themselves; moving the music off it would
    // be the greater surprise.
    const mac = aDevice({ id: 'mac', is_active: true, is_private_session: true });
    const chosen = pickPlaybackDevice([mac, aDevice({ id: 'phone', type: 'Smartphone' })]);
    expect(chosen).toBe(mac);
  });

  it('copes with a device type it has never heard of', () => {
    const unknown = aDevice({ id: 'x', type: 'Fridge' });
    expect(pickPlaybackDevice([unknown])).toBe(unknown);
  });

  it('breaks a tie on the order Spotify listed them in', () => {
    const first = aDevice({ id: 'mac1', type: 'Computer' });
    const second = aDevice({ id: 'mac2', type: 'Computer' });
    expect(pickPlaybackDevice([first, second])).toBe(first);
  });
});
