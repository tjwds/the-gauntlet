import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SetupFlow } from '@/components/screens/flows';

export default async function SetupPage() {
  const session = await auth();
  if (!session?.accessToken || session.error) redirect('/login');

  return <SetupFlow userName={session.user?.name ?? session.user?.id ?? 'you'} />;
}
