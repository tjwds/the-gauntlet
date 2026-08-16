import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Playbar } from './Playbar';
import type { PlayerState } from '@/hooks/usePlayer';

const state: PlayerState = {
  track: {
    id: 't1',
    name: 'Dream House',
    artist: 'Deafheaven',
    albumName: 'Sunbather',
    albumId: 'alb1',
    imageUrl: 'https://i.scdn.co/sunbather.jpg',
    durationMs: 544_000,
    trackNumber: 1,
  },
  device: { id: 'dev1', name: 'MacBook Pro', type: 'Computer', is_active: true, volume_percent: 64 },
  isPlaying: true,
  shuffle: false,
  repeat: 'off',
  progressMs: 192_000,
  albumId: 'alb1',
  albumContextId: 'alb1',
};

function setup(overrides: Partial<PlayerState> = {}, props: Partial<Parameters<typeof Playbar>[0]> = {}) {
  const onCommand = vi.fn();
  render(
    <Playbar
      state={{ ...state, ...overrides }}
      devices={[{ id: 'dev2', name: 'Kitchen speaker', type: 'Speaker', is_active: false, volume_percent: 30 }]}
      onCommand={onCommand}
      {...props}
    />,
  );
  return { onCommand };
}

describe('Playbar', () => {
  it('names the track, the artist and the record', () => {
    setup();
    expect(screen.getByText('Dream House')).toBeInTheDocument();
    expect(screen.getByText('Deafheaven · Sunbather')).toBeInTheDocument();
  });

  it('shows the artwork it was handed', () => {
    setup({}, { albumArt: 'https://i.scdn.co/sunbather.jpg' });
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'https://i.scdn.co/sunbather.jpg',
    );
  });

  it('falls back to the placeholder only when there is no artwork at all', () => {
    setup();
    expect(screen.getByTestId('album-art-placeholder')).toBeInTheDocument();
  });

  it('gives position in the record alongside position in the track', () => {
    setup({}, { albumPosition: { trackNumber: 6, totalTracks: 7, msLeft: 12 * 60_000 } });
    expect(screen.getByText('track 6 of 7 · 12m left')).toBeInTheDocument();
    expect(screen.getByText('3:12')).toBeInTheDocument();
    expect(screen.getByText('9:04')).toBeInTheDocument();
  });

  it('pauses what is playing', async () => {
    const { onCommand } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onCommand).toHaveBeenCalledWith({ command: 'pause' });
  });

  it('resumes what is paused', async () => {
    const { onCommand } = setup({ isPlaying: false });
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onCommand).toHaveBeenCalledWith({ command: 'resume' });
  });

  it('skips, which is allowed and ends the pass', async () => {
    const { onCommand } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(onCommand).toHaveBeenCalledWith({ command: 'next' });
  });

  it('goes back a track', async () => {
    const { onCommand } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Previous track' }));
    expect(onCommand).toHaveBeenCalledWith({ command: 'previous' });
  });

  it('turns repeat on, and every full pass it produces still counts', async () => {
    const { onCommand } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Repeat' }));
    expect(onCommand).toHaveBeenCalledWith({ command: 'repeat', value: 1 });
  });

  it('turns repeat off again', async () => {
    const { onCommand } = setup({ repeat: 'context' });
    await userEvent.click(screen.getByRole('button', { name: 'Repeat' }));
    expect(onCommand).toHaveBeenCalledWith({ command: 'repeat', value: 0 });
  });

  it('refuses to shuffle, and says why rather than just greying out', () => {
    const shuffle = screen.queryByTestId('shuffle-disabled');
    expect(shuffle).toBeNull();
    setup();
    const control = screen.getByTestId('shuffle-disabled');
    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(control).toHaveAccessibleName(
      "You can't shuffle here, we're listening to albums cover-to-cover!",
    );
  });

  it('hands playback to another device', async () => {
    const { onCommand } = setup();
    await userEvent.click(screen.getByRole('button', { name: /MacBook Pro/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Kitchen speaker' }));
    expect(onCommand).toHaveBeenCalledWith({ command: 'transfer', deviceId: 'dev2' });
  });

  it('falls back to a device name when Spotify gave it no id', async () => {
    const onCommand = vi.fn();
    render(
      <Playbar
        state={state}
        devices={[{ id: null, name: 'Restricted device', type: 'Speaker', is_active: false, volume_percent: null }]}
        onCommand={onCommand}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /MacBook Pro/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restricted device' }));
    expect(onCommand).toHaveBeenCalledWith({ command: 'transfer', deviceId: 'Restricted device' });
  });

  it('asks for the device list when the picker opens', async () => {
    const onOpenDevices = vi.fn();
    setup({}, { onOpenDevices });
    await userEvent.click(screen.getByRole('button', { name: /MacBook Pro/ }));
    expect(onOpenDevices).toHaveBeenCalled();
  });

  it('says so when nothing has a device yet', () => {
    setup({ device: null });
    expect(screen.getByRole('button', { name: /No device/ })).toBeInTheDocument();
  });

  it('carries a seek control across the whole track', () => {
    setup();
    const seek = screen.getByRole('slider', { name: 'Seek' });
    expect(seek).toHaveAttribute('max', '544000');
    expect(seek).toHaveValue('192000');
  });

  it('carries a volume control', () => {
    setup();
    expect(screen.getByRole('slider', { name: 'Vol' })).toHaveValue('64');
  });

  it('assumes full volume when Spotify reports none', () => {
    setup({ device: { ...state.device!, volume_percent: null } });
    expect(screen.getByRole('slider', { name: 'Vol' })).toHaveValue('100');
  });

  it('seeks when the scrubber is moved', async () => {
    const { onCommand } = setup();
    const seek = screen.getByRole('slider', { name: 'Seek' });
    seek.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'seek' }),
    );
  });

  it('changes volume when the slider is moved', async () => {
    const { onCommand } = setup();
    const volume = screen.getByRole('slider', { name: 'Vol' });
    volume.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onCommand).toHaveBeenCalledWith({ command: 'volume', value: 65 });
  });

  it('offers to queue the record playing when it has been given the way to', async () => {
    const onAddToQueue = vi.fn();
    setup({}, { onAddToQueue });
    await userEvent.click(screen.getByRole('button', { name: '+ Queue' }));
    expect(onAddToQueue).toHaveBeenCalled();
  });

  it('offers nothing for a record the board already holds', () => {
    // No handler is passed for a record on one of the seven playlists, which is
    // where the card that can act on it lives.
    setup();
    expect(screen.queryByRole('button', { name: '+ Queue' })).toBeNull();
  });

  it('shows the add happening, since it is a write and a board read', () => {
    setup({}, { onAddToQueue: vi.fn(), isAddingToQueue: true });
    expect(screen.getByTestId('pending-spinner')).toBeInTheDocument();
  });

  it('is nothing at all when nothing is playing', () => {
    const { container } = render(
      <Playbar state={{ ...state, track: null }} devices={[]} onCommand={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
