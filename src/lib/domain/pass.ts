/**
 * Rediscovering a pass.
 *
 * A pass is one contiguous run of an album's tracks in album order, every track
 * played to the end. Nothing about it is stored: `recently-played` is itself a
 * contiguous log, so an in-flight pass is *found* on each load rather than
 * remembered. That is the whole reason the strict rule is the rule — a lenient
 * "any order, over weeks" pass cannot be reconstructed from a 50-item window.
 *
 * The one thing Spotify won't tell us plainly is whether a track was heard or
 * skipped after 30 seconds. Both land in `recently-played`. The only available
 * evidence is the gap between consecutive `played_at` values measured against
 * `duration_ms` — and the docs describe `played_at` only as "the date and time
 * the track was played", without saying which end of the track that is.
 *
 * So the attribution is a parameter, not an assumption:
 *
 *   'end'   — played_at is when the track stopped. The gap *before* an entry is
 *             how long it played. Verifies every entry including the most
 *             recent, at the cost of not being able to judge the oldest one.
 *   'start' — played_at is when the track began. The gap *after* an entry is how
 *             long it played. Cannot judge the most recent entry, which leaves a
 *             blind spot exactly where a trailing skip would hide.
 *
 * Default is 'end' because its blind spot (the oldest item in the window) costs
 * a missed listen, while 'start' can credit a pass that ended in a skip. Flip it
 * with PLAYED_AT_SEMANTICS once verified against a real account —
 * `GET /api/diagnostics/played-at` reports which fits the listener's history.
 *
 * Backstop for either setting: a completed run must also have taken roughly as
 * long as the music. That test holds under both readings, so a skipped-through
 * album is rejected even if the semantics are set wrong.
 */

export type PlayedAtSemantics = 'start' | 'end';

/** Share of a track that has to play before it counts. Leaves room for gapless fades. */
export const DEFAULT_COMPLETION_RATIO = 0.85;

export const DEFAULT_SEMANTICS: PlayedAtSemantics = 'end';

export interface PlayEvent {
  trackId: string;
  albumId: string;
  durationMs: number;
  playedAtMs: number;
}

export interface PlaybackSnapshot {
  trackId: string;
  albumId: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  shuffle: boolean;
  /** Spotify's server timestamp for the snapshot `progressMs` was read at. */
  timestampMs: number;
}

export interface PassAlbum {
  id: string;
  /** Track ids in album order. A pass has to follow this exactly. */
  trackIds: string[];
  /** Per-track runtime, parallel to `trackIds`. */
  durationsMs: number[];
}

export interface InFlightPass {
  tracksDone: number;
  total: number;
}

export interface PassResult {
  /** Complete listens found since the album arrived in its column. */
  completed: number;
  /** The pass underway, or null when none is. */
  inFlight: InFlightPass | null;
}

export interface DetectPassOptions {
  album: PassAlbum;
  /** `recently-played`, any order. Up to 50 items; that ceiling is accepted. */
  history: PlayEvent[];
  playback?: PlaybackSnapshot | null;
  /** The album's `added_at` in its current playlist — when it arrived in the column. */
  sinceMs: number;
  nowMs: number;
  semantics?: PlayedAtSemantics;
  ratio?: number;
}

/**
 * A history entry, or the synthetic event standing in for what is playing right
 * now — which always carries its progress, hence the union.
 */
type Candidate = PlayEvent &
  ({ live?: false; progressMs?: undefined } | { live: true; progressMs: number });

/**
 * Did this event's track actually play out? Judged against whichever neighbour
 * the chosen semantics makes meaningful.
 */
function isHeardInFull(
  events: Candidate[],
  index: number,
  semantics: PlayedAtSemantics,
  ratio: number,
  nowMs: number,
): boolean {
  const event = events[index];
  /* c8 ignore next -- index always comes from a loop over `events`. */
  if (!event) return false;

  const threshold = event.durationMs * ratio;

  if (event.live) {
    return event.progressMs >= threshold;
  }

  if (semantics === 'end') {
    const previous = events[index - 1];
    // Nothing before it in the window, so there is no gap to measure. Give it
    // the benefit of the doubt rather than silently losing the oldest listen.
    if (!previous) return true;
    return event.playedAtMs - previous.playedAtMs >= threshold;
  }

  const next = events[index + 1];
  const boundary = next ? next.playedAtMs : nowMs;
  return boundary - event.playedAtMs >= threshold;
}

