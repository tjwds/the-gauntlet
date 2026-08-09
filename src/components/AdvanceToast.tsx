'use client';

import { Button } from '@heroui/react';
import { AlbumArt } from './AlbumArt';
import { t } from '@/lib/copy';
import { getColumn } from '@/lib/domain/columns';
import { ordinal } from '@/lib/domain/format';
import type { Advance } from '@/hooks/useBoard';

export interface AdvanceToastProps {
  advance: Advance | null;
  onUndo(advance: Advance): void;
}

/**
 * The move is the payoff, so it gets a toast rather than happening silently.
 * Undo reverses the two playlist writes and puts the album back in the column
 * it left. It lives in the page and nowhere else, so a reload loses it —
 * recovering from that is a drag, which is what drag is for.
 */
export function AdvanceToast({ advance, onUndo }: AdvanceToastProps) {
  if (!advance) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-5 z-40 flex justify-center"
    >
      <div className="pointer-events-auto flex items-center gap-3.5 rounded-2xl bg-background-inverse px-4 py-3 text-[13px] text-background shadow-overlay">
        <AlbumArt src={advance.album.imageUrl} className="size-9" />
        <span>
          {t('playing.toast', {
            album: advance.album.name,
            n: ordinal(advance.listen),
            column: getColumn(advance.to).name,
          })}
        </span>
        <Button variant="primary" size="sm" onPress={() => onUndo(advance)}>
          {t('playing.toast.undo')}
        </Button>
      </div>
    </div>
  );
}
