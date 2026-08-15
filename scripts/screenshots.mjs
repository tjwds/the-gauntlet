#!/usr/bin/env node

/**
 * The README's screenshots, taken against the demo dataset.
 *
 * It builds the app, serves it with the demo harness switched on, and
 * photographs each screen through a real browser. Nothing here touches Spotify:
 * every screen is fed by `src/demo`, so the pictures are of the product rather
 * than of one person's listening history — and anyone can retake them, which
 * matters when signing in is capped at five people.
 *
 *   pnpm screenshots                       every shot, into docs/screenshots
 *   pnpm screenshots board playing         just those two
 *   pnpm screenshots --skip-build          reuse the last build
 *   pnpm screenshots --server=http://127.0.0.1:3434
 *                                          against a `pnpm dev` already running
 *   pnpm screenshots --scale=1             1x rather than 2x, for smaller files
 *
 * The browser is whichever is already on the machine: Playwright's own Chromium
 * if it has been installed, otherwise Google Chrome, otherwise whatever
 * SCREENSHOT_CHROME points at.
 */

import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A desktop board is seven columns wide, and the columns are a fixed width, so
 * the viewport has to be as wide as all seven laid out — 1832px at the time of
 * writing. Anything narrower photographs a board scrolled off its own right
 * edge, which reads as a clipped screenshot rather than as a scrollable board.
 */
const DESKTOP = { width: 1860, height: 900 };
/** Narrow enough for the board to collapse to its three-column layout. */
const PHONE = { width: 420, height: 880 };

const SHOTS = [
  {
    name: 'board',
    screen: 'board',
    what: 'The board: seven playlists, drawn as seven columns',
    viewport: DESKTOP,
  },
  {
    // The same board, photographed on a machine set to dark. Nothing about the
    // demo changes: the appearance is a preference the browser reports, and the
    // page reads it before it paints.
    name: 'board-dark',
    screen: 'board',
    what: 'The board again, on a machine set to dark',
    viewport: DESKTOP,
    colorScheme: 'dark',
  },
  {
    name: 'playing',
    screen: 'playing',
    what: 'A record playing: playbar, level meter, and the pass so far',
    viewport: DESKTOP,
    ready: (page) => page.locator('[data-testid="playbar"]').waitFor(),
  },
  {
    name: 'advance',
    screen: 'advance',
    what: 'A finished pass filing itself, with thirty seconds of undo',
    viewport: DESKTOP,
    ready: (page) => page.getByRole('status').waitFor(),
  },
  {
    name: 'album',
    screen: 'board',
    what: 'The album drawer: this pass so far, and how the record got here',
    viewport: DESKTOP,
    async ready(page) {
      await page.getByRole('button', { name: 'Open The Slip' }).click();
      await page.getByText('Echoplex').waitFor();
    },
  },
  {
    name: 'add-albums',
    screen: 'board',
    what: 'Add albums, on the saved-albums tab',
    viewport: DESKTOP,
    async ready(page) {
      await page.getByRole('button', { name: '+ Add albums' }).first().click();
      await page.getByRole('tab', { name: /^Saved albums/ }).click();
      await page.getByText('Do You Feel OK?').waitFor();
    },
  },
  {
    name: 'first-records',
    screen: 'first-records',
    what: 'First records: what to queue, from songs already known',
    viewport: { width: 1440, height: 1000 },
    ready: (page) => page.getByText('Transatlanticism').first().waitFor(),
  },
  {
    name: 'narrow-board',
    screen: 'playing',
    what: 'What the board collapses to on a phone',
    viewport: PHONE,
  },
  {
    name: 'login',
    screen: 'login',
    what: 'Log in: one button, and what it will ask Spotify for',
    viewport: { width: 1100, height: 860 },
    ready: (page) => page.getByRole('button', { name: /Spotify/ }).waitFor(),
  },
  {
    name: 'setup',
    screen: 'setup',
    what: 'Setup: the seven playlists this creates, named exactly',
    viewport: { width: 1440, height: 1000 },
    fullPage: true,
    ready: (page) => page.getByText('Gauntlet · Queue').first().waitFor(),
  },
  {
    name: 'settings',
    screen: 'settings',
    what: 'Settings: an account, seven playlists, and which theme to draw them in',
    viewport: { width: 1440, height: 1000 },
    fullPage: true,
    ready: (page) => page.getByText('Gauntlet · Done').first().waitFor(),
  },
];

/** Every board shot waits on the same thing: a card that has finished loading. */
const boardReady = (page) => page.locator('[data-testid="board-card"]').first().waitFor();

