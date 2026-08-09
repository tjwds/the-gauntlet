'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/copy';
import { NO_ACTIVE_DEVICE, PREMIUM_REQUIRED } from '@/lib/spotify/errors';

export interface PlayerTrack {
  id: string | null;
  name: string;
  artist: string;
  albumName: string;
  albumId: string | null;
  /** Art as Spotify reports it, so a record that isn't on the board still has some. */
  imageUrl: string | null;
  durationMs: number;
  trackNumber: number;
}

export interface PlayerDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
}

export interface PlayerState {
  track: PlayerTrack | null;
  device: PlayerDevice | null;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: 'off' | 'track' | 'context';
  progressMs: number;
  albumId: string | null;
}

export type TransportCommand =
  | { command: 'resume' | 'pause' | 'next' | 'previous' }
  | { command: 'seek' | 'volume' | 'repeat'; value: number }
  | { command: 'transfer'; deviceId: string };

const IDLE: PlayerState = {
  track: null,
  device: null,
  isPlaying: false,
  shuffle: false,
  repeat: 'off',
  progressMs: 0,
  albumId: null,
};

export interface UsePlayerOptions {
  /**
   * How often to ask Spotify what's playing while the tab is open. The board
   * only cares about which record is on, which changes on the scale of minutes,
   * so this is deliberately unhurried — polling is what got this app throttled.
   */
  pollMs?: number;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
  /**
   * Called when the track changes or playback stops — not on every poll.
   * Re-reading the board is expensive (a playlist scan plus seven playlist
   * reads), so doing it twelve times a minute rate-limits the account and makes
   * everything crawl. Those two moments are the ones a pass can have finished
   * at: the last track of a record either gives way to the next thing, or it
   * stops.
   */
  onPlaybackChange?(state: PlayerState): void;
}

/**
 * Live playback, read by polling `/me/player` rather than trusting our own
 * player. That's what lets progress keep counting after a handoff to a phone —
 * and it's why nothing here needs to be stored.
 */
export function usePlayer({
  pollMs = 15_000,
  enabled = true,
  fetchImpl,
  onPlaybackChange,
}: UsePlayerOptions = {}) {
  const [state, setState] = useState<PlayerState>(IDLE);
  const [devices, setDevices] = useState<PlayerDevice[]>([]);
  // A refused command, in words for the listener. Nothing else in the app can
  // tell them: playback has no optimistic state to snap back, so a play that
  // Spotify dropped looks exactly like one it accepted.
  const [error, setError] = useState<string | null>(null);
  const doFetch = fetchImpl ?? globalThis.fetch;
  // Held in a ref so a new callback identity doesn't restart the poll.
  const onChange = useRef(onPlaybackChange);
  useEffect(() => {
    onChange.current = onPlaybackChange;
  }, [onPlaybackChange]);
  // undefined until the first poll establishes a baseline, so mounting doesn't
  // count as a change — the board has just been read anyway.
  const lastTrackId = useRef<string | null | undefined>(undefined);
  const wasPlaying = useRef<boolean | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const response = await doFetch('/api/player');
      if (!response.ok) return;
      const body = await response.json();
      const next: PlayerState = {
        track: body.track,
        device: body.device,
        isPlaying: body.playback?.isPlaying ?? false,
        shuffle: body.playback?.shuffle ?? false,
        repeat: body.repeat ?? 'off',
        progressMs: body.playback?.progressMs ?? 0,
        albumId: body.playback?.albumId ?? null,
      };
      setState(next);

      const trackId = next.track?.id ?? null;
      const changed = lastTrackId.current !== undefined && trackId !== lastTrackId.current;
      // A record that ends with autoplay off leaves its last track sitting
      // there paused: same id, nothing playing. Without this the board would
      // not be looked at again until something else was put on.
      const stopped = wasPlaying.current === true && !next.isPlaying;
      lastTrackId.current = trackId;
      wasPlaying.current = next.isPlaying;
      if (changed || stopped) onChange.current?.(next);
    } catch {
      // A dropped poll is not worth surfacing; the next one is five seconds away.
    }
  }, [doFetch]);

  useEffect(() => {
    if (!enabled) return;
    // Loading data on mount, not cascading renders: the setState happens after
    // the request resolves, which the rule can't see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [enabled, pollMs, refresh]);

  /**
   * Send a playback command and say so when it is refused. Unlike a board
   * write, a dropped playback command leaves no trace in the UI — the button
   * clicks, the music doesn't start, and the reason ends up only in the server
   * log. Almost always that reason is that Spotify has no active device.
   */
  const command = useCallback(
    async (path: string, method: string, payload: unknown) => {
      let response: Response;
      try {
        response = await doFetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        setError(t('playing.error.offline'));
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(playbackFailure(body));
        return;
      }
      // A command that worked answers the last one that didn't.
      setError(null);
    },
    [doFetch],
  );

  const send = useCallback(
    async (payload: TransportCommand) => {
      // Answer the click straight away; the next poll corrects anything wrong.
      if (payload.command === 'pause') setState((s) => ({ ...s, isPlaying: false }));
      if (payload.command === 'resume') setState((s) => ({ ...s, isPlaying: true }));
      if (payload.command === 'seek') setState((s) => ({ ...s, progressMs: payload.value }));

      await command('/api/player/transport', 'POST', payload);
      await refresh();
    },
    [command, refresh],
  );

  const loadDevices = useCallback(async () => {
    try {
      const response = await doFetch('/api/player/transport');
      if (!response.ok) return;
      const body = await response.json();
      setDevices(body.devices ?? []);
    } catch {
      setDevices([]);
    }
  }, [doFetch]);

  const playAlbum = useCallback(
    async (albumUri: string) => {
      await command('/api/player', 'PUT', { albumUri });
      await refresh();
    },
    [command, refresh],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { state, devices, error, refresh, send, loadDevices, playAlbum, dismissError };
}

/**
 * What to tell the listener a refusal was. Spotify's `reason` is the thing to
 * match on — the message beside it ("Player command failed: No active device
 * found") is written for a developer reading a log. Its prose is still the
 * fallback: a refusal quoted verbatim beats a button that does nothing.
 */
export function playbackFailure(body: { error?: unknown; reason?: unknown }): string {
  if (body.reason === NO_ACTIVE_DEVICE) return t('playing.error.noDevice');
  if (body.reason === PREMIUM_REQUIRED) return t('playing.error.premium');
  return typeof body.error === 'string' && body.error !== ''
    ? body.error
    : t('playing.error.generic');
}
