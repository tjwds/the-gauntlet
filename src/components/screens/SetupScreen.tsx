'use client';

import { useState } from 'react';
import { Card, Chip, Switch } from '@heroui/react';
import { PendingButton } from '../PendingButton';
import { plural, t } from '@/lib/copy';
import { COLUMNS } from '@/lib/domain/columns';

export interface SetupScreenProps {
  userName: string;
  onCreate(isPrivate: boolean): Promise<void> | void;
  /** What Spotify refused, when it refused. */
  error?: string | null;
  learnMoreUrl?: string;
}

const METHOD_POST =
  'https://blog.joewoods.dev/music/the-album-gauntlet-over-engineered-music-appreciation/';

/**
 * Seven playlists = five stages + Done + Abandoned. A panel stating three rules
 * used to sit under this one; it's a link now. The rules were never this app's
 * to define, and restating them made a setup screen argue for a system the
 * reader had already opted into.
 */
export function SetupScreen({
  userName,
  onCreate,
  error = null,
  learnMoreUrl = METHOD_POST,
}: SetupScreenProps) {
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-220 px-7 pt-10 pb-24">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">{t('setup.title')}</h1>

        <Card className="mt-6">
          <Card.Header className="flex flex-wrap items-center gap-2 px-5 py-4 text-[15px] font-semibold tracking-tight">
            {t('setup.playlists.head')}
            <span className="text-[13px] font-normal text-muted">
              {t('setup.playlists.sub', { user: userName })}
            </span>
          </Card.Header>

          <div className="border-t border-separator px-5 py-4">
            <Switch isSelected={isPrivate} onChange={setIsPrivate}>
              {/* The label belongs inside Switch.Content, which is the <label>
                  element — outside it, the control has no accessible name. */}
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                {t('setup.private.label')}
              </Switch.Content>
            </Switch>
          </div>

          <div className="flex flex-col border-t border-separator">
            {COLUMNS.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-3.5 border-b border-separator px-5 py-3.5 last:border-b-0"
              >
                <div className="flex-1 text-sm font-medium">{column.playlistName}</div>
                <Chip
                  size="sm"
                  {...(column.id === 'done' ? { color: 'accent' as const, variant: 'primary' as const } : {})}
                >
                  {column.listens === null
                    ? '—'
                    : plural(column.listens, '1 play', `${column.listens} plays`)}
                </Chip>
              </div>
            ))}
          </div>

          {/*
            The names are how the app finds these again on every load, since
            nothing is stored — so renaming one really does orphan that column.
          */}
          <Card.Footer className="border-t border-separator px-5 py-3.5 text-[13px] text-muted">
            {t('setup.playlists.foot')}
          </Card.Footer>
        </Card>

        <p className="mt-4.5">
          <a href={learnMoreUrl} target="_blank" rel="noreferrer noopener" className="text-link underline">
            {t('setup.learnMore')}
          </a>
        </p>

        {/* Creating the playlists is the one thing this screen does; if Spotify
            refuses, saying so beats moving on to a board that can't exist. */}
        {error && (
          <p
            role="alert"
            className="mt-4.5 rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-4.5 flex flex-wrap items-center gap-3">
          <PendingButton
            variant="primary"
            size="lg"
            isPending={busy}
            onPress={() => {
              setBusy(true);
              void Promise.resolve(onCreate(isPrivate)).finally(() => setBusy(false));
            }}
          >
            {t('setup.cta.primary')}
          </PendingButton>
          {/* A spinner alone says nothing about why a large library takes a moment. */}
          {busy && <span className="text-[13px] text-muted">{t('setup.creating')}</span>}
        </div>
      </div>
    </main>
  );
}
