import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { FirstRecordsFlow } from '@/components/screens/flows';

export default async function FirstRecordsPage() {
  const session = await auth();
  if (!session?.accessToken || session.error) redirect('/login');

  return <FirstRecordsFlow />;
}
