import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirstRecordsScreen } from './FirstRecordsScreen';
import type { Suggestion } from '@/lib/domain/suggestions';

function aSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'ants',
    name: 'Ants From Up There',
    uri: 'spotify:album:ants',
    artist: 'Black Country, New Road',
    year: '2022',
    imageUrl: null,
    totalTracks: 10,
    durationMs: 59 * 60_000,
    albumType: 'album',
    matches: [{ name: 'Concorde', rank: 3 }],
    bestRank: 3,
    ...overrides,
  };
}

function stubApi(suggestions: Suggestion[], byRange: Partial<Record<string, Suggestion[]>> = {}) {
  const urls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const range = new URL(url, 'http://x').searchParams.get('range') ?? '';
    return new Response(JSON.stringify({ suggestions: byRange[range] ?? suggestions }), {
      status: 200,
    });
  });
  return { impl: impl as unknown as typeof fetch, urls };
}

function setup(suggestions: Suggestion[], props: Partial<Parameters<typeof FirstRecordsScreen>[0]> = {}) {
  const { impl, urls } = stubApi(suggestions);
  const onStart = vi.fn();
  const onSkip = vi.fn();
  const onEmpty = vi.fn();
  render(
    <FirstRecordsScreen
      onStart={onStart}
      onSkip={onSkip}
      onEmpty={onEmpty}
      fetchImpl={impl}
      {...props}
    />,
  );
  return { onStart, onSkip, onEmpty, urls };
}

const twelve = Array.from({ length: 14 }, (_, index) =>
  aSuggestion({ id: `a${index}`, name: `Album ${index}` }),
);

