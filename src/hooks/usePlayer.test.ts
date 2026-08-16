import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { playbackFailure, usePlayer } from './usePlayer';

const playing = {
  playback: { isPlaying: true, shuffle: false, progressMs: 60_000, albumId: 'alb1' },
  device: { id: 'dev1', name: 'MacBook Pro', type: 'Computer', is_active: true, volume_percent: 64 },
  repeat: 'off',
  albumContextId: 'alb1',
  track: {
    id: 't1',
    name: 'Dream House',
    artist: 'Deafheaven',
    albumName: 'Sunbather',
    albumId: 'alb1',
    imageUrl: 'https://i.scdn.co/sunbather.jpg',
    durationMs: 544_000,
    trackNumber: 1,
  },
};

const silent = { playback: null, device: null, repeat: 'off', track: null };

function stubApi(state: unknown = playing, devices: unknown = { devices: [] }) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    if (url === '/api/player/transport' && !init.method) {
      return new Response(JSON.stringify(devices), { status: 200 });
    }
    if (url === '/api/player' && !init.method) {
      return new Response(JSON.stringify(state), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('usePlayer', () => {
  it('reads what is playing on mount', async () => {
    const { result } = renderHook(() => usePlayer({ fetchImpl: stubApi().impl }));
    await waitFor(() => expect(result.current.state.track?.name).toBe('Dream House'));
    expect(result.current.state.isPlaying).toBe(true);
    expect(result.current.state.albumId).toBe('alb1');
    expect(result.current.state.albumContextId).toBe('alb1');
  });

  it('carries no record for a track that was not played as part of one', async () => {
    const { result } = renderHook(() =>
      usePlayer({ fetchImpl: stubApi({ ...playing, albumContextId: undefined }).impl }),
    );
    await waitFor(() => expect(result.current.state.track?.name).toBe('Dream House'));
    expect(result.current.state.albumContextId).toBeNull();
  });

  it("uses the browser's own fetch when it is given none", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = stubApi().impl;
    const { result } = renderHook(() => usePlayer());
    await waitFor(() => expect(result.current.state.track?.name).toBe('Dream House'));
    globalThis.fetch = original;
  });

  it('assumes repeat is off when Spotify did not say', async () => {
    const { result } = renderHook(() =>
      usePlayer({ fetchImpl: stubApi({ playback: null, device: null, track: null }).impl }),
    );
    await waitFor(() => expect(result.current.state.repeat).toBe('off'));
  });

  it('reports silence', async () => {
    const { result } = renderHook(() => usePlayer({ fetchImpl: stubApi(silent).impl }));
    await waitFor(() => expect(result.current.state.isPlaying).toBe(false));
    expect(result.current.state.track).toBeNull();
  });

  describe('telling the board to look again', () => {
    /** A poller whose answer can be changed between polls. */
    function switchable(initial: unknown) {
      const current = { value: initial };
      const impl = vi.fn(
        async () => new Response(JSON.stringify(current.value), { status: 200 }),
      ) as unknown as typeof fetch;
      return { impl, current };
    }

    it('says nothing on the first poll, which only establishes a baseline', async () => {
      // The board has just been read; re-reading it on mount is wasted work.
      const onPlaybackChange = vi.fn();
      renderHook(() => usePlayer({ fetchImpl: stubApi().impl, onPlaybackChange }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(onPlaybackChange).not.toHaveBeenCalled();
    });

    it('stays quiet while the same track keeps playing', async () => {
      // Re-reading the board is a playlist scan plus seven playlist reads.
      // Doing it every five seconds rate-limits the account.
      vi.useFakeTimers();
      const onPlaybackChange = vi.fn();
      const { impl } = switchable(playing);
      renderHook(() => usePlayer({ fetchImpl: impl, onPlaybackChange, pollMs: 1000 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(onPlaybackChange).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('speaks up when the track changes', async () => {
      vi.useFakeTimers();
      const onPlaybackChange = vi.fn();
      const { impl, current } = switchable(playing);
      renderHook(() => usePlayer({ fetchImpl: impl, onPlaybackChange, pollMs: 1000 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      current.value = { ...playing, track: { ...playing.track, id: 't2', name: 'Sunbather' } };
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(onPlaybackChange).toHaveBeenCalledTimes(1);
      expect(onPlaybackChange.mock.calls[0]?.[0]).toMatchObject({ albumId: 'alb1' });
      vi.useRealTimers();
    });

    it('speaks up when playback stops', async () => {
      vi.useFakeTimers();
      const onPlaybackChange = vi.fn();
      const { impl, current } = switchable(playing);
      renderHook(() => usePlayer({ fetchImpl: impl, onPlaybackChange, pollMs: 1000 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      current.value = silent;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(onPlaybackChange).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('speaks up when a record ends on its last track rather than moving on', async () => {
      // Autoplay off: Spotify leaves the track that just finished sitting there
      // paused. The id never changes, so the stop is the only cue the board has
      // that the pass is complete.
      vi.useFakeTimers();
      const onPlaybackChange = vi.fn();
      const { impl, current } = switchable(playing);
      renderHook(() => usePlayer({ fetchImpl: impl, onPlaybackChange, pollMs: 1000 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      current.value = { ...playing, playback: { ...playing.playback, isPlaying: false } };
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(onPlaybackChange).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('stays quiet while a stopped player stays stopped', async () => {
      vi.useFakeTimers();
      const onPlaybackChange = vi.fn();
      const { impl } = switchable(silent);
      renderHook(() => usePlayer({ fetchImpl: impl, onPlaybackChange, pollMs: 1000 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(onPlaybackChange).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  it('polls while the tab is open', async () => {
    vi.useFakeTimers();
    const { calls, impl } = stubApi();
    renderHook(() => usePlayer({ fetchImpl: impl, pollMs: 1000 }));
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(calls.filter((call) => call.url === '/api/player').length).toBeGreaterThan(2);
    vi.useRealTimers();
  });

  it('does not poll a free account, which has no playback to read', async () => {
    const { calls, impl } = stubApi();
    renderHook(() => usePlayer({ fetchImpl: impl, enabled: false }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toEqual([]);
  });

  it('says nothing when the poll is refused', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'nope' }), { status: 401 }),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.state.track).toBeNull();
  });

  it('lets a dropped poll go by, since the next one is seconds away', async () => {
    const impl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.state.track).toBeNull();
  });

  describe('transport', () => {
    it('answers a pause straight away, before Spotify confirms it', async () => {
      const { impl } = stubApi();
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.state.isPlaying).toBe(true));

      let settled: Promise<void>;
      act(() => {
        settled = result.current.send({ command: 'pause' });
      });
      expect(result.current.state.isPlaying).toBe(false);
      await act(async () => {
        await settled;
      });
    });

    it('answers a resume the same way', async () => {
      const { impl } = stubApi(silent);
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await waitFor(() => expect(result.current.state.isPlaying).toBe(false));

      let settled: Promise<void>;
      act(() => {
        settled = result.current.send({ command: 'resume' });
      });
      expect(result.current.state.isPlaying).toBe(true);
      await act(async () => {
        await settled;
      });
    });

    it('moves the scrubber before Spotify answers', async () => {
      const { impl } = stubApi(silent);
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      let settled: Promise<void>;
      act(() => {
        settled = result.current.send({ command: 'seek', value: 90_000 });
      });
      expect(result.current.state.progressMs).toBe(90_000);
      await act(async () => {
        await settled;
      });
    });

    it('sends the command on to Spotify', async () => {
      const { impl, calls } = stubApi();
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.send({ command: 'next' });
      });
      expect(calls).toContainEqual(
        expect.objectContaining({
          url: '/api/player/transport',
          method: 'POST',
          body: { command: 'next' },
        }),
      );
    });
  });

  it('starts a record from track one', async () => {
    const { impl, calls } = stubApi();
    const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
    await act(async () => {
      await result.current.playAlbum('spotify:album:alb1');
    });
    expect(calls).toContainEqual(
      expect.objectContaining({
        url: '/api/player',
        method: 'PUT',
        body: { albumUri: 'spotify:album:alb1' },
      }),
    );
    expect(result.current.error).toBeNull();
  });

  describe('a command Spotify refused', () => {
    /**
     * Polling still works; only the write is refused, which is the real shape
     * of this. Build it once per test and hold it — a fetch that changes
     * identity between renders restarts the poll effect on every render.
     */
    function refusing(status: number, body: unknown) {
      return vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        if (init.method) return new Response(JSON.stringify(body), { status });
        return new Response(JSON.stringify(silent), { status: 200 });
      }) as unknown as typeof fetch;
    }

    const noDevice = {
      error: 'Player command failed: No active device found',
      reason: 'NO_ACTIVE_DEVICE',
    };

    it('says so rather than letting the click go nowhere', async () => {
      // The bug this exists for: the PUT 404s, the music never starts, and the
      // only record of why is the server log.
      const impl = refusing(404, noDevice);
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.playAlbum('spotify:album:alb1');
      });
      expect(result.current.error).toBe(
        'Nothing to play on — open Spotify on a phone, computer or speaker, then try again.',
      );
    });

    it('reports a refused transport command too, which fails the same way', async () => {
      const impl = refusing(404, noDevice);
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.send({ command: 'next' });
      });
      expect(result.current.error).toBe(
        'Nothing to play on — open Spotify on a phone, computer or speaker, then try again.',
      );
    });

    it('speaks up when the request never left the building', async () => {
      const impl = vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        if (init.method) throw new Error('offline');
        return new Response(JSON.stringify(silent), { status: 200 });
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.playAlbum('spotify:album:alb1');
      });
      expect(result.current.error).toBe('Could not reach Spotify.');
    });

    it('takes the message back once a command works', async () => {
      let refuse = true;
      const impl = vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        if (init.method) {
          return refuse
            ? new Response(JSON.stringify(noDevice), { status: 404 })
            : new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify(silent), { status: 200 });
      }) as unknown as typeof fetch;

      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.playAlbum('spotify:album:alb1');
      });
      expect(result.current.error).not.toBeNull();

      refuse = false;
      await act(async () => {
        await result.current.playAlbum('spotify:album:alb1');
      });
      expect(result.current.error).toBeNull();
    });

    it('can be dismissed by the listener', async () => {
      const impl = refusing(404, noDevice);
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.playAlbum('spotify:album:alb1');
      });
      act(() => result.current.dismissError());
      expect(result.current.error).toBeNull();
    });
  });

  describe('devices', () => {
    it('lists what playback can be handed to', async () => {
      const { impl } = stubApi(playing, { devices: [{ id: 'dev2', name: 'Kitchen speaker' }] });
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.loadDevices();
      });
      expect(result.current.devices).toEqual([{ id: 'dev2', name: 'Kitchen speaker' }]);
    });

    it('copes with a device list Spotify would not give', async () => {
      const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        if (String(input) === '/api/player/transport' && !init.method) {
          return new Response('{}', { status: 500 });
        }
        return new Response(JSON.stringify(silent), { status: 200 });
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.loadDevices();
      });
      expect(result.current.devices).toEqual([]);
    });

    it('copes with a device list request that throws', async () => {
      const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        if (String(input) === '/api/player/transport' && !init.method) throw new Error('offline');
        return new Response(JSON.stringify(silent), { status: 200 });
      }) as unknown as typeof fetch;
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.loadDevices();
      });
      expect(result.current.devices).toEqual([]);
    });

    it('copes with a device list that carries no devices', async () => {
      const { impl } = stubApi(playing, {});
      const { result } = renderHook(() => usePlayer({ fetchImpl: impl }));
      await act(async () => {
        await result.current.loadDevices();
      });
      expect(result.current.devices).toEqual([]);
    });
  });
});

describe('playbackFailure', () => {
  it('turns the commonest refusal into something to actually do about it', () => {
    expect(
      playbackFailure({
        error: 'Player command failed: No active device found',
        reason: 'NO_ACTIVE_DEVICE',
      }),
    ).toBe('Nothing to play on — open Spotify on a phone, computer or speaker, then try again.');
  });

  it('names Premium, which is a supported state rather than a fault', () => {
    expect(playbackFailure({ error: 'Player command failed', reason: 'PREMIUM_REQUIRED' })).toBe(
      'Playing from here needs Spotify Premium. Use Open in Spotify instead.',
    );
  });

  it('quotes Spotify for a refusal it has no better words for', () => {
    // A vague refusal in the listener's own words beats a silent one.
    expect(playbackFailure({ error: 'Player command failed: Restriction violated' })).toBe(
      'Player command failed: Restriction violated',
    );
  });

  it('falls back to its own words for a refusal that came with none', () => {
    expect(playbackFailure({})).toBe('Spotify would not start that record.');
    expect(playbackFailure({ error: '' })).toBe('Spotify would not start that record.');
  });
});
