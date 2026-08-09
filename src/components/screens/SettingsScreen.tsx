'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar, Button, Card, Chip, Spinner } from '@heroui/react';
import { PendingButton } from '../PendingButton';
import { t } from '@/lib/copy';
import { formatRelative } from '@/lib/domain/format';

export interface AccountPlaylist {
  columnId: string;
  name: string;
  missing: boolean;
  url?: string;
  albums?: number;
  tracks?: number;
}

export interface Account {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    product: string | null;
    image: string | null;
  };
  playlists: AccountPlaylist[];
  ready: boolean;
}

export interface SettingsScreenProps {
  onDisconnect(): void;
  onDeletePlaylists(): Promise<void> | void;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}

/**
 * An account, seven playlists and two ways out. Five controls used to live here
 * — the listen rule, the number of stages, a repeat throttle, a confirm switch
 * and a default view. Each changes what a column means, so all five were fixed,
 * which left Settings with nothing to set.
 */
export function SettingsScreen({
  onDisconnect,
  onDeletePlaylists,
  fetchImpl,
  nowMs,
}: SettingsScreenProps) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loadedAt, setLoadedAt] = useState<number>(() => nowMs ?? Date.now());
  // The last-sync line has to keep getting older, so the clock is state that
  // ticks rather than a Date.now() read during render.
  const [now, setNow] = useState<number>(() => nowMs ?? Date.now());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const doFetch = fetchImpl ?? globalThis.fetch;

  const load = async () => {
    setRescanning(true);
    try {
      const response = await doFetch('/api/account');
      if (response.ok) {
        setAccount(await response.json());
        const at = nowMs ?? Date.now();
        setLoadedAt(at);
        setNow(at);
      }
    } finally {
      setRescanning(false);
    }
  };

  useEffect(() => {
    // A one-shot read on mount; Re-scan is the deliberate second one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nowMs !== undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [nowMs]);

  if (!account) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background">
        <Spinner aria-label="Loading settings" />
      </main>
    );
  }

  const tier = account.user.product === 'premium' ? 'Premium' : 'Free';

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-220 px-7 pt-10 pb-24">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">{t('settings.title')}</h1>

        <Card>
          <Card.Header className="px-5 py-4 text-[15px] font-semibold tracking-tight">
            {t('settings.account.head')}
          </Card.Header>
          <div className="flex items-center gap-3.5 border-t border-separator px-5 py-3.5">
            <Avatar size="sm">
              {account.user.image ? (
                <Avatar.Image src={account.user.image} alt="" />
              ) : (
                <Avatar.Fallback>{(account.user.name ?? '?').slice(0, 1)}</Avatar.Fallback>
              )}
            </Avatar>
            <div className="flex-1">
              <div className="text-sm font-medium">
                {account.user.name}
                {account.user.email ? ` · ${account.user.email}` : ''}
              </div>
              <div className="text-[13px] text-muted">
                {t('settings.account.meta', { tier, time: formatRelative(loadedAt, now) })}
              </div>
            </div>
            <Button variant="ghost" onPress={onDisconnect}>
              {t('settings.reconnect')}
            </Button>
          </div>
        </Card>

        <h2 className="mt-8 mb-3 text-[15px] font-semibold tracking-tight">
          {t('settings.playlists.head')}
        </h2>
        <Card>
          <div className="flex flex-col">
            {account.playlists.map((playlist) => {
              const albums = playlist.albums ?? 0;
              const tracks = playlist.tracks ?? 0;
              return (
              <div
                key={playlist.columnId}
                className="flex items-center gap-3.5 border-b border-separator px-5 py-3.5 last:border-b-0"
              >
                <div className="flex-1 font-mono text-xs">{playlist.name}</div>
                {playlist.missing ? (
                  <Chip color="danger" size="sm">
                    missing
                  </Chip>
                ) : (
                  <Chip size="sm">
                    {tracks === 0
                      ? t('settings.playlist.empty')
                      : t('settings.playlist.counts', { a: albums, t: tracks })}
                  </Chip>
                )}
                {playlist.url && (
                  <a
                    href={playlist.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[13px] text-link underline"
                  >
                    {t('settings.playlist.open')}
                  </a>
                )}
              </div>
              );
            })}
          </div>
          {/*
            A re-read, not a merge: with no database there is nothing to
            reconcile against, because the playlists can't disagree with a
            private copy that doesn't exist.
          */}
          <Card.Footer className="border-t border-separator bg-surface-secondary px-5 py-3.5">
            <PendingButton variant="secondary" isPending={rescanning} onPress={() => void load()}>
              {t('settings.rescan')}
            </PendingButton>
          </Card.Footer>
        </Card>

        <h2 className="mt-8 mb-3 text-[15px] font-semibold tracking-tight">
          {t('settings.disconnect.head')}
        </h2>
        <Card>
          <div className="flex flex-col">
            <div className="flex items-center gap-3.5 border-b border-separator px-5 py-3.5">
              <div className="flex-1 text-sm font-medium">{t('settings.disconnect.label')}</div>
              <Button variant="ghost" onPress={onDisconnect}>
                {t('settings.disconnect.button')}
              </Button>
            </div>
            {/* Destructive and irreversible, so it asks first. */}
            <div className="flex items-center gap-3.5 px-5 py-3.5">
              <div className="flex-1 text-sm font-medium">
                {t('settings.deletePlaylists.label')}
                {confirmingDelete && (
                  <span className="ml-2 text-[13px] font-normal text-danger">
                    This removes all seven playlists from your Spotify library. Albums saved to your
                    library are untouched.
                  </span>
                )}
              </div>
              {confirmingDelete ? (
                <>
                  <Button variant="tertiary" onPress={() => setConfirmingDelete(false)}>
                    {t('add.cancel')}
                  </Button>
                  <Button
                    variant="danger"
                    onPress={() => {
                      setConfirmingDelete(false);
                      void onDeletePlaylists();
                    }}
                  >
                    {t('settings.deletePlaylists.button')}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onPress={() => setConfirmingDelete(true)}>
                  {t('settings.deletePlaylists.button')}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <p className="mt-6 text-[13px]">
          <Link href="/" className="text-link underline">
            {t('settings.backLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}
