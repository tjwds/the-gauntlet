import { describe, expect, it } from 'vitest';
import { grantedScopeReport } from './granted';
import { SPOTIFY_SCOPES } from './scopes';

describe('grantedScopeReport', () => {
  it('reports nothing missing when everything was granted', () => {
    expect(grantedScopeReport(SPOTIFY_SCOPES, SPOTIFY_SCOPES)).toEqual({
      granted: SPOTIFY_SCOPES.split(' '),
      missing: [],
      complete: true,
    });
  });

  it('names the scopes that were asked for but not granted', () => {
    // The symptom is a 403 on an endpoint the app plainly has a scope for —
    // an older grant Spotify reused rather than asking again.
    const report = grantedScopeReport('user-read-email playlist-read-private', SPOTIFY_SCOPES);
    expect(report.complete).toBe(false);
    expect(report.missing).toContain('playlist-modify-private');
    expect(report.missing).not.toContain('playlist-read-private');
  });

  it('ignores extra scopes the listener happens to have granted', () => {
    const report = grantedScopeReport(`${SPOTIFY_SCOPES} ugc-image-upload`, SPOTIFY_SCOPES);
    expect(report.complete).toBe(true);
    expect(report.granted).toContain('ugc-image-upload');
  });

  it('says nothing at all for a session that predates scope recording', () => {
    expect(grantedScopeReport(undefined, SPOTIFY_SCOPES)).toEqual({
      granted: null,
      missing: [],
      complete: true,
    });
  });

  it('copes with the ragged spacing a scope string can arrive with', () => {
    const report = grantedScopeReport('  user-read-email   streaming  ', 'user-read-email streaming');
    expect(report.granted).toEqual(['user-read-email', 'streaming']);
    expect(report.complete).toBe(true);
  });
});
