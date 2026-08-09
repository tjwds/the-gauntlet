import { notFound } from 'next/navigation';
import { demoEnabled, isDemoScreen } from '@/demo/screens';
import { DemoHarness } from './DemoHarness';

/**
 * The demo harness: a screen of the product, rendered against the demo dataset
 * with no session and no Spotify app behind it. It exists for the screenshots
 * in the README — see `scripts/screenshots.mjs`.
 */

// Whether the harness is on is read per request, so a build can't bake in an
// answer from the environment it happened to be built in.
export const dynamic = 'force-dynamic';

export default async function DemoPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  if (!demoEnabled() || !isDemoScreen(screen)) notFound();

  // Read once here and handed down, so every date the screens format is the
  // same string on both sides of hydration, and so a screenshot taken today
  // shows a board that was last touched days ago rather than years.
  // eslint-disable-next-line react-hooks/purity -- this renders once per request, on the server.
  const nowMs = Date.now();

  return <DemoHarness screen={screen} nowMs={nowMs} />;
}
