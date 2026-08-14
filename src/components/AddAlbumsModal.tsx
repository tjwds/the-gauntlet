'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, buttonVariants, Chip, cn, Input, Modal, Spinner, Tabs, TextField } from '@heroui/react';
import { AlbumArt } from './AlbumArt';
import { PendingButton } from './PendingButton';
import { PlaylistPicker } from './PlaylistPicker';
import { PlaylistTracks } from './PlaylistTracks';
import { plural, t } from '@/lib/copy';
import type { CatalogueAlbum, ImportablePlaylist } from '@/lib/board/catalogue';
import { getColumn, PLAYLIST_PREFIX } from '@/lib/domain/columns';
import { formatDuration } from '@/lib/domain/format';
import type { AlbumTrackRow, PlaylistTrackRow } from '@/lib/domain/playlistTracks';

export type AddSource = 'search' | 'saved' | 'playlist';

/**
 * What a write reported back: the refusal, when Spotify wouldn't take it, and
 * nothing at all when it went through. A result row acts on its own press, so
 * it has to be told whether the record actually landed in the Queue.
 */
export type AddOutcome = string | null | void;

export interface AddAlbumsModalProps {
  isOpen: boolean;
  onOpenChange(open: boolean): void;
  onAdd(albumIds: string[]): Promise<AddOutcome> | AddOutcome;
  /** Injected so the modal can be exercised without a network. */
  fetchCatalogue?: typeof fetch;
}

interface LoadState {
  albums: CatalogueAlbum[];
  playlists: ImportablePlaylist[];
  tracks: PlaylistTrackRow[];
  loading: boolean;
  error: string | null;
}

const EMPTY: LoadState = { albums: [], playlists: [], tracks: [], loading: false, error: null };

/**
 * A selected album. It carries its own track count because that — not the
 * playlist's copy of the ticked track — is what gets appended to the Queue.
 * `rowKey` remembers which track row ticked it, so the rest of that album's
 * tracks can read *same album* rather than offering a second tick.
 */
interface SelectedAlbum {
  id: string;
  totalTracks: number;
  rowKey?: string;
}

