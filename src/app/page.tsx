import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BoardScreen } from '@/components/screens/BoardScreen';
import { displayNameOrNull } from '@/lib/domain/text';

export default async function BoardPage() {
  const session = await auth();
  if (!session?.accessToken || session.error) redirect('/login');

  return (
    <BoardScreen
      user={{ name: displayNameOrNull(session.user?.name), image: session.user?.image ?? null }}
    />
  );
}