describe('FirstRecordsScreen', () => {
  it('offers the records the listener already knows a song from', async () => {
    setup([aSuggestion()]);
    await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());
    expect(screen.getByText('Black Country, New Road')).toBeInTheDocument();
    expect(screen.getByText('2022 · 10 tracks')).toBeInTheDocument();
  });

  it('says where a single track sits in the top songs, never how many plays', async () => {
    setup([aSuggestion()]);
    await waitFor(() =>
      expect(screen.getByText(/Concorde · #3 in your top songs/)).toBeInTheDocument(),
    );
  });

  it('says how many of a record the listener knows when it is more than one', async () => {
    setup([
      aSuggestion({
        matches: [
          { name: 'Concorde', rank: 3 },
          { name: 'Basketball Shoes', rank: 9 },
        ],
      }),
    ]);
    await waitFor(() =>
      expect(
        screen.getByText(/Concorde, Basketball Shoes · 2 of your top 50/),
      ).toBeInTheDocument(),
    );
  });

  it('preselects six, which is a suggested size and not a limit', async () => {
    setup(twelve);
    await waitFor(() => expect(screen.getByText('6 records selected')).toBeInTheDocument());
  });

  it('counts the tracks the picks will cost the Queue', async () => {
    setup([aSuggestion()]);
    await waitFor(() => expect(screen.getByText(/10 tracks will be added to/)).toBeInTheDocument());
  });

  it('lets a record be added or dropped', async () => {
    setup([aSuggestion()]);
    await waitFor(() => expect(screen.getByText('1 record selected')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('0 records selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('1 record selected')).toBeInTheDocument();
  });

  it('shows twelve, then the rest behind a button', async () => {
    setup(twelve);
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(12));
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(14);
  });

  it('offers no Show more when everything already fits', async () => {
    setup([aSuggestion()]);
    await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Show/ })).not.toBeInTheDocument();
  });

  it('says singles are left off', async () => {
    setup([aSuggestion()]);
    await waitFor(() =>
      expect(screen.getByText('Singles are left off this list.')).toBeInTheDocument(),
    );
  });

  it.each([
    ['4 weeks', 'range=short'],
    ['All time', 'range=long'],
  ])('reads a different window when %s is chosen', async (label, expected) => {
    const { urls } = setup([aSuggestion()]);
    await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: label }));
    await waitFor(() => expect(urls.some((url) => url.includes(expected))).toBe(true));
  });

  it('fills the Queue with what was picked', async () => {
    const { onStart } = setup([aSuggestion()]);
    await waitFor(() => expect(screen.getByText('1 record selected')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Start listening' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(['ants']));
  });

  it('will not start with nothing picked', async () => {
    setup([aSuggestion()]);
    await waitFor(() => expect(screen.getByText('1 record selected')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeDisabled();
  });

  describe('picks made across time ranges', () => {
    const ants = aSuggestion({ id: 'ants', name: 'Ants From Up There' });
    const bolt = aSuggestion({ id: 'bolt', name: 'Fetch the Bolt Cutters', totalTracks: 13 });

    function setupRanges() {
      const { impl } = stubApi([], { medium: [ants], long: [bolt] });
      const onStart = vi.fn();
      render(<FirstRecordsScreen onStart={onStart} onSkip={vi.fn()} fetchImpl={impl} />);
      return { onStart };
    }

    it('keeps a record deselected after switching range and back', async () => {
      setupRanges();
      await waitFor(() => expect(screen.getByText('1 record selected')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('checkbox'));
      expect(screen.getByText('0 records selected')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'All time' }));
      await waitFor(() => expect(screen.getByText('Fetch the Bolt Cutters')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('tab', { name: '6 months' }));
      await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());

      // The suggested six are offered once; after that the picks are the listener's.
      expect(screen.getByText('0 records selected')).toBeInTheDocument();
    });

    it('counts a record picked under another range, and its tracks', async () => {
      setupRanges();
      await waitFor(() => expect(screen.getByText('1 record selected')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'All time' }));
      await waitFor(() => expect(screen.getByText('Fetch the Bolt Cutters')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('checkbox'));

      expect(screen.getByText('2 records selected')).toBeInTheDocument();
      expect(screen.getByText(/23 tracks will be added to/)).toBeInTheDocument();
    });

    it('queues everything picked, whichever range it was picked under', async () => {
      const { onStart } = setupRanges();
      await waitFor(() => expect(screen.getByText('1 record selected')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'All time' }));
      await waitFor(() => expect(screen.getByText('Fetch the Bolt Cutters')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('checkbox'));
      await userEvent.click(screen.getByRole('button', { name: /Start listening/ }));

      await waitFor(() => expect(onStart).toHaveBeenCalledWith(['ants', 'bolt']));
    });

    it('offers the suggested six once a range finally has something to offer', async () => {
      // An empty range mustn't burn the one preselection the screen gets.
      const { impl } = stubApi([], { medium: [], long: [ants, bolt] });
      render(<FirstRecordsScreen onStart={vi.fn()} onSkip={vi.fn()} fetchImpl={impl} />);
      await waitFor(() => expect(screen.getByText('0 records selected')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'All time' }));
      await waitFor(() => expect(screen.getByText('2 records selected')).toBeInTheDocument());
    });
  });

  it('lets the listener pick their own instead', async () => {
    const { onSkip } = setup([aSuggestion()]);
    await userEvent.click(screen.getByRole('button', { name: "Skip — I'll pick my own" }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('skips itself for an account with no listening history', async () => {
    // An empty grid is worse than no screen.
    const { onEmpty } = setup([]);
    await waitFor(() => expect(onEmpty).toHaveBeenCalled());
  });

  it('skips itself when Spotify would not answer', async () => {
    const impl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const onEmpty = vi.fn();
    render(
      <FirstRecordsScreen onStart={vi.fn()} onSkip={vi.fn()} onEmpty={onEmpty} fetchImpl={impl} />,
    );
    await waitFor(() => expect(onEmpty).toHaveBeenCalled());
  });

  it('shows nothing rather than stale suggestions when the read is refused', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }),
    ) as unknown as typeof fetch;
    const onEmpty = vi.fn();
    render(
      <FirstRecordsScreen onStart={vi.fn()} onSkip={vi.fn()} onEmpty={onEmpty} fetchImpl={impl} />,
    );
    await waitFor(() => expect(onEmpty).toHaveBeenCalled());
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it("uses the browser's own fetch when it is given none", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = stubApi([aSuggestion()]).impl;
    render(<FirstRecordsScreen onStart={vi.fn()} onSkip={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());
    globalThis.fetch = original;
  });

  it('copes with a response that carries no suggestions at all', async () => {
    const impl = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    ) as unknown as typeof fetch;
    render(<FirstRecordsScreen onStart={vi.fn()} onSkip={vi.fn()} fetchImpl={impl} />);
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0));
  });

  it('does not touch a screen the listener has already left', async () => {
    let release: (value: Response) => void = () => {};
    const impl = vi.fn(
      () => new Promise<Response>((resolve) => (release = resolve)),
    ) as unknown as typeof fetch;
    const onEmpty = vi.fn();
    const { unmount } = render(
      <FirstRecordsScreen onStart={vi.fn()} onSkip={vi.fn()} onEmpty={onEmpty} fetchImpl={impl} />,
    );
    unmount();
    release(new Response(JSON.stringify({ suggestions: [] }), { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it('leaves a screen it has already left alone when the read throws', async () => {
    let reject: (error: Error) => void = () => {};
    const impl = vi.fn(
      () => new Promise<Response>((_, no) => (reject = no)),
    ) as unknown as typeof fetch;
    const onEmpty = vi.fn();
    const { unmount } = render(
      <FirstRecordsScreen onStart={vi.fn()} onSkip={vi.fn()} onEmpty={onEmpty} fetchImpl={impl} />,
    );
    unmount();
    reject(new Error('offline'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it('copes with a suggestion carrying no matched tracks', async () => {
    setup([aSuggestion({ matches: [] })]);
    await waitFor(() => expect(screen.getByText('Ants From Up There')).toBeInTheDocument());
  });

  it('waits out a slow write rather than firing twice', async () => {
    let release: () => void = () => {};
    const onStart = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const { impl } = stubApi([aSuggestion()]);
    render(
      <FirstRecordsScreen onStart={onStart} onSkip={vi.fn()} fetchImpl={impl} />,
    );
    await waitFor(() => expect(screen.getByText('1 record selected')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Start listening' }));
    // React Aria keeps a pending button focusable and marks it aria-disabled
    // rather than disabled, so the busy state is announced rather than silent.
    const button = screen.getByRole('button', { name: /Start listening/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('data-pending', 'true');
    expect(within(button).getByTestId('pending-spinner')).toBeInTheDocument();
    release();
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
  });
});