/**
 * A completed run has to have taken about as long as the music does. True under
 * either reading of `played_at`, so it catches a skipped-through album even when
 * the semantics are set the wrong way round.
 */
function tookLongEnough(run: Candidate[], durationsMs: number[], ratio: number): boolean {
  if (run.length < 2) return true;
  const first = run[0] as Candidate;
  const last = run[run.length - 1] as Candidate;
  const total = durationsMs.reduce((sum, d) => sum + d, 0);
  // Under 'start' the elapsed span omits the last track; under 'end' it omits
  // the first. Requiring the smaller of the two is right either way.
  const expected = total - Math.max(first.durationMs, last.durationMs);
  return last.playedAtMs - first.playedAtMs >= expected * ratio;
}

/**
 * Drop the entry for a track that is playing right now. Spotify logs a track to
 * history once it passes 30 seconds, so the thing currently on can already be in
 * the window — and counting it as finished would credit a pass a minute early.
 */
function withoutCurrentTrack(history: PlayEvent[], playback: PlaybackSnapshot | null): PlayEvent[] {
  if (!playback?.isPlaying) return history;
  const trackStart = playback.timestampMs - playback.progressMs;
  return history.filter(
    (event) => !(event.trackId === playback.trackId && event.playedAtMs >= trackStart - 5000),
  );
}

export function detectPass({
  album,
  history,
  playback = null,
  sinceMs,
  nowMs,
  semantics = DEFAULT_SEMANTICS,
  ratio = DEFAULT_COMPLETION_RATIO,
}: DetectPassOptions): PassResult {
  const total = album.trackIds.length;
  if (total === 0) return { completed: 0, inFlight: null };

  const position = new Map<string, number>();
  album.trackIds.forEach((id, index) => position.set(id, index));

  const events: Candidate[] = [...withoutCurrentTrack(history, playback)].sort(
    (a, b) => a.playedAtMs - b.playedAtMs,
  );

  // Shuffle voids a pass outright, so a shuffled player contributes nothing.
  const liveOnThisAlbum =
    playback !== null &&
    playback.isPlaying &&
    !playback.shuffle &&
    playback.albumId === album.id &&
    position.has(playback.trackId);

  if (liveOnThisAlbum && playback) {
    // Stamp the synthetic event the same way Spotify stamps the real ones, or
    // it won't line up with them: under 'end' the timeline is made of finish
    // times, so the track underway contributes its projected finish.
    const trackStart = playback.timestampMs - playback.progressMs;
    events.push({
      trackId: playback.trackId,
      albumId: playback.albumId,
      durationMs: playback.durationMs,
      playedAtMs: semantics === 'end' ? trackStart + playback.durationMs : trackStart,
      progressMs: playback.progressMs,
      live: true,
    });
  }

  const heard = events.map((_, index) => isHeardInFull(events, index, semantics, ratio, nowMs));

  const completedRuns: Candidate[][] = [];
  let run: Candidate[] | null = null;
  let inFlightRun: Candidate[] | null = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as Candidate;
    const pos = event.albumId === album.id ? (position.get(event.trackId) ?? -1) : -1;
    const expected = run ? run.length : 0;

    if (pos !== expected) {
      // A foreign track, a track out of album order, or a jump: the run is over.
      // Track 1 is allowed to start a fresh one in the same breath.
      run = null;
      if (pos !== 0) continue;
    }

    const chain: Candidate[] = run ?? [];
    if (heard[index]) {
      chain.push(event);
      if (chain.length === total) {
        completedRuns.push(chain);
        run = null;
      } else {
        run = chain;
      }
    } else {
      // The track underway. Everything before it in this run is banked; the
      // chain stops here either way.
      inFlightRun = chain;
      run = null;
    }
  }

  // A run that simply ran out of history is the pass currently underway.
  if (run) inFlightRun = run;

  const completed = completedRuns.filter(
    (candidate) =>
      (candidate[0] as Candidate).playedAtMs >= sinceMs &&
      tookLongEnough(candidate, album.durationsMs, ratio),
  ).length;

  let inFlight: InFlightPass | null = null;
  if (inFlightRun && inFlightRun.length > 0) {
    const first = inFlightRun[0] as Candidate;
    if (first.playedAtMs >= sinceMs) {
      inFlight = { tracksDone: inFlightRun.length, total };
    }
  } else if (liveOnThisAlbum && playback && position.get(playback.trackId) === 0) {
    // Track 1 is on and hasn't reached the completion threshold yet: a pass has
    // begun, with nothing banked.
    inFlight = { tracksDone: 0, total };
  }

  return { completed, inFlight };
}

