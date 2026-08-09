import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'coverage/**', 'node_modules/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Album art comes from Spotify's CDN at a size they already serve; routing
      // it through the Next image optimiser buys nothing and costs a hop.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
