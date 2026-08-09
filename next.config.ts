import type { NextConfig } from 'next';

const config: NextConfig = {
  images: {
    // Album art comes from Spotify's CDN and nowhere else.
    remotePatterns: [{ protocol: 'https', hostname: 'i.scdn.co' }],
  },
};

export default config;
