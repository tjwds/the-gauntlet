/**
 * The server components that guard each page. Auth and navigation are mocked,
 * so what's under test is the redirect logic: who gets in and who doesn't.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { displayName } from '@/lib/domain/text';
import { KIERAN_HEBDEN_ALBUM } from '@/test/fixtures';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(() => {
    // The real one throws to halt rendering; matching that keeps the tests honest.
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('@/auth', () => ({
  auth: mocks.auth,
  signIn: mocks.signIn,
  signOut: mocks.signOut,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

const BoardPage = (await import('./page')).default;
const LoginPage = (await import('./login/page')).default;
const SetupPage = (await import('./setup/page')).default;
const FirstRecordsPage = (await import('./first-records/page')).default;
const SettingsPage = (await import('./settings/page')).default;

const signedIn = { accessToken: 'tok', user: { id: 'joe', name: 'joe', image: null } };

beforeEach(() => {
  mocks.auth.mockResolvedValue(signedIn);
});

const params = (values: Record<string, string> = {}) => Promise.resolve(values);

describe('the board page', () => {
  it('lets a signed-in listener through', async () => {
    const element = await BoardPage();
    expect(element.props.user).toEqual({ name: 'joe', image: null });
  });

  it('sends a signed-out visitor to log in', async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(BoardPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });

  it('sends a listener whose refresh failed to log in again', async () => {
    mocks.auth.mockResolvedValue({ ...signedIn, error: 'RefreshFailed' });
    await expect(BoardPage()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('copes with a session carrying no profile', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok' });
    const element = await BoardPage();
    expect(element.props.user).toEqual({ name: null, image: null });
  });

  it('bounds the display name before the header prints it', async () => {
    mocks.auth.mockResolvedValue({ ...signedIn, user: { name: KIERAN_HEBDEN_ALBUM } });
    const element = await BoardPage();
    expect(element.props.user.name).toBe(displayName(KIERAN_HEBDEN_ALBUM));
  });
});

describe('the login page', () => {
  it('shows the login screen to a visitor', async () => {
    mocks.auth.mockResolvedValue(null);
    const element = await LoginPage({ searchParams: params() });
    expect(element.props.error).toBeNull();
  });

  it('sends a signed-in listener straight to the board', async () => {
    await expect(LoginPage({ searchParams: params() })).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/');
  });

  it('explains an account Spotify would not let in', async () => {
    // We can't know the account until after consent, so the explanation has to
    // come on the way back rather than before the redirect.
    mocks.auth.mockResolvedValue(null);
    const element = await LoginPage({ searchParams: params({ error: 'AccessDenied' }) });
    expect(element.props.error).toContain('limited to five listeners');
  });

  it('says when the instance has no Spotify credentials', async () => {
    mocks.auth.mockResolvedValue(null);
    const element = await LoginPage({ searchParams: params({ error: 'Configuration' }) });
    expect(element.props.error).toBe('This instance is missing its Spotify credentials.');
  });

  it('falls back to a plain message for an error it does not recognise', async () => {
    mocks.auth.mockResolvedValue(null);
    const element = await LoginPage({ searchParams: params({ error: 'Whatever' }) });
    expect(element.props.error).toBe('Signing in with Spotify failed. Try again?');
  });

  it('starts the Spotify handshake', async () => {
    mocks.auth.mockResolvedValue(null);
    const element = await LoginPage({ searchParams: params() });
    await element.props.onSignIn();
    expect(mocks.signIn).toHaveBeenCalledWith('spotify', { redirectTo: '/' });
  });
});

describe('the setup page', () => {
  it('names the account the playlists will go in', async () => {
    const element = await SetupPage();
    expect(element.props.userName).toBe('joe');
  });

  it('falls back to the Spotify id when there is no display name', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok', user: { id: 'joe-id' } });
    expect((await SetupPage()).props.userName).toBe('joe-id');
  });

  it('falls back again when there is neither', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'tok', user: {} });
    expect((await SetupPage()).props.userName).toBe('you');
  });

  it('turns a signed-out visitor away', async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(SetupPage()).rejects.toThrow('NEXT_REDIRECT');
  });
});

describe('the first-records page', () => {
  it('lets a signed-in listener through', async () => {
    await expect(FirstRecordsPage()).resolves.toBeDefined();
  });

  it('turns a signed-out visitor away', async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(FirstRecordsPage()).rejects.toThrow('NEXT_REDIRECT');
  });
});

describe('the settings page', () => {
  it('lets a signed-in listener through', async () => {
    await expect(SettingsPage()).resolves.toBeDefined();
  });

  it('turns a signed-out visitor away', async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(SettingsPage()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('drops the session and leaves the playlists alone', async () => {
    const element = await SettingsPage();
    await element.props.onSignOut();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: '/login' });
  });
});
