import { describe, expect, it } from 'vitest';
import {
  analysePlayedAtSemantics,
  albumProgress,
  detectPass,
  DEFAULT_COMPLETION_RATIO,
  DEFAULT_SEMANTICS,
  type PlaybackSnapshot,
  type PlayedAtSemantics,
  type PlayEvent,
} from './pass';
import {
  endOf,
  foreign,
  fullListen,
  listenWithSkip,
  makeAlbum,
  timeline,
  TRACK_MS,
  type Played,
} from '@/test/history';

const START = Date.parse('2026-07-01T12:00:00.000Z');
const ARRIVED = START - 60_000;

const SEMANTICS: PlayedAtSemantics[] = ['start', 'end'];

function run(
  played: Played[],
  album = makeAlbum('a', 5),
  options: {
    semantics?: PlayedAtSemantics;
    sinceMs?: number;
    nowMs?: number;
    playback?: PlaybackSnapshot | null;
    gapBeforeMs?: number;
    extraHistory?: PlayEvent[];
  } = {},
) {
  const semantics = options.semantics ?? DEFAULT_SEMANTICS;
  const gapBeforeMs = options.gapBeforeMs ?? 0;
  const history = [
    ...timeline(played, { startMs: START, semantics, gapBeforeMs }),
    ...(options.extraHistory ?? []),
  ];
  return detectPass({
    album,
    history,
    playback: options.playback ?? null,
    sinceMs: options.sinceMs ?? ARRIVED,
    nowMs: options.nowMs ?? endOf(played, START, gapBeforeMs) + 60_000,
    semantics,
  });
}