function parseArgs(argv) {
  const options = {
    names: [],
    out: path.join(ROOT, 'docs', 'screenshots'),
    port: 3435,
    server: null,
    scale: 2,
    build: true,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') return { ...options, help: true };
    else if (arg === '--skip-build') options.build = false;
    else if (arg.startsWith('--out=')) options.out = path.resolve(ROOT, arg.slice(6));
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice(7));
    else if (arg.startsWith('--server=')) options.server = arg.slice(9).replace(/\/$/, '');
    else if (arg.startsWith('--scale=')) options.scale = Number(arg.slice(8));
    else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
    else options.names.push(arg);
  }

  const unknown = options.names.filter((name) => !SHOTS.some((shot) => shot.name === name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown shot: ${unknown.join(', ')}\nThere is: ${SHOTS.map((shot) => shot.name).join(', ')}`,
    );
  }
  return options;
}

function usage() {
  console.log(
    [
      'pnpm screenshots [shot...] [--out=dir] [--port=n] [--server=url] [--scale=n] [--skip-build]',
      '',
      ...SHOTS.map((shot) => `  ${shot.name.padEnd(14)} ${shot.what}`),
    ].join('\n'),
  );
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)),
    );
  });
}

/**
 * The environment the demo server needs. The three Spotify values are only here
 * because Auth.js reads them on the way up; nothing in the demo signs in.
 */
function serverEnv(port) {
  return {
    ...process.env,
    DEMO_SCREENS: '1',
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    AUTH_SECRET: process.env.AUTH_SECRET ?? 'demo-screenshots',
    AUTH_SPOTIFY_ID: process.env.AUTH_SPOTIFY_ID ?? 'demo',
    AUTH_SPOTIFY_SECRET: process.env.AUTH_SPOTIFY_SECRET ?? 'demo',
  };
}

async function startServer({ port, build }) {
  const env = serverEnv(port);
  const next = path.join(ROOT, 'node_modules', '.bin', 'next');

  if (build) {
    console.log('Building…');
    await run(next, ['build'], env);
  }

  const child = spawn(next, ['start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The server exited before it answered:\n${output}`);
    }
    try {
      const response = await fetch(`${base}/demo/board`);
      if (response.ok) return { child, base };
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  child.kill('SIGKILL');
  throw new Error(`The server never answered on ${base}:\n${output}`);
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
  });
}

/**
 * Whatever browser this machine already has. Playwright's own Chromium is the
 * first choice because its rendering doesn't move under you between shots.
 */
async function launchBrowser() {
  if (process.env.SCREENSHOT_CHROME) {
    return chromium.launch({ executablePath: process.env.SCREENSHOT_CHROME });
  }
  try {
    return await chromium.launch();
  } catch (bundled) {
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      throw new Error(
        [
          'No browser to drive. Any one of these fixes it:',
          '  pnpm exec playwright-core install chromium',
          '  install Google Chrome',
          '  SCREENSHOT_CHROME=/path/to/chrome pnpm screenshots',
          '',
          String(bundled.message ?? bundled).split('\n')[0],
        ].join('\n'),
      );
    }
  }
}

async function capture(browser, shot, { base, out, scale }) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: scale,
    // Entry animations are the one thing between a screenshot and a blurred
    // half-open drawer.
    reducedMotion: 'reduce',
    // Named on every shot rather than left to the machine taking it, so two
    // people retaking these get the same pictures.
    colorScheme: shot.colorScheme ?? 'light',
  });

  try {
    const page = await context.newPage();
    await page.goto(`${base}/demo/${shot.screen}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await (shot.ready ?? boardReady)(page);
    // Long enough for a drawer to have finished arriving, short enough not to
    // eat the advance toast's undo window.
    await page.waitForTimeout(400);

    const file = path.join(out, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: shot.fullPage === true });
    return file;
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }

  const shots = options.names.length
    ? SHOTS.filter((shot) => options.names.includes(shot.name))
    : SHOTS;

  await mkdir(options.out, { recursive: true });

  let server = null;
  let browser = null;
  const failures = [];

  try {
    const base = options.server ?? (server = await startServer(options)).base;
    browser = await launchBrowser();

    for (const shot of shots) {
      try {
        const file = await capture(browser, shot, { base, out: options.out, scale: options.scale });
        const { size } = await stat(file);
        console.log(
          `${shot.name.padEnd(14)} ${path.relative(ROOT, file).padEnd(34)} ${Math.round(size / 1024)} kB`,
        );
      } catch (failure) {
        failures.push(`${shot.name}: ${failure.message.split('\n')[0]}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    await stopServer(server?.child);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} shot(s) failed:\n${failures.map((line) => `  ${line}`).join('\n')}`);
    return 1;
  }

  console.log(`\n${shots.length} shot(s) in ${path.relative(ROOT, options.out)}.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (failure) => {
    console.error(failure.message ?? failure);
    process.exit(1);
  },
);
