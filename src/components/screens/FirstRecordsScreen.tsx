'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Card, cn, Spinner, Tabs } from '@heroui/react';
import { AlbumArt } from '../AlbumArt';
import { PendingButton } from '../PendingButton';
import { plural, t } from '@/lib/copy';
import type { Suggestion } from '@/lib/domain/suggestions';
import { DEFAULT_SUGGESTION_SELECTION, SUGGESTION_PAGE_SIZE } from '@/lib/domain/suggestions';
import { getColumn, PLAYLIST_PREFIX } from '@/lib/domain/columns';

type Range = 'short' | 'medium' | 'long';

export interface FirstRecordsScreenProps {
  onStart(albumIds: string[]): Promise<void> | void;
  onSkip(): void;
  /** Called when there is nothing to suggest, so the screen skips itself. */
  onEmpty?(): void;
  fetchImpl?: typeof fetch;
}

/**
 * Records the listener already knows a song from, ranked from their top songs.
 * Six is a suggested size, not a limit.
 *
 * Skipped entirely when it would come up empty: a new account returns nothing
 * from `/me/top/tracks`, and an empty grid is worse than no screen.
 */
export function FirstRecordsScreen({ onStart, onSkip, onEmpty, fetchImpl }: FirstRecordsScreenProps) {
  const [range, setRange] = useState<Range>('medium');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Every record seen under any time range, so the count in the bar still knows
  // the size of something picked under a range that isn't showing.
  const [seen, setSeen] = useState<Map<string, Suggestion>>(new Map());
  const [shown, setShown] = useState(SUGGESTION_PAGE_SIZE);
  const [busy, setBusy] = useState(false);

  const doFetch = fetchImpl ?? globalThis.fetch;
  // The suggested six are offered once. After that the picks are the listener's,
  // and changing the time range must not quietly undo them.
  const preselected = useRef(false);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void (async () => {
      try {
        const response = await doFetch(`/api/suggestions?range=${range}`);
        const body = await response.json();
        if (!live) return;
        const list: Suggestion[] = response.ok ? (body.suggestions ?? []) : [];
        setSuggestions(list);
        setSeen((current) => {
          const next = new Map(current);
          for (const suggestion of list) next.set(suggestion.id, suggestion);
          return next;
        });
        if (!preselected.current && list.length > 0) {
          preselected.current = true;
          setSelected(new Set(list.slice(0, DEFAULT_SUGGESTION_SELECTION).map((s) => s.id)));
        }
        setShown(SUGGESTION_PAGE_SIZE);
        setLoading(false);
        if (list.length === 0) onEmpty?.();
      } catch {
        if (!live) return;
        setSuggestions([]);
        setLoading(false);
        onEmpty?.();
      }
    })();
    return () => {
      live = false;
    };
    // onEmpty is a navigation callback; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, doFetch]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Counted across every range, not just the one on screen.
  const trackTotal = [...seen.values()]
    .filter((suggestion) => selected.has(suggestion.id))
    .reduce((total, suggestion) => total + suggestion.totalTracks, 0);

  const remaining = Math.max(0, suggestions.length - shown);

  return (
    <main className="flex h-dvh flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-220 px-7 pt-10 pb-24">
          <h1 className="mb-6 text-3xl font-bold tracking-tight">{t('first.title')}</h1>

          <Card>
            <Card.Header className="flex flex-wrap items-center gap-3 px-5 py-4 text-[15px] font-semibold tracking-tight">
              {t('first.panel.head')}
              <Tabs
                selectedKey={range}
                onSelectionChange={(key) => setRange(key as Range)}
                className="ml-auto"
              >
                <Tabs.List aria-label="How far back to look">
                  <Tabs.Tab id="short" className="whitespace-nowrap">
                    {t('first.range.4weeks')}
                  </Tabs.Tab>
                  <Tabs.Tab id="medium" className="whitespace-nowrap">
                    {t('first.range.6months')}
                  </Tabs.Tab>
                  <Tabs.Tab id="long" className="whitespace-nowrap">
                    {t('first.range.allTime')}
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs>
            </Card.Header>

            <Card.Content className="border-t border-separator p-5">
              {loading ? (
                <Spinner aria-label="Loading suggestions" />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2.5 board:grid-cols-2">
                    {suggestions.slice(0, shown).map((suggestion) => (
                      <SuggestionTile
                        key={suggestion.id}
                        suggestion={suggestion}
                        selected={selected.has(suggestion.id)}
                        onToggle={() => toggle(suggestion.id)}
                      />
                    ))}
                  </div>

                  <div className="mt-3.5 flex items-center gap-3">
                    {remaining > 0 && (
                      <Button
                        variant="ghost"
                        onPress={() => setShown((current) => current + SUGGESTION_PAGE_SIZE)}
                      >
                        {t('first.showMore', { n: remaining })}
                      </Button>
                    )}
                    <span className="flex-1 text-[13px] text-muted">{t('first.filterNote')}</span>
                  </div>
                </>
              )}
            </Card.Content>
          </Card>
        </div>
      </div>

      <div className="shrink-0 border-t border-separator px-7 py-3">
        <div className="mx-auto flex max-w-220 flex-wrap items-center gap-3">
          <span className="flex-1 text-[13px] text-muted">
            <strong>
              {plural(selected.size, '1 record selected', `${selected.size} records selected`)}
            </strong>{' '}
            · {plural(trackTotal, '1 track', `${trackTotal} tracks`)} will be added to{' '}
            <span className="font-mono text-xs">{`${PLAYLIST_PREFIX}${getColumn('queue').name}`}</span>
          </span>
          <Button variant="ghost" onPress={onSkip}>
            {t('first.cta.skip')}
          </Button>
          <PendingButton
            variant="primary"
            size="lg"
            isDisabled={selected.size === 0}
            isPending={busy}
            onPress={() => {
              setBusy(true);
              void Promise.resolve(onStart([...selected])).finally(() => setBusy(false));
            }}
          >
            {t('first.cta.primary')}
          </PendingButton>
        </div>
      </div>
    </main>
  );
}

