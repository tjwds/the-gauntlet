'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SetupScreen } from './SetupScreen';
import { FirstRecordsScreen } from './FirstRecordsScreen';
import { SettingsScreen } from './SettingsScreen';

/**
 * The thin client wrappers between a page and a screen: navigation and the one
 * write each screen makes. The screens themselves stay presentational.
 */

export interface FlowProps {
  fetchImpl?: typeof fetch;
}

export function SetupFlow({ userName, fetchImpl }: FlowProps & { userName: string }) {
  const router = useRouter();
  const doFetch = fetchImpl ?? globalThis.fetch;
  const [error, setError] = useState<string | null>(null);

  return (
    <SetupScreen
      userName={userName}
      error={error}
      onCreate={async (isPrivate) => {
        setError(null);
        try {
          const response = await doFetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ private: isPrivate }),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            setError(body.error ?? "Spotify wouldn't create the playlists.");
            return;
          }
        } catch {
          setError('Could not reach Spotify.');
          return;
        }
        router.push('/first-records');
      }}
    />
  );
}

export function FirstRecordsFlow({ fetchImpl }: FlowProps) {
  const router = useRouter();
  const doFetch = fetchImpl ?? globalThis.fetch;

  return (
    <FirstRecordsScreen
      {...(fetchImpl ? { fetchImpl } : {})}
      onSkip={() => router.push('/')}
      // A new account returns nothing from /me/top/tracks, and an empty grid is
      // worse than no screen: go straight to the board and let them use Add albums.
      onEmpty={() => router.replace('/')}
      onStart={async (albumIds) => {
        const response = await doFetch('/api/board/albums', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ albumIds, to: 'queue' }),
        });
        // A refused write means the board isn't ready; the board read will say
        // so properly rather than this screen guessing.
        if (!response.ok) return;
        router.push('/');
      }}
    />
  );
}

export function SettingsFlow({
  fetchImpl,
  onSignOut,
}: FlowProps & { onSignOut(): void | Promise<void> }) {
  const router = useRouter();
  const doFetch = fetchImpl ?? globalThis.fetch;

  return (
    <SettingsScreen
      {...(fetchImpl ? { fetchImpl } : {})}
      onDisconnect={() => void onSignOut()}
      onDeletePlaylists={async () => {
        await doFetch('/api/setup', { method: 'DELETE' });
        router.push('/setup');
      }}
    />
  );
}
