'use client';

import { Button } from '@heroui/react';
import { t } from '@/lib/copy';

export interface PlaybackAlertProps {
  message: string | null;
  onDismiss(): void;
}

/**
 * A playback command Spotify refused. It sits under the header rather than in
 * the bottom toast stack for two reasons: it can't be mistaken for the advance
 * toast, which reports something that worked, and it can't end up underneath
 * one. It stays until it is dismissed or the next command succeeds — an error
 * the listener has to act on shouldn't time out the way a confirmation does.
 */
export function PlaybackAlert({ message, onDismiss }: PlaybackAlertProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      data-testid="playback-alert"
      className="flex shrink-0 items-center gap-3 border-b border-separator bg-danger-soft px-5 py-2 text-[13px] text-danger-soft-foreground"
    >
      <span className="flex-1">{message}</span>
      <Button variant="tertiary" size="sm" onPress={onDismiss}>
        {t('playing.error.dismiss')}
      </Button>
    </div>
  );
}
