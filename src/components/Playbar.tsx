'use client';

import { Button, buttonVariants, cn, Dropdown, Slider, Tooltip } from '@heroui/react';
import { AlbumArt } from './AlbumArt';
import { PendingButton } from './PendingButton';
import { t } from '@/lib/copy';
import { formatClock, formatDuration } from '@/lib/domain/format';
import type { PlayerDevice, PlayerState, TransportCommand } from '@/hooks/usePlayer';

export interface PlaybarProps {
  state: PlayerState;
  devices: PlayerDevice[];
  albumArt?: string | null;
  /** Position within the record, which is the unit the board cares about. */
  albumPosition?: { trackNumber: number; totalTracks: number; msLeft: number } | null;
  onCommand(command: TransportCommand): void;
  onOpenDevices?(): void;
  /**
   * Put the record playing into the Queue. Passed only for a record on none of
   * the seven playlists — one already on the board has a card to act on, and
   * the playlist model can't hold it in two columns.
   */
  onAddToQueue?(): void;
  /** The add is a Spotify write plus a board read, so it is worth showing. */
  isAddingToQueue?: boolean;
}

export function Playbar({
  state,
  devices,
  albumArt = null,
  albumPosition = null,
  onCommand,
  onOpenDevices,
  onAddToQueue,
  isAddingToQueue,
}: PlaybarProps) {
  const { track } = state;
  if (!track) return null;

  return (
    <div
      data-testid="playbar"
      className="grid shrink-0 items-center gap-4 border-t border-separator px-5 py-2.5 board:grid-cols-[minmax(180px,1fr)_minmax(300px,1.6fr)_minmax(290px,1.1fr)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <AlbumArt src={albumArt} className="size-12" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{track.name}</div>
          <div className="truncate text-xs text-muted">
            {track.artist} · {track.albumName}
          </div>
          {albumPosition && (
            <div className="truncate font-mono text-[10px] text-muted">
              {t('card.playing.position', {
                n: albumPosition.trackNumber,
                total: albumPosition.totalTracks,
                time: formatDuration(albumPosition.msLeft),
              })}
            </div>
          )}
        </div>

        {/*
          A record put on from Spotify itself has no card anywhere on the board,
          so this bar is the only place it is named while it plays — and the only
          place it can be queued from without searching for it again.
        */}
        {onAddToQueue && (
          <PendingButton
            variant="primary"
            size="sm"
            className="shrink-0"
            isPending={isAddingToQueue}
            onPress={onAddToQueue}
          >
            {t('playing.addToQueue')}
          </PendingButton>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-3.5">
          {/*
            Shuffle is off and stays off while a board album is playing. A
            shuffled pass wouldn't count, and the app shouldn't let someone
            spend an hour finding that out.
          */}
          <Tooltip>
            <Tooltip.Trigger
              tabIndex={0}
              role="button"
              aria-disabled="true"
              aria-label={t('playing.shuffle.title')}
              data-testid="shuffle-disabled"
              className="grid size-8 cursor-default place-items-center rounded-full text-separator"
            >
              <ShuffleGlyph />
            </Tooltip.Trigger>
            <Tooltip.Content>{t('playing.shuffle.title')}</Tooltip.Content>
          </Tooltip>

          <TransportButton
            label={t('playing.prev.aria')}
            onPress={() => onCommand({ command: 'previous' })}
          >
            ⏮
          </TransportButton>

          <Button
            aria-label={state.isPlaying ? t('playing.pause.aria') : 'Play'}
            variant="primary"
            isIconOnly
            onPress={() => onCommand({ command: state.isPlaying ? 'pause' : 'resume' })}
          >
            <span aria-hidden="true">{state.isPlaying ? '❚❚' : '▶'}</span>
          </Button>

          {/* Skip stays live and ends the pass: blocking it would make the transport lie. */}
          <TransportButton
            label={t('playing.next.aria')}
            onPress={() => onCommand({ command: 'next' })}
          >
            ⏭
          </TransportButton>

          {/* Repeat is allowed, and every full pass it produces counts. */}
          <TransportButton
            label={t('playing.repeat.title')}
            pressed={state.repeat !== 'off'}
            onPress={() => onCommand({ command: 'repeat', value: state.repeat === 'off' ? 1 : 0 })}
          >
            ⟳
          </TransportButton>
        </div>

        <div className="flex w-full max-w-135 items-center gap-2.5">
          <span className="shrink-0 text-[11px] tabular-nums text-muted">
            {formatClock(state.progressMs)}
          </span>
          <Slider
            aria-label="Seek"
            value={state.progressMs}
            minValue={0}
            maxValue={Math.max(track.durationMs, 1)}
            onChangeEnd={(value) => onCommand({ command: 'seek', value: Number(value) })}
            className="flex-1"
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <span className="shrink-0 text-[11px] tabular-nums text-muted">
            {formatClock(track.durationMs)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-start gap-2 board:justify-end">
        <Dropdown onOpenChange={(open) => open && onOpenDevices?.()}>
          <Dropdown.Trigger className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            ⌂ {state.device?.name ?? 'No device'}
          </Dropdown.Trigger>
          <Dropdown.Popover placement="top end">
            <Dropdown.Menu
              onAction={(key) => onCommand({ command: 'transfer', deviceId: String(key) })}
            >
              {devices.map((device) => (
                <Dropdown.Item key={device.id ?? device.name} id={device.id ?? device.name}>
                  {device.name}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        <span className="font-mono text-[11px] text-muted">{t('playing.volume')}</span>
        <Slider
          aria-label={t('playing.volume')}
          value={state.device?.volume_percent ?? 100}
          minValue={0}
          maxValue={100}
          onChangeEnd={(value) => onCommand({ command: 'volume', value: Number(value) })}
          className="w-16"
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
      </div>
    </div>
  );
}

function TransportButton({
  label,
  children,
  pressed,
  onPress,
}: {
  label: string;
  children: React.ReactNode;
  pressed?: boolean;
  onPress(): void;
}) {
  return (
    <Button
      aria-label={label}
      variant="tertiary"
      isIconOnly
      size="sm"
      onPress={onPress}
      className={cn(pressed && 'text-accent')}
    >
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}

function ShuffleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M17 3l4 4-4 4V8h-2.2l-2 3-1.2-1.8L13.8 6H17V3zM3 6h5.2l6 9H17v-3l4 4-4 4v-3h-3.8l-6-9H3V6zm0 12h3.2l1.4-2.1 1.2 1.8L7 21H3v-3z" />
    </svg>
  );
}