export function AddAlbumsModal({ isOpen, onOpenChange, onAdd, fetchCatalogue }: AddAlbumsModalProps) {
  const [source, setSource] = useState<AddSource>('search');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [playlist, setPlaylist] = useState<ImportablePlaylist | null>(null);
  const [state, setState] = useState<LoadState>(EMPTY);
  const [selected, setSelected] = useState<Map<string, SelectedAlbum>>(new Map());
  const [saving, setSaving] = useState(false);
  // Records this visit has already put in the Queue, by track count, so the
  // rows they came from stop offering and the footer can total them up.
  const [queued, setQueued] = useState<Map<string, number>>(new Map());
  // The presses still in flight. A set rather than a flag: two rows can be
  // pressed a moment apart, and each is its own write.
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  const [writeError, setWriteError] = useState<string | null>(null);

  const doFetch = fetchCatalogue ?? globalThis.fetch;
  const playlistId = playlist?.id ?? null;

  const load = useCallback(
    async (url: string) => {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await doFetch(url);
        const body = await response.json();
        if (!response.ok) {
          setState({ ...EMPTY, error: body.error ?? 'Something went wrong' });
          return;
        }
        setState({
          albums: body.albums ?? [],
          playlists: body.playlists ?? [],
          tracks: body.tracks ?? [],
          loading: false,
          error: null,
        });
      } catch {
        setState({ ...EMPTY, error: 'Could not reach Spotify' });
      }
    },
    [doFetch],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (source === 'saved') {
      // Loading data, not cascading renders: the setState happens after the
      // request resolves, which the rule can't see through.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load('/api/catalogue?source=saved');
      return;
    }
    if (source === 'playlist') {
      void load(
        playlistId ? `/api/catalogue?source=playlist&id=${playlistId}` : '/api/catalogue?source=playlists',
      );
      return;
    }
    if (query.trim() === '') {
      setState(EMPTY);
      return;
    }
    const timer = setTimeout(() => void load(`/api/catalogue?q=${encodeURIComponent(query.trim())}`), 250);
    return () => clearTimeout(timer);
  }, [isOpen, source, query, playlistId, load]);

  const select = (album: SelectedAlbum) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(album.id)) next.delete(album.id);
      else next.set(album.id, album);
      return next;
    });
  };

  /** Every addable album at once: the whole-playlist case. */
  const selectAll = (albumIds: string[]) => {
    setSelected((current) => {
      const next = new Map(current);
      for (const row of state.tracks) {
        if (row.kind !== 'track' || !albumIds.includes(row.album.id) || next.has(row.album.id)) continue;
        next.set(row.album.id, { id: row.album.id, totalTracks: row.album.totalTracks, rowKey: row.key });
      }
      return next;
    });
  };

  // What the Queue is about to gain: each selected album's own track count, not
  // the playlist's copies of whichever tracks were ticked.
  const trackTotal = [...selected.values()].reduce((total, album) => total + album.totalTracks, 0);
  const addedTotal = [...queued.values()].reduce((total, tracks) => total + tracks, 0);

  /** Nothing the modal holds outlives a visit to it. */
  const close = () => {
    setSelected(new Map());
    setQueued(new Map());
    setWriteError(null);
    onOpenChange(false);
  };

  /**
   * One record, added now. The button on a result row is the whole gesture —
   * there is nothing left to confirm — so the row itself reports what happened,
   * and the modal stays open for the next one.
   */
  const queue = async (album: CatalogueAlbum) => {
    setAdding((current) => new Set(current).add(album.id));
    setWriteError(null);
    const refusal = (await onAdd([album.id])) ?? null;
    setAdding((current) => {
      const next = new Set(current);
      next.delete(album.id);
      return next;
    });
    if (refusal !== null) {
      setWriteError(refusal);
      return;
    }
    setQueued((current) => new Map(current).set(album.id, album.totalTracks));
  };

  /** The ticked albums of a playlist, which is the one place a batch is picked. */
  const confirm = async () => {
    setSaving(true);
    setWriteError(null);
    const refusal = (await onAdd([...selected.keys()])) ?? null;
    setSaving(false);
    if (refusal !== null) {
      // Staying open keeps the ticks, which is what a second attempt needs.
      setWriteError(refusal);
      return;
    }
    close();
  };

  const picking = source === 'playlist' && playlist === null;
  // The playlist tab picks a batch and writes it on confirm; the two lists of
  // albums write a record per press, so their footer only has to close.
  const batching = source === 'playlist';
  const visiblePlaylists = state.playlists.filter((entry) =>
    entry.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <Modal.Root isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : close())}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog aria-label={t('add.modal.aria')}>
            <Modal.Header className="flex items-center gap-3 px-5 pt-4.5 pb-2.5">
              <Modal.Heading className="text-lg font-semibold tracking-tight">
                {t('add.modal.title')}
              </Modal.Heading>
              <Modal.CloseTrigger
                aria-label={t('common.close.aria')}
                className={cn(buttonVariants({ variant: 'tertiary', isIconOnly: true }), 'ml-auto')}
              >
                <span aria-hidden="true">✕</span>
              </Modal.CloseTrigger>
            </Modal.Header>

            <Modal.Body className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {/* The track list names the playlist it is showing, so it needs no
                  field of its own. */}
              {playlist === null && (
                <TextField
                  aria-label={picking ? t('add.playlist.filter') : t('add.modal.title')}
                  value={picking ? filter : query}
                  onChange={picking ? setFilter : setQuery}
                  className="mb-3 w-full"
                >
                  <Input
                    placeholder={
                      picking ? t('add.playlist.filter') : 'Search Spotify, or paste an album link'
                    }
                  />
                </TextField>
              )}

              <Tabs
                selectedKey={source}
                onSelectionChange={(key) => {
                  setSource(key as AddSource);
                  setPlaylist(null);
                }}
                className="mb-3.5"
              >
                <Tabs.List aria-label="Where to add albums from">
                  <Tabs.Tab id="search">{t('add.tab.search')}</Tabs.Tab>
                  <Tabs.Tab id="saved">{t('add.tab.saved', { n: state.albums.length })}</Tabs.Tab>
                  <Tabs.Tab id="playlist">{t('add.tab.fromPlaylist')}</Tabs.Tab>
                </Tabs.List>
              </Tabs>

              {state.loading && <Spinner aria-label="Loading" />}
              {state.error && <p className="text-[13px] text-danger">{state.error}</p>}

              {picking && !state.loading && (
                <PlaylistPicker playlists={visiblePlaylists} onOpen={setPlaylist} />
              )}

              {source === 'playlist' && playlist !== null && !state.loading && (
                <PlaylistTracks
                  playlist={playlist}
                  rows={state.tracks}
                  selection={selected}
                  onToggle={(row: AlbumTrackRow) =>
                    select({ id: row.album.id, totalTracks: row.album.totalTracks, rowKey: row.key })
                  }
                  onSelectAll={selectAll}
                  onClear={() => setSelected(new Map())}
                  onChangePlaylist={() => setPlaylist(null)}
                />
              )}

              {state.albums.map((album) => (
                <ResultRow
                  key={album.id}
                  album={album}
                  queued={queued.has(album.id)}
                  isAdding={adding.has(album.id)}
                  onQueue={() => void queue(album)}
                />
              ))}

              {source !== 'playlist' && (
                <p className="mt-1.5 px-2 text-[13px] text-muted">{t('add.pasteNote')}</p>
              )}
            </Modal.Body>

            <Modal.Footer className="flex items-center gap-3 border-t border-separator px-5 py-4">
              {/* A refused write is reported here rather than beside the row it
                  came from: the footer is the one part of the modal that a
                  scrolled list can't take off screen. */}
              {writeError ? (
                <span role="alert" className="flex-1 text-[13px] text-danger">
                  {writeError}
                </span>
              ) : (
                <span className="flex-1 text-[13px] text-muted">
                  {/* Nothing is selectable on the picker itself, so it says so
                      rather than counting down from zero. */}
                  {picking && t('add.foot.empty')}

                  {batching && !picking && (
                    <>
                      <strong>
                        {plural(
                          selected.size,
                          '1 album selected',
                          `${selected.size} albums selected`,
                        )}
                      </strong>{' '}
                      · {plural(trackTotal, '1 track', `${trackTotal} tracks`)} will be appended to{' '}
                      <span className="font-mono text-xs">{`${PLAYLIST_PREFIX}${getColumn('queue').name}`}</span>
                    </>
                  )}

                  {/* Past tense, and only once there is something to report:
                      each of these records is already in the playlist. */}
                  {!batching && queued.size > 0 && (
                    <>
                      <strong>
                        {plural(queued.size, '1 album added', `${queued.size} albums added`)}
                      </strong>{' '}
                      · {plural(addedTotal, '1 track', `${addedTotal} tracks`)} appended to{' '}
                      <span className="font-mono text-xs">{`${PLAYLIST_PREFIX}${getColumn('queue').name}`}</span>
                    </>
                  )}
                </span>
              )}

              {batching ? (
                <>
                  <Button variant="tertiary" onPress={close}>
                    {t('add.cancel')}
                  </Button>
                  <PendingButton
                    variant="primary"
                    isDisabled={selected.size === 0}
                    isPending={saving}
                    onPress={() => void confirm()}
                  >
                    {t('add.confirm')}
                  </PendingButton>
                </>
              ) : (
                // Nothing to confirm and nothing to cancel: the records went in
                // as they were pressed.
                <Button variant="primary" onPress={close}>
                  {t('add.done')}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

function ResultRow({
  album,
  queued,
  isAdding,
  onQueue,
}: {
  album: CatalogueAlbum;
  queued: boolean;
  isAdding: boolean;
  onQueue(): void;
}) {
  const added = useRef<HTMLSpanElement>(null);

  // The button that was pressed is gone by now, and a dialog with nothing
  // focused sends the next Tab back to its ✕. Taking the focus to the chip
  // that replaced the button keeps a run of adds going down the list rather
  // than restarting at the top of the modal each time.
  useEffect(() => {
    if (queued) added.current?.focus();
  }, [queued]);

  return (
    <div className="flex items-center gap-3.5 rounded-xl p-2.5 hover:bg-surface-secondary">
      <AlbumArt src={album.imageUrl} className="size-12" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{album.name}</div>
        <div className="truncate text-[13px] text-muted">
          {t('add.result.meta', {
            artist: album.artist,
            year: album.year,
            n: album.totalTracks,
            duration: formatDuration(album.durationMs),
          })}
        </div>
      </div>

      {/*
        Anything already on the board is shown with its column instead of an add
        button. The playlist model can't hold one album in two columns.
      */}
      {album.onBoard ? (
        <Chip size="sm">
          {t('add.chip.onBoard', { column: getColumn(album.onBoard).name })}
        </Chip>
      ) : queued ? (
        // Added a moment ago, by this press. A chip rather than a button,
        // because the record is in the Queue and there is nothing left to press.
        // It takes focus but not a tab stop: somewhere to land, not somewhere to
        // have to tab past on the way down the list.
        <Chip color="accent" variant="soft" size="sm" ref={added} tabIndex={-1}>
          {t('add.chip.added')}
        </Chip>
      ) : (
        <PendingButton variant="primary" size="sm" isPending={isAdding} onPress={onQueue}>
          {t('add.btn.queue')}
        </PendingButton>
      )}
    </div>
  );
}
