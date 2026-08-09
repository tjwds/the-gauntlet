'use client';

import { useMemo } from 'react';
import { BoardScreen } from '@/components/screens/BoardScreen';
import { FirstRecordsScreen } from '@/components/screens/FirstRecordsScreen';
import { LoginScreen } from '@/components/screens/LoginScreen';
import { SettingsScreen } from '@/components/screens/SettingsScreen';
import { SetupScreen } from '@/components/screens/SetupScreen';
import { createDemoApi } from '@/demo/api';
import type { DemoScreen } from '@/demo/screens';

/**
 * One screen of the product, wired to the demo dataset instead of Spotify.
 *
 * Nothing here is a copy of a screen: each one is the component the app itself
 * renders, given the `fetchImpl` it already accepts. A screenshot that drifted
 * from the product would be worse than no screenshot.
 */

const DEMO_USER = { name: 'joe', image: null };

/** The demo writes nowhere, so the flows a screen would navigate through end here. */
const noop = () => {};

export function DemoHarness({ screen, nowMs }: { screen: DemoScreen; nowMs: number }) {
  const fetchImpl = useMemo(
    () =>
      createDemoApi({
        nowMs,
        playing: screen === 'playing' || screen === 'advance',
        advancing: screen === 'advance',
      }),
    [screen, nowMs],
  );

  switch (screen) {
    case 'login':
      return <LoginScreen onSignIn={noop} />;
    case 'setup':
      return <SetupScreen userName="joe" onCreate={noop} />;
    case 'first-records':
      return <FirstRecordsScreen fetchImpl={fetchImpl} onStart={noop} onSkip={noop} />;
    case 'settings':
      return (
        <SettingsScreen
          fetchImpl={fetchImpl}
          nowMs={nowMs}
          onDisconnect={noop}
          onDeletePlaylists={noop}
        />
      );
    default:
      return <BoardScreen user={DEMO_USER} fetchImpl={fetchImpl} />;
  }
}
