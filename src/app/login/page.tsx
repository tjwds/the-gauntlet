import { redirect } from 'next/navigation';
import { auth, signIn } from '@/auth';
import { LoginScreen } from '@/components/screens/LoginScreen';

/**
 * Anyone who isn't on the app's five-listener allowlist is turned away by
 * Spotify's own consent screen and comes back here with an error. We can't know
 * the account before consent, so a plain explanation on the way back is the
 * only thing to offer.
 */
const MESSAGES: Record<string, string> = {
  AccessDenied:
    "Spotify wouldn't let that account in. This instance is limited to five listeners, each added by hand in its Spotify developer dashboard.",
  Configuration: 'This instance is missing its Spotify credentials.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.accessToken && !session.error) redirect('/');

  const params = await searchParams;
  const code = typeof params.error === 'string' ? params.error : null;
  const error = code ? (MESSAGES[code] ?? 'Signing in with Spotify failed. Try again?') : null;

  async function startSignIn() {
    'use server';
    await signIn('spotify', { redirectTo: '/' });
  }

  return <LoginScreen onSignIn={startSignIn} error={error} />;
}