function SuggestionTile({
  suggestion,
  selected,
  onToggle,
}: {
  suggestion: Suggestion;
  selected: boolean;
  onToggle(): void;
}) {
  const [first, second] = suggestion.matches;
  // Spotify ranks; it never counts plays. The tile must not claim a number of
  // plays, so it says where the track sits in the listener's top songs.
  const why =
    suggestion.matches.length > 1 && first && second
      ? t('first.why.multi', {
          track1: first.name,
          track2: second.name,
          n: suggestion.matches.length,
        })
      : first
        ? t('first.why.single', { track: first.name, rank: first.rank })
        : '';

  return (
    <label
      className={cn(
        'relative flex cursor-pointer gap-3 rounded-2xl bg-surface p-3 pr-10 ring-2 transition-shadow',
        selected ? 'bg-accent-soft ring-accent' : 'ring-surface-tertiary hover:ring-separator',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="sr-only"
        aria-label={`${suggestion.name} by ${suggestion.artist}`}
      />
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-3 right-3 grid size-5 place-items-center rounded-full border-2 text-[10px]',
          selected
            ? 'border-accent bg-accent text-accent-foreground'
            : 'border-surface-tertiary text-transparent',
        )}
      >
        ✓
      </span>
      <AlbumArt src={suggestion.imageUrl} className="size-16" />
      <span className="min-w-0 flex-1">
        <span className="clamp-2 text-sm leading-tight font-semibold tracking-tight">
          {suggestion.name}
        </span>
        <span className="block truncate text-[13px] text-muted">{suggestion.artist}</span>
        {/* No runtime here. Suggestions are grouped out of top tracks, which
            carry an album but not its track list, so the total would always
            read 0m — `summariseAlbum` defaults it to zero for exactly that
            case. Year and track count are both on the album itself. */}
        <span className="mt-0.5 block text-[11px] text-muted">
          {t('first.tile.meta', { year: suggestion.year, n: suggestion.totalTracks })}
        </span>
        <span className="mt-1.5 block text-[11px] leading-snug text-accent-soft-foreground">
          ♪ {why}
        </span>
      </span>
    </label>
  );
}
