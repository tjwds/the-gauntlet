import { cn } from '@heroui/react';
import { LISTENS_TO_DONE } from '@/lib/domain/columns';
import { t } from '@/lib/copy';

export interface ProgressDotsProps {
  listens: number;
  /** Omitted on the narrow board, where the column chip already says the count. */
  showLabel?: boolean;
  /** Replaces the `{n} of 5` label, e.g. `playing · track 6 of 7`. */
  label?: string;
}

/** Five dots: complete listens banked, always out of five. */
export function ProgressDots({ listens, showLabel = true, label }: ProgressDotsProps) {
  const text = label ?? t('card.dots.label', { n: listens });
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <span className="flex gap-1" role="img" aria-label={t('card.dots.label', { n: listens })}>
        {Array.from({ length: LISTENS_TO_DONE }, (_, index) => (
          <i
            key={index}
            data-testid={index < listens ? 'dot-on' : 'dot-off'}
            className={cn(
              'size-[7px] rounded-full',
              index < listens ? 'bg-accent' : 'bg-surface-tertiary',
            )}
          />
        ))}
      </span>
      {(showLabel || label) && <span className="ml-1 text-[11px] text-muted">{text}</span>}
    </div>
  );
}