describe('detectPass', () => {
  it('has nothing to say about an album with no tracks', () => {
    expect(detectPass({ album: makeAlbum('a', 0), history: [], sinceMs: 0, nowMs: START })).toEqual({
      completed: 0,
      inFlight: null,
    });
  });

  it('finds nothing in an empty history', () => {
    expect(run([])).toEqual({ completed: 0, inFlight: null });
  });

  describe.each(SEMANTICS)('under %s semantics', (semantics) => {
    it('credits a record played straight through', () => {
      const album = makeAlbum('a', 5);
      expect(run(fullListen(album), album, { semantics })).toEqual({
        completed: 1,
        inFlight: null,
      });
    });

    it('refuses a pass that skipped a track', () => {
      const album = makeAlbum('a', 5);
      const result = run(listenWithSkip(album, 2), album, { semantics });
      expect(result.completed).toBe(0);
    });

    it('refuses a record skipped through end to end', () => {
      const album = makeAlbum('a', 5);
      const skimmed = fullListen(album).map((entry) => ({ ...entry, playedMs: 35_000 }));
      expect(run(skimmed, album, { semantics }).completed).toBe(0);
    });

    it('counts a record left on repeat twice', () => {
      const album = makeAlbum('a', 4);
      const twice = [...fullListen(album), ...fullListen(album)];
      expect(run(twice, album, { semantics }).completed).toBe(2);
    });

    it('breaks the pass when something else is played in the middle', () => {
      const album = makeAlbum('a', 4);
      const interrupted = [
        ...fullListen(album).slice(0, 2),
        foreign('interloper'),
        ...fullListen(album).slice(2),
      ];
      expect(run(interrupted, album, { semantics }).completed).toBe(0);
    });

    it('survives a pause between tracks', () => {
      const album = makeAlbum('a', 4);
      expect(run(fullListen(album), album, { semantics, gapBeforeMs: 90_000 }).completed).toBe(1);
    });

    it('ignores a pass that finished before the album reached this column', () => {
      const album = makeAlbum('a', 4);
      const played = fullListen(album);
      expect(
        run(played, album, { semantics, sinceMs: endOf(played, START) + 1 }).completed,
      ).toBe(0);
    });

    it('reports the pass underway rather than crediting it', () => {
      const album = makeAlbum('a', 6);
      const partial = fullListen(album).slice(0, 3);
      expect(run(partial, album, { semantics })).toEqual({
        completed: 0,
        inFlight: { tracksDone: 3, total: 6 },
      });
    });

    it('does not start a pass from the middle of a record', () => {
      const album = makeAlbum('a', 6);
      const fromTrackThree = fullListen(album).slice(2);
      expect(run(fromTrackThree, album, { semantics })).toEqual({
        completed: 0,
        inFlight: null,
      });
    });

    it('starts a fresh pass when track 1 comes round again', () => {
      const album = makeAlbum('a', 4);
      const restarted = [...fullListen(album).slice(0, 2), ...fullListen(album).slice(0, 3)];
      expect(run(restarted, album, { semantics })).toEqual({
        completed: 0,
        inFlight: { tracksDone: 3, total: 4 },
      });
    });

    it('ignores another album entirely', () => {
      const album = makeAlbum('a', 4);
      const other = makeAlbum('b', 4);
      expect(run(fullListen(other), album, { semantics })).toEqual({
        completed: 0,
        inFlight: null,
      });
    });
  });

  it('under end semantics, judges the most recent track it has a gap for', () => {
    // The tail is exactly where 'start' cannot see: a record played in full
    // except for a skipped closing track.
    const album = makeAlbum('a', 4);
    const trailingSkip = listenWithSkip(album, 3);
    expect(run(trailingSkip, album, { semantics: 'end' }).completed).toBe(0);
    expect(run(trailingSkip, album, { semantics: 'end' }).inFlight).toEqual({
      tracksDone: 3,
      total: 4,
    });
  });

  it('accepts the oldest entry in the window it cannot judge', () => {
    // Under 'end' there is no earlier entry to measure track 1 against, so it
    // gets the benefit of the doubt rather than losing the listen outright.
    const album = makeAlbum('a', 3);
    expect(run(fullListen(album), album, { semantics: 'end' }).completed).toBe(1);
  });

  describe('live playback', () => {
    const album = makeAlbum('a', 7);

    function playing(trackIndex: number, progressMs: number, overrides: Partial<PlaybackSnapshot> = {}) {
      return {
        trackId: album.trackIds[trackIndex] as string,
        albumId: album.id,
        durationMs: TRACK_MS,
        progressMs,
        isPlaying: true,
        shuffle: false,
        timestampMs: START + 10 * TRACK_MS,
        ...overrides,
      } satisfies PlaybackSnapshot;
    }

    it('counts the tracks banked before the one now playing', () => {
      const played = fullListen(album).slice(0, 5);
      const result = run(played, album, {
        playback: playing(5, 30_000),
        nowMs: START + 10 * TRACK_MS,
      });
      expect(result.inFlight).toEqual({ tracksDone: 5, total: 7 });
    });

    it('opens a pass as soon as track 1 starts', () => {
      const result = run([], album, {
        playback: playing(0, 5_000),
        nowMs: START + 10 * TRACK_MS,
      });
      expect(result.inFlight).toEqual({ tracksDone: 0, total: 7 });
    });

    it('closes the pass while the last track is still playing out', () => {
      const short = makeAlbum('a', 3);
      const played = fullListen(short).slice(0, 2);
      const result = detectPass({
        album: short,
        history: timeline(played, { startMs: START, semantics: 'end' }),
        playback: {
          trackId: short.trackIds[2] as string,
          albumId: short.id,
          durationMs: TRACK_MS,
          progressMs: TRACK_MS * 0.95,
          isPlaying: true,
          shuffle: false,
          timestampMs: START + 2 * TRACK_MS + TRACK_MS * 0.95,
        },
        sinceMs: ARRIVED,
        nowMs: START + 3 * TRACK_MS,
      });
      expect(result.completed).toBe(1);
    });

    it('reads the live track against start-stamped history too', () => {
      const played = fullListen(album).slice(0, 5);
      const result = run(played, album, {
        semantics: 'start',
        playback: playing(5, 30_000),
        nowMs: START + 10 * TRACK_MS,
      });
      expect(result.inFlight).toEqual({ tracksDone: 5, total: 7 });
    });

    it('voids the pass when shuffle is on', () => {
      const played = fullListen(album).slice(0, 5);
      const result = run(played, album, {
        playback: playing(5, 30_000, { shuffle: true }),
        nowMs: START + 10 * TRACK_MS,
      });
      expect(result.inFlight).toEqual({ tracksDone: 5, total: 7 });
      // The banked tracks stand, but the live track adds nothing to them.
      expect(result.completed).toBe(0);
    });

    it('ignores a paused player', () => {
      const result = run([], album, {
        playback: playing(0, 5_000, { isPlaying: false }),
        nowMs: START + 10 * TRACK_MS,
      });
      expect(result.inFlight).toBeNull();
    });

    it('ignores a player on a different record', () => {
      const result = run([], album, {
        playback: playing(0, 5_000, { albumId: 'somewhere-else' }),
        nowMs: START + 10 * TRACK_MS,
      });
      expect(result.inFlight).toBeNull();
    });

    it('ignores a track that is not on this record', () => {
      const result = run([], album, {
        playback: playing(0, 5_000, { trackId: 'not-here' }),
        nowMs: START + 10 * TRACK_MS,
      });
      expect(result.inFlight).toBeNull();
    });

    it('does not double-count the track that history has already logged', () => {
      // Spotify logs a track once it passes 30s, so the one playing right now can
      // already be in the window. Counting it as finished credits a pass early.
      const played = fullListen(album).slice(0, 6);
      const historyEnd = endOf(played, START);
      const result = detectPass({
        album,
        history: timeline(played, { startMs: START, semantics: 'end' }),
        playback: {
          trackId: album.trackIds[5] as string,
          albumId: album.id,
          durationMs: TRACK_MS,
          progressMs: 40_000,
          isPlaying: true,
          shuffle: false,
          timestampMs: historyEnd - TRACK_MS + 40_000,
        },
        sinceMs: ARRIVED,
        nowMs: historyEnd,
      });
      expect(result.inFlight).toEqual({ tracksDone: 5, total: 7 });
    });

    it('does not reopen a pass the album already left behind', () => {
      const played = fullListen(album).slice(0, 3);
      const result = run(played, album, {
        sinceMs: endOf(played, START) + 1,
        playback: null,
      });
      expect(result.inFlight).toBeNull();
    });
  });

  it('rejects a run whose timestamps are too close together to be real', () => {
    // The elapsed-time backstop: per-step gaps could look plausible under the
    // wrong semantics, but a whole record cannot play in ninety seconds.
    const album = makeAlbum('a', 5);
    const history: PlayEvent[] = album.trackIds.map((trackId, index) => ({
      trackId,
      albumId: album.id,
      durationMs: TRACK_MS,
      playedAtMs: START + index * 31_000,
    }));
    expect(
      detectPass({ album, history, sinceMs: ARRIVED, nowMs: START + 10 * TRACK_MS, semantics: 'start' })
        .completed,
    ).toBe(0);
  });

  it('ignores a track of this album that is not on the card', () => {
    // The playlist can hold a partial album — a bonus track heard now is not
    // part of the pass this card is tracking.
    const album = makeAlbum('a', 3);
    const played = fullListen(album).slice(0, 2);
    const bonus = {
      trackId: 'a-bonus',
      albumId: 'a',
      durationMs: TRACK_MS,
      playedAtMs: endOf(played, START) + TRACK_MS,
    };
    // It breaks the run like any other foreign track would: the pass is over,
    // not merely paused, which is what the empty progress row on the card says.
    expect(run(played, album, { semantics: 'end', extraHistory: [bonus] })).toEqual({
      completed: 0,
      inFlight: null,
    });
  });

  it('credits a single-track release without a neighbouring gap to check', () => {
    const album = makeAlbum('a', 1);
    const played = fullListen(album);
    expect(run(played, album, { semantics: 'end' }).completed).toBe(1);
  });

  it('uses the documented completion ratio by default', () => {
    expect(DEFAULT_COMPLETION_RATIO).toBe(0.85);
    expect(DEFAULT_SEMANTICS).toBe('end');
  });

  it('accepts a custom ratio', () => {
    const album = makeAlbum('a', 3);
    const nearlyFull = fullListen(album).map((entry) => ({ ...entry, playedMs: TRACK_MS * 0.6 }));
    expect(run(nearlyFull, album, { semantics: 'end' }).completed).toBe(0);
    expect(
      detectPass({
        album,
        history: timeline(nearlyFull, { startMs: START, semantics: 'end' }),
        sinceMs: ARRIVED,
        nowMs: endOf(nearlyFull, START) + 1000,
        ratio: 0.5,
      }).completed,
    ).toBe(1);
  });
});