/** What the board needs per album, once its column and arrival time are known. */
export interface AlbumProgress {
  /** Completed listens found since arrival, capped by what the column can absorb. */
  passes: number;
  inFlight: InFlightPass | null;
}

export function albumProgress(
  options: DetectPassOptions & { passesAvailable: number },
): AlbumProgress {
  const result = detectPass(options);
  return {
    // An album in ×4 has one column left however many times it went round.
    passes: Math.min(result.completed, Math.max(0, options.passesAvailable)),
    inFlight: result.inFlight,
  };
}

export interface GapReading {
  trackName: string;
  durationMs: number;
  playedAt: string;
  /** Time to the next entry. Under 'start', this is how long this track played. */
  gapAfterMs: number | null;
  /** Time since the previous entry. Under 'end', this is how long this track played. */
  gapBeforeMs: number | null;
}

export interface SemanticsVerdict {
  readings: GapReading[];
  /** Mean |gap − duration| under each reading, in ms. Lower fits better. */
  startErrorMs: number | null;
  endErrorMs: number | null;
  bestFit: PlayedAtSemantics | null;
  sampleSize: number;
}

/**
 * Which reading of `played_at` matches this listener's history. Backs
 * `/api/diagnostics/played-at`, which is how the open question in the README
 * gets settled against a real account instead of by argument.
 */
export function analysePlayedAtSemantics(
  history: Array<PlayEvent & { trackName: string }>,
): SemanticsVerdict {
  const sorted = [...history].sort((a, b) => a.playedAtMs - b.playedAtMs);

  const readings: GapReading[] = sorted.map((event, index) => {
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    return {
      trackName: event.trackName,
      durationMs: event.durationMs,
      playedAt: new Date(event.playedAtMs).toISOString(),
      gapAfterMs: next ? next.playedAtMs - event.playedAtMs : null,
      gapBeforeMs: previous ? event.playedAtMs - previous.playedAtMs : null,
    };
  });

  // Only consecutive pairs close enough together to be one sitting say anything;
  // an overnight gap tells us nothing about how long a track played.
  const CONTIGUOUS_LIMIT_MS = 30 * 60 * 1000;
  const startErrors: number[] = [];
  const endErrors: number[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index] as PlayEvent;
    const next = sorted[index + 1] as PlayEvent;
    const gap = next.playedAtMs - current.playedAtMs;
    if (gap <= 0 || gap > CONTIGUOUS_LIMIT_MS) continue;
    startErrors.push(Math.abs(gap - current.durationMs));
    endErrors.push(Math.abs(gap - next.durationMs));
  }

  const mean = (values: number[]) =>
    values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

  const startErrorMs = mean(startErrors);
  const endErrorMs = mean(endErrors);
  const bestFit =
    startErrorMs === null || endErrorMs === null
      ? null
      : startErrorMs === endErrorMs
        ? null
        : startErrorMs < endErrorMs
          ? 'start'
          : 'end';

  return { readings, startErrorMs, endErrorMs, bestFit, sampleSize: startErrors.length };
}
