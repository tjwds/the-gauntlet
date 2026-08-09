import { ProgressBar } from '@heroui/react';
import { t } from '@/lib/copy';
import type { InFlightPass } from '@/lib/domain/pass';

export interface PassProgressProps {
  pass: InFlightPass;
}

/**
 * How far into the current pass. Shown only while one is underway, which is
 * what makes the bare `4 / 13` legible without a label.
 *
 * It answers the harsher question too: a skip ends the pass and this row
 * disappears. The cost of the rule belongs on the board, not in a help page.
 */
export function PassProgress({ pass }: PassProgressProps) {
  const value = pass.total === 0 ? 0 : (pass.tracksDone / pass.total) * 100;

  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
      <ProgressBar
        aria-label={`Pass progress: ${pass.tracksDone} of ${pass.total} tracks`}
        value={value}
        className="flex-1"
        size="sm"
      >
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      <span className="tabular-nums">
        {t('card.pass', { done: pass.tracksDone, total: pass.total })}
      </span>
    </div>
  );
}