describe('albumProgress', () => {
  const album = makeAlbum('a', 3);

  it('caps advancement at what the column has left', () => {
    const thrice = [...fullListen(album), ...fullListen(album), ...fullListen(album)];
    const result = albumProgress({
      album,
      history: timeline(thrice, { startMs: START, semantics: 'end' }),
      sinceMs: ARRIVED,
      nowMs: endOf(thrice, START) + 1000,
      passesAvailable: 2,
    });
    expect(result.passes).toBe(2);
  });

  it('treats a negative allowance as none', () => {
    const result = albumProgress({
      album,
      history: timeline(fullListen(album), { startMs: START, semantics: 'end' }),
      sinceMs: ARRIVED,
      nowMs: endOf(fullListen(album), START) + 1000,
      passesAvailable: -3,
    });
    expect(result.passes).toBe(0);
  });

  it('passes the in-flight pass straight through', () => {
    const partial = fullListen(album).slice(0, 2);
    const result = albumProgress({
      album,
      history: timeline(partial, { startMs: START, semantics: 'end' }),
      sinceMs: ARRIVED,
      nowMs: endOf(partial, START) + 1000,
      passesAvailable: 5,
    });
    expect(result.inFlight).toEqual({ tracksDone: 2, total: 3 });
  });
});

describe('analysePlayedAtSemantics', () => {
  // Varying runtimes are the only thing that tells the two readings apart; on a
  // record where every track is the same length they are indistinguishable.
  const varied = {
    id: 'a',
    trackIds: ['a-t1', 'a-t2', 'a-t3', 'a-t4', 'a-t5'],
    durationsMs: [120_000, 300_000, 90_000, 400_000, 150_000],
  };

  function named(events: PlayEvent[]) {
    return events.map((event, index) => ({ ...event, trackName: `Track ${index + 1}` }));
  }

  it('recognises history where played_at marks the end of a track', () => {
    const history = named(timeline(fullListen(varied), { startMs: START, semantics: 'end' }));
    const verdict = analysePlayedAtSemantics(history);
    expect(verdict.bestFit).toBe('end');
    expect(verdict.sampleSize).toBe(4);
  });

  it('recognises history where played_at marks the start of a track', () => {
    const history = named(timeline(fullListen(varied), { startMs: START, semantics: 'start' }));
    expect(analysePlayedAtSemantics(history).bestFit).toBe('start');
  });

  it('reaches no verdict without a contiguous sitting to look at', () => {
    const verdict = analysePlayedAtSemantics(
      named([
        { trackId: 't1', albumId: 'a', durationMs: TRACK_MS, playedAtMs: START },
        { trackId: 't2', albumId: 'a', durationMs: TRACK_MS, playedAtMs: START + 86_400_000 },
      ]),
    );
    expect(verdict.bestFit).toBeNull();
    expect(verdict.sampleSize).toBe(0);
    expect(verdict.startErrorMs).toBeNull();
  });

  it('reaches no verdict when both readings fit equally', () => {
    const uniform = named(timeline(fullListen(makeAlbum('a', 3)), { startMs: START, semantics: 'end' }));
    expect(analysePlayedAtSemantics(uniform).bestFit).toBeNull();
  });

  it('reports the gaps either side of every entry', () => {
    const history = named(timeline(fullListen(makeAlbum('a', 3)), { startMs: START, semantics: 'end' }));
    const { readings } = analysePlayedAtSemantics(history);
    expect(readings).toHaveLength(3);
    expect(readings[0]?.gapBeforeMs).toBeNull();
    expect(readings[2]?.gapAfterMs).toBeNull();
    expect(readings[1]?.gapBeforeMs).toBe(TRACK_MS);
  });

  it('ignores entries logged out of order', () => {
    const verdict = analysePlayedAtSemantics(
      named([
        { trackId: 't1', albumId: 'a', durationMs: TRACK_MS, playedAtMs: START },
        { trackId: 't2', albumId: 'a', durationMs: TRACK_MS, playedAtMs: START },
      ]),
    );
    expect(verdict.sampleSize).toBe(0);
  });
});
