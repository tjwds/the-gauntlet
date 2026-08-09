/**
 * Cover art for the demo dataset, drawn here rather than fetched.
 *
 * The screenshots have to render with no network and no Spotify account, and
 * the real sleeves aren't this repository's to carry. Each record gets two
 * colours and one shape derived from its own title, so a record looks the same
 * in every screenshot without anything being stored to keep it that way.
 */

/** FNV-1a. Stable across runs and machines, which is the only property needed. */
export function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** White-on-gradient so a motif reads the same whatever hue it lands on. */
const MOTIFS = [
  '<circle cx="150" cy="150" r="84" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width="14"/>',
  '<path d="M0 214 300 92 300 300 0 300Z" fill="#fff" fill-opacity=".16"/>',
  '<rect x="54" y="54" width="192" height="192" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="12"/>',
  '<path d="M150 48 254 252 46 252Z" fill="#fff" fill-opacity=".2"/>',
  '<rect x="40" y="126" width="220" height="38" fill="#fff" fill-opacity=".24"/><rect x="40" y="184" width="132" height="38" fill="#fff" fill-opacity=".14"/>',
  '<circle cx="106" cy="150" r="58" fill="#fff" fill-opacity=".18"/><circle cx="194" cy="150" r="58" fill="#fff" fill-opacity=".18"/>',
];

/** A sleeve as a data URI, so nothing about the demo needs a network. */
export function demoArt(seed: string): string {
  const hash = hashSeed(seed);
  const hue = hash % 360;
  // Far enough round the wheel to read as two colours, near enough to still
  // read as one sleeve.
  const second = (hue + 40 + ((hash >>> 9) % 80)) % 360;
  const motif = MOTIFS.at((hash >>> 17) % MOTIFS.length) ?? '';

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    `<stop offset="0" stop-color="hsl(${hue},58%,47%)"/>` +
    `<stop offset="1" stop-color="hsl(${second},54%,23%)"/>` +
    '</linearGradient></defs>' +
    `<rect width="300" height="300" fill="url(#g)"/>${motif}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
