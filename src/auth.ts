import NextAuth, { type NextAuthConfig } from 'next-auth';
import Spotify from 'next-auth/providers/spotify';
import { SPOTIFY_AUTHORIZE_URL, SPOTIFY_SCOPES } from '@/lib/auth/scopes';
import { isExpired, refreshAccessToken, type TokenSet } from '@/lib/auth/token';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    /** What Spotify actually granted, which is not always what was asked for. */
    scopes?: string;
    error?: 'RefreshFailed';
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const authConfig: NextAuthConfig = {
  providers: [
    Spotify({
      // The url has to be repeated here. Auth.js's Spotify provider declares
      // `authorization` as a plain string, and this object replaces it whole
      // rather than merging — passing only `params` leaves no endpoint to call.
      authorization: {
        url: SPOTIFY_AUTHORIZE_URL,
        // show_dialog=true so Spotify always re-consents. With it off, an
        // account that once granted a narrower scope set keeps that grant and
        // is never asked about scopes added since; the only symptom is a bare
        // 403 on the first write, which names nothing.
        params: { scope: SPOTIFY_SCOPES, show_dialog: 'true' },
      },
    }),
  ],
  // A signed cookie and nothing else. There is no adapter because there is no
  // database, which is also why no refresh token is kept at rest on our side.
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.spotify = {
          accessToken: account.access_token as string,
          refreshToken: account.refresh_token as string,
          expiresAt: (account.expires_at as number) * 1000,
        } satisfies TokenSet;
        if (profile && 'id' in profile) token.spotifyId = profile.id as string;
        if (account.scope) token.spotifyScopes = account.scope;
        return token;
      }

      const current = token.spotify as TokenSet | undefined;
      if (!current) return token;
      if (!isExpired(current, Date.now())) return token;

      token.spotify = await refreshAccessToken(current, {
        clientId: process.env.AUTH_SPOTIFY_ID ?? '',
        clientSecret: process.env.AUTH_SPOTIFY_SECRET ?? '',
      });
      return token;
    },
    async session({ session, token }) {
      const spotify = token.spotify as TokenSet | undefined;
      if (spotify) {
        session.accessToken = spotify.accessToken;
        if (spotify.error) session.error = spotify.error;
      }
      if (token.spotifyId) session.user.id = token.spotifyId as string;
      if (token.spotifyScopes) session.scopes = token.spotifyScopes as string;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
