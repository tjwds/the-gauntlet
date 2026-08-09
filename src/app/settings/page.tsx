import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { SettingsFlow } from '@/components/screens/flows';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.accessToken || session.error) redirect('/login');

  async function disconnect() {
    'use server';
    // Drops the session cookie. The playlists stay in the listener's library on
    // purpose — the listening history is theirs, in a format that outlives this.
    await signOut({ redirectTo: '/login' });
  }

  return <SettingsFlow onSignOut={disconnect} />;
}
