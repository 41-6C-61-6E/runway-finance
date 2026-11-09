#!/usr/bin/env node
/**
 * Runway Finance — Visual UI Capture & Automated Layout Audit Tool
 *
 * Captures deterministic desktop & mobile screenshots (dark/light themes,
 * sub-nav tabs, modals/drawers) and runs an automated DOM layout audit
 * (horizontal overflow, R-5 sub-10px fonts, unintended text clipping,
 * mobile tap targets, console/API errors).
 *
 * All outputs (screenshots, summary.json, auth storageState) are written
 * to `tmp/ui-capture/` (gitignored) so test images are never committed.
 *
 * Usage examples:
 *   pnpm ui:capture                                      # Capture `/` in desktop + mobile (dark)
 *   pnpm ui:capture --route /spending --tabs             # Capture /spending + all sub-nav tabs
 *   pnpm ui:capture --routes /,/accounts,/plans          # Capture multiple routes
 *   pnpm ui:capture --all                                # Capture all 12 core routes
 *   pnpm ui:capture --route /plans --theme both          # Capture dark + light themes
 *   pnpm ui:capture --route /budgets --viewport all      # Desktop, laptop, mobile, compact mobile
 *   pnpm ui:capture --route /accounts --click "button:has-text('Add')"
 *   pnpm ui:capture --route / --full-page                # Capture full scrollable page height
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load environment variables (.env.local takes precedence over .env)
dotenv.config({ path: path.join(ROOT, 'tmp/.ui-credentials.env'), quiet: true });
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const VIEWPORT_PRESETS = {
  desktop: { name: 'desktop', width: 1440, height: 900, isMobile: false, deviceScaleFactor: 2 },
  laptop: { name: 'laptop', width: 1280, height: 800, isMobile: false, deviceScaleFactor: 2 },
  mobile: { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  'mobile-compact': { name: 'mobile-compact', width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const CORE_ROUTES = [
  { name: 'signin', path: '/signin', auth: false, tabs: [] },
  { name: 'dashboard', path: '/', auth: true, tabs: ['History', 'Breakdown'] },
  { name: 'accounts', path: '/accounts', auth: true, tabs: [] },
  { name: 'transactions', path: '/transactions', auth: true, tabs: ['Transactions', 'Recurring', 'Calendar'] },
  { name: 'spending', path: '/spending', auth: true, tabs: ['Breakdown', 'Coverage'] },
  { name: 'budgets', path: '/budgets', auth: true, tabs: ['Monthly', 'Quarterly', 'Yearly'] },
  { name: 'investments', path: '/investments', auth: true, tabs: ['Overview', 'Holdings', 'Activity'] },
  { name: 'goals', path: '/goals', auth: true, tabs: ['All', 'Active', 'Completed', 'Paused'] },
  { name: 'plans', path: '/plans', auth: true, tabs: ['Projection', 'Scenarios', 'Settings'] },
  { name: 'real-estate', path: '/real-estate', auth: true, tabs: ['Equity', 'Properties'] },
  { name: 'flows', path: '/flows', auth: true, tabs: ['Wealth', 'Cash', 'Income'] },
  { name: 'settings', path: '/settings', auth: true, tabs: ['General', 'Accounts', 'Categories', 'Rules', 'Tags', 'Analytics', 'AI', 'Data', 'Payroll', 'Notifications', 'Advanced'] },
];

function parseArgs(argv) {
  const opts = {
    routes: [],
    allRoutes: false,
    viewport: 'both', // 'desktop' | 'mobile' | 'both' | 'all'
    theme: 'dark', // 'dark' | 'light' | 'both'
    tabs: false,
    tabList: null,
    clicks: [],
    interactive: false,
    selector: null,
    fullPage: false,
    user: process.env.UI_CAPTURE_USER || 'demo01',
    password: process.env.UI_CAPTURE_PASSWORD || process.env.DEMO_PASSWORD || null,
    loginViaUi: false,
    autoSeed: true,
    autoServer: true,
    baseUrl: process.env.BASE_URL || 'http://localhost:3001',
    outDir: null,
    waitMs: 600,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--all') opts.allRoutes = true;
    else if (arg === '--audit') {
      opts.allRoutes = true;
      opts.viewport = 'all';
      opts.theme = 'both';
      opts.tabs = true;
      opts.interactive = true;
      opts.outDir = 'tmp/ui-audit';
    }
    else if (arg === '--interactive') opts.interactive = true;
    else if (arg === '--route' || arg === '-r') opts.routes.push(next());
    else if (arg === '--routes') opts.routes.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--viewport' || arg === '-v') opts.viewport = next();
    else if (arg === '--theme' || arg === '-t') opts.theme = next();
    else if (arg === '--tabs') {
      opts.tabs = true;
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        opts.tabList = next().split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else if (arg === '--click') opts.clicks.push(next());
    else if (arg === '--selector' || arg === '-s') opts.selector = next();
    else if (arg === '--full-page' || arg === '--full') opts.fullPage = true;
    else if (arg === '--user' || arg === '-u') opts.user = next();
    else if (arg === '--password' || arg === '-p') opts.password = next();
    else if (arg === '--login-via-ui') opts.loginViaUi = true;
    else if (arg === '--no-seed') opts.autoSeed = false;
    else if (arg === '--no-server') opts.autoServer = false;
    else if (arg === '--base-url') opts.baseUrl = next();
    else if (arg === '--out' || arg === '-o') opts.outDir = next();
    else if (arg === '--wait') opts.waitMs = parseInt(next(), 10) || 600;
  }

  if (!opts.allRoutes && opts.routes.length === 0) {
    opts.routes = ['/'];
  }
  return opts;
}

function printHelp() {
  console.log(`
Runway Finance — Visual UI Capture & Layout Audit CLI

Usage:
  pnpm ui:capture [options]

Options:
  --route, -r <path>       Route path to capture (repeatable, default: "/")
  --routes <p1,p2,...>     Comma-separated route paths to capture
  --all                    Capture all 12 core routes
  --viewport, -v <mode>    desktop | mobile | both (default) | laptop | mobile-compact | all
  --theme, -t <mode>       dark (default) | light | both
  --tabs [Tab1,Tab2]       Also click & capture sub-nav capsule tabs on each route
  --click <selector>       Click element before capture (repeatable, e.g. to open modals/drawers)
  --selector, -s <sel>     Capture a specific DOM element instead of the page
  --full-page              Capture full scrollable page height (default: viewport height)
  --user <username>        Authenticated user (default: UI_CAPTURE_USER or "demo01")
  --password <password>    Password for UI login (or set UI_CAPTURE_PASSWORD in .env.local)
  --login-via-ui           Authenticate by submitting /signin form instead of fast JWT minting
  --no-seed                Skip automatic demo01 synthetic data check/seed
  --no-server              Do not auto-start dev server if port 3001 is not listening
  --out, -o <dir>          Custom output directory (default: tmp/ui-capture/latest)
  --wait <ms>              Extra settle delay in ms after hydration (default: 600)
`);
}

function resolveViewports(mode) {
  if (mode === 'both') return [VIEWPORT_PRESETS.desktop, VIEWPORT_PRESETS.mobile];
  if (mode === 'all') {
    return [
      VIEWPORT_PRESETS.desktop,
      VIEWPORT_PRESETS.laptop,
      VIEWPORT_PRESETS.mobile,
      VIEWPORT_PRESETS['mobile-compact'],
    ];
  }
  const parts = String(mode).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (parts.length > 0 && parts.every((p) => VIEWPORT_PRESETS[p])) {
    return Array.from(new Set(parts)).map((p) => VIEWPORT_PRESETS[p]);
  }
  if (VIEWPORT_PRESETS[mode]) return [VIEWPORT_PRESETS[mode]];
  throw new Error(`Unknown --viewport "${mode}". Use desktop, mobile, both, laptop, mobile-compact, or all.`);
}

function resolveThemes(mode) {
  if (!mode) return ['dark'];
  if (mode === 'both') return ['dark', 'light'];
  if (mode === 'all') return ['dark', 'light', 'moonlight'];
  const parts = String(mode).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = ['dark', 'light', 'moonlight'];
  if (parts.length > 0 && parts.every((p) => valid.includes(p))) {
    return Array.from(new Set(parts));
  }
  if (valid.includes(mode)) return [mode];
  throw new Error(`Unknown --theme "${mode}". Use dark, light, moonlight, both, all, or a comma-separated list.`);
}

function resolveRouteSpecs(opts) {
  if (opts.allRoutes) return CORE_ROUTES;
  return opts.routes.map((routePath) => {
    const cleanPath = routePath.startsWith('/') ? routePath : `/${routePath}`;
    const match = CORE_ROUTES.find((r) => r.path === cleanPath);
    if (match) return match;
    const slug = cleanPath === '/' ? 'dashboard' : cleanPath.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
    return {
      name: slug || 'page',
      path: cleanPath,
      auth: !cleanPath.startsWith('/signin'),
      tabs: [],
    };
  });
}

let currentServerHandle = null;

async function isServerListening(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/signin`, { method: 'GET', redirect: 'manual' });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function ensureDevServer(baseUrl, autoServer) {
  if (await isServerListening(baseUrl)) {
    return currentServerHandle || { startedByUs: false, stop: async () => {} };
  }
  if (!autoServer) {
    throw new Error(`Dev server is not reachable at ${baseUrl} and --no-server was specified.`);
  }

  console.log(`[ui:capture] Dev server not detected at ${baseUrl}. Starting "pnpm dev"...`);
  const logFd = fs.openSync('/tmp/dev-server.log', 'a');
  const child = spawn('pnpm', ['dev'], {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  child.unref();

  const start = Date.now();
  const timeoutMs = 60_000;
  while (Date.now() - start < timeoutMs) {
    if (await isServerListening(baseUrl)) {
      console.log(`[ui:capture] Dev server ready at ${baseUrl} (${((Date.now() - start) / 1000).toFixed(1)}s).`);
      currentServerHandle = {
        startedByUs: true,
        stop: async () => {
          try {
            process.kill(-child.pid, 'SIGTERM');
          } catch {
            try {
              child.kill('SIGTERM');
            } catch {}
          }
        },
      };
      return currentServerHandle;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  throw new Error(`Timed out waiting for dev server at ${baseUrl}.`);
}

async function safeGoto(page, url, opts = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35_000, ...opts });
      return;
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[ui:capture] Navigation to ${url} encountered issue (${err.message.slice(0, 90)}). Re-checking server and retrying (${attempt + 1}/${retries})...`);
        await ensureDevServer('http://localhost:3001', true);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

async function ensureUserAndSeedData(username, autoSeed) {
  if (!process.env.DATABASE_URL) {
    console.warn('[ui:capture] DATABASE_URL not set; skipping DB verification.');
    return { username, tokenVersion: 1, email: `${username}@example.com` };
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: userRows } = await pool.query(
      'SELECT username, email, token_version FROM users WHERE username = $1',
      [username]
    );
    const { rows: accRows } = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM accounts WHERE user_id = $1',
      [username]
    );
    const accountCount = accRows[0]?.cnt ?? 0;

    if ((!userRows[0] || accountCount === 0) && username === 'demo01' && autoSeed) {
      console.log(`[ui:capture] User "demo01" has ${accountCount} accounts in DB. Running synthetic data seed...`);
      execFileSync(
        'pnpm',
        ['exec', 'tsx', 'scripts/seed-demo01-synthetic-data.ts'],
        {
          cwd: ROOT,
          env: process.env,
          stdio: 'inherit',
        }
      );
      const { rows: refreshed } = await pool.query(
        'SELECT username, email, token_version FROM users WHERE username = $1',
        [username]
      );
      return {
        username,
        tokenVersion: refreshed[0]?.token_version ?? 1,
        email: refreshed[0]?.email ?? 'demo01@example.com',
      };
    }

    return {
      username,
      tokenVersion: userRows[0]?.token_version ?? 1,
      email: userRows[0]?.email ?? `${username}@example.com`,
    };
  } finally {
    await pool.end();
  }
}

async function createAuthStorageState({ baseUrl, userInfo, password, loginViaUi, authDir }) {
  fs.mkdirSync(authDir, { recursive: true });
  const storagePath = path.join(authDir, `${userInfo.username}.json`);

  if (loginViaUi && password) {
    console.log(`[ui:capture] Authenticating "${userInfo.username}" via /signin UI form...`);
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    try {
      const context = await browser.newContext({ baseURL: baseUrl });
      const page = await context.newPage();
      await safeGoto(page, '/signin');
      await page.fill('#username', userInfo.username);
      await page.fill('#password', password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 20_000 });
      await context.storageState({ path: storagePath });
      return storagePath;
    } finally {
      await browser.close();
    }
  }

  // Fast local session token minting using NextAuth v5 JWT encode
  const secret = process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production';
  const cookieName = 'authjs.session-token';
  const token = await encode({
    secret,
    salt: cookieName,
    token: {
      name: userInfo.username,
      email: userInfo.email,
      sub: userInfo.username,
      tokenVersion: userInfo.tokenVersion,
    },
    maxAge: 30 * 24 * 60 * 60,
  });

  const parsedUrl = new URL(baseUrl);
  const storageState = {
    cookies: [
      {
        name: cookieName,
        value: token,
        domain: parsedUrl.hostname,
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400,
        httpOnly: true,
        secure: parsedUrl.protocol === 'https:',
        sameSite: 'Lax',
      },
    ],
    origins: [],
  };

  fs.writeFileSync(storagePath, JSON.stringify(storageState, null, 2));
  return storagePath;
}

async function waitForPageSettle(page, extraWaitMs = 600) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
  } catch {}

  try {
    await page.waitForLoadState('networkidle', { timeout: 8_000 });
  } catch {}

  // Wait for fonts & disappearance of primary loading spinners (with timeout guard)
  try {
    await Promise.race([
      page.evaluate(async () => {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
      }),
      new Promise((r) => setTimeout(r, 3_000)),
    ]);
  } catch {}

  try {
    await page.waitForFunction(
      () => {
        const spinners = document.querySelectorAll('.animate-spin');
        return spinners.length === 0;
      },
      { timeout: 6_000 }
    );
  } catch {}

  // Freeze CSS transitions and animations for deterministic rendering,
  // and hide the Next.js DevTools floating portal indicator so it doesn't obscure bottom-left UI.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        caret-color: transparent !important;
      }
      nextjs-portal {
        display: none !important;
      }
    `,
  });

  if (extraWaitMs > 0) {
    await page.waitForTimeout(extraWaitMs);
  }
}

async function runDomLayoutAudit(page, viewportSpec) {
  return page.evaluate((vp) => {
    const docEl = document.documentElement;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const docScrollWidth = docEl.scrollWidth;
    const docScrollHeight = docEl.scrollHeight;
    const hasHorizontalOverflow = docScrollWidth > vw + 1;

    const overflowingElements = [];
    const subFloorFonts = [];
    const clippedTextElements = [];
    const smallTapTargets = [];

    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const describeEl = (el) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
          : '';
      const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${tag}${id}${cls}${text ? ` ("${text}")` : ''}`;
    };

    const allElements = Array.from(document.querySelectorAll('body *'));
    for (const el of allElements) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      // 1. Horizontal overflow culprits
      if (hasHorizontalOverflow && rect.right > vw + 2 && overflowingElements.length < 10) {
        overflowingElements.push({
          element: describeEl(el),
          rightEdge: Math.round(rect.right),
          overflowPx: Math.round(rect.right - vw),
        });
      }

      // 2. Sub-10px font floor check (R-5 guard)
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0)
        .map((n) => n.textContent.trim())
        .join(' ');

      if (directText.length > 0) {
        const fontSize = parseFloat(style.fontSize);
        if (fontSize > 0 && fontSize < 10 && subFloorFonts.length < 15) {
          subFloorFonts.push({
            element: describeEl(el),
            fontSizePx: fontSize,
            text: directText.slice(0, 40),
          });
        }
      }

      // 3. Unintentional horizontal text clipping on buttons, badges, tabs, headings
      const tag = el.tagName.toLowerCase();
      if (
        ['button', 'h1', 'h2', 'h3', 'th'].includes(tag) ||
        el.getAttribute('role') === 'tab'
      ) {
        const isIntentionalEllipsis = style.textOverflow === 'ellipsis';
        if (
          !isIntentionalEllipsis &&
          el.clientWidth > 0 &&
          el.scrollWidth > el.clientWidth + 4 &&
          clippedTextElements.length < 15
        ) {
          clippedTextElements.push({
            element: describeEl(el),
            clientWidth: el.clientWidth,
            scrollWidth: el.scrollWidth,
          });
        }
      }

      // 4. Mobile tap-target check
      if (vp.isMobile && (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'tab')) {
        if ((rect.width < 28 || rect.height < 26) && smallTapTargets.length < 15) {
          smallTapTargets.push({
            element: describeEl(el),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
    }

    return {
      url: window.location.pathname + window.location.search,
      title: document.title,
      themeClass:
        docEl.getAttribute('data-theme') ||
        (docEl.classList.contains('dark')
          ? 'dark'
          : docEl.classList.contains('light')
            ? 'light'
            : docEl.classList.contains('moonlight')
              ? 'moonlight'
              : 'system'),
      viewport: { width: vw, height: vh },
      documentSize: { scrollWidth: docScrollWidth, scrollHeight: docScrollHeight },
      hasHorizontalOverflow,
      overflowingElements,
      subFloorFonts,
      clippedTextElements,
      smallTapTargets,
      chartSvgCount: document.querySelectorAll('svg.recharts-surface').length,
    };
  }, viewportSpec);
}

async function applyTheme(page, theme) {
  await page.evaluate((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {}
    const docEl = document.documentElement;
    docEl.classList.remove('light', 'dark', 'moonlight');
    docEl.setAttribute('data-theme', t);
    if (t === 'light' || t === 'dark') {
      docEl.style.colorScheme = t;
    } else {
      docEl.style.removeProperty('color-scheme');
    }
  }, theme);
}

async function clickTabByLabel(page, label) {
  try {
    const roleTabs = page.getByRole('tab', { name: new RegExp(`^${label}`, 'i') });
    const roleCount = await roleTabs.count();
    for (let i = 0; i < roleCount; i++) {
      const item = roleTabs.nth(i);
      if (await item.isVisible()) {
        try {
          await item.click({ force: true, timeout: 5000 });
          return true;
        } catch {
          await item.dispatchEvent('click');
          return true;
        }
      }
    }

    const candidates = [
      page.locator(`button:text-is("${label}")`),
      page.locator(`a:text-is("${label}")`),
      page.locator(`button[title="${label}"]`),
      page.locator(`button[aria-label$=": ${label}"]`),
      page.locator(`button[aria-label$="${label}"]`),
      page.locator('button').filter({ hasText: label }),
      page.locator('a').filter({ hasText: label }),
    ];

    for (const loc of candidates) {
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const item = loc.nth(i);
        if (await item.isVisible()) {
          try {
            await item.click({ force: true, timeout: 3000 });
            return true;
          } catch {
            try {
              await item.dispatchEvent('click', {}, { timeout: 3000 });
            } catch {}
            return true;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[ui:capture] Warning: clickTabByLabel for "${label}" caught: ${err.message}`);
  }
  return false;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const viewports = resolveViewports(opts.viewport);
  const themes = resolveThemes(opts.theme);
  const routeSpecs = resolveRouteSpecs(opts);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseTmpDir = path.join(ROOT, 'tmp', 'ui-capture');
  const outDir = opts.outDir
    ? path.resolve(ROOT, opts.outDir)
    : path.join(baseTmpDir, `run-${timestamp}`);
  const latestDir = path.join(baseTmpDir, 'latest');
  const authDir = path.join(baseTmpDir, '.auth');

  const isAuditOut = opts.outDir && opts.outDir.includes('ui-audit') && !opts.outDir.includes('screenshots');
  const screenshotsDir = isAuditOut ? path.join(outDir, 'screenshots') : outDir;
  const darkDir = isAuditOut ? path.join(screenshotsDir, 'dark') : outDir;
  const lightDir = isAuditOut ? path.join(screenshotsDir, 'light') : outDir;
  const moonlightDir = isAuditOut ? path.join(screenshotsDir, 'moonlight') : outDir;
  const interactiveDir = isAuditOut ? path.join(screenshotsDir, 'interactive') : outDir;

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
  if (isAuditOut) {
    fs.mkdirSync(darkDir, { recursive: true });
    fs.mkdirSync(lightDir, { recursive: true });
    fs.mkdirSync(moonlightDir, { recursive: true });
    fs.mkdirSync(interactiveDir, { recursive: true });
  }

  const serverHandle = await ensureDevServer(opts.baseUrl, opts.autoServer);

  try {
    const needsAuth = routeSpecs.some((r) => r.auth) || opts.interactive;
    let storageStatePath = null;
    if (needsAuth) {
      const userInfo = await ensureUserAndSeedData(opts.user, opts.autoSeed);
      storageStatePath = await createAuthStorageState({
        baseUrl: opts.baseUrl,
        userInfo,
        password: opts.password,
        loginViaUi: opts.loginViaUi,
        authDir,
      });
    }

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const captures = [];

    try {
      for (const theme of themes) {
        for (const vp of viewports) {
          const context = await browser.newContext({
            baseURL: opts.baseUrl,
            viewport: { width: vp.width, height: vp.height },
            isMobile: vp.isMobile,
            hasTouch: vp.hasTouch || false,
            deviceScaleFactor: vp.deviceScaleFactor || 2,
            colorScheme: theme === 'light' ? 'light' : 'dark',
            ...(storageStatePath ? { storageState: storageStatePath } : {}),
          });

          // Pre-seed theme in localStorage before navigation
          await context.addInitScript((t) => {
            try {
              localStorage.setItem('theme', t);
            } catch {}
          }, theme);

          const takeSnap = async (page, { routePath, routeName, tabSuffix = null, isInteractive = false, customBaseName = null, consoleErrors = [], apiErrors = [] }) => {
            const baseName = customBaseName || [
              routeName,
              ...(tabSuffix ? [tabSuffix.toLowerCase().replace(/[^a-z0-9]+/g, '-')] : []),
            ].join('__');

            const fileName = `${baseName}__${vp.name}__${theme}.png`;
            const targetDir = isInteractive
              ? interactiveDir
              : theme === 'dark'
                ? darkDir
                : theme === 'moonlight'
                  ? moonlightDir
                  : lightDir;
            const filePath = path.join(targetDir, fileName);
            const flatPath = path.join(screenshotsDir, fileName);

            if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 1000) {
              if (opts.selector) {
                const el = page.locator(opts.selector).first();
                await el.screenshot({ path: filePath });
              } else {
                await page.screenshot({ path: filePath, fullPage: opts.fullPage });
              }

              if (filePath !== flatPath) {
                try {
                  fs.copyFileSync(filePath, flatPath);
                } catch {}
              }
            }

            const audit = await runDomLayoutAudit(page, vp);
            const record = {
              route: routePath || customBaseName || 'interactive',
              routeName: routeName || customBaseName || 'interactive',
              tab: tabSuffix || (isInteractive ? 'interactive' : 'default'),
              viewport: vp.name,
              dimensions: `${vp.width}x${vp.height}`,
              theme,
              file: filePath,
              fileName,
              audit: {
                ...audit,
                consoleErrors: [...consoleErrors],
                apiErrors: [...apiErrors],
              },
            };
            captures.push(record);

            const issues = [];
            if (audit.hasHorizontalOverflow) issues.push(`OVERFLOW(${audit.documentSize.scrollWidth}px>${vp.width}px)`);
            if (audit.subFloorFonts.length > 0) issues.push(`SUB_10PX_FONT(${audit.subFloorFonts.length})`);
            if (audit.clippedTextElements.length > 0) issues.push(`CLIPPED_TEXT(${audit.clippedTextElements.length})`);
            if (apiErrors.length > 0) issues.push(`API_ERR(${apiErrors.length})`);
            const statusStr = issues.length === 0 ? 'OK' : `WARN: ${issues.join(', ')}`;
            console.log(
              `[ui:capture] ${fileName.padEnd(46)} | ${ `${vp.width}x${vp.height}`.padEnd(9)} | ${statusStr}`
            );
          };

          for (const routeSpec of routeSpecs) {
            const page = await context.newPage();
            const consoleErrors = [];
            const apiErrors = [];

            const onConsole = (msg) => {
              if (msg.type() === 'error') {
                consoleErrors.push(msg.text().slice(0, 200));
              }
            };
            const onResponse = (res) => {
              if (res.url().includes('/api/') && res.status() >= 400) {
                apiErrors.push({
                  url: new URL(res.url()).pathname,
                  status: res.status(),
                });
              }
            };

            page.on('console', onConsole);
            page.on('response', onResponse);

            try {
              // If capturing /signin explicitly while authenticated context is active, clear cookies temporarily
              if (!routeSpec.auth && storageStatePath) {
                await context.clearCookies();
              } else if (routeSpec.auth && storageStatePath) {
                const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
                await context.addCookies(state.cookies);
              }

              await safeGoto(page, routeSpec.path);
              await applyTheme(page, theme);
              await waitForPageSettle(page, opts.waitMs);

              // Execute any requested clicks
              for (const clickSel of opts.clicks) {
                const target = page.locator(clickSel).first();
                if (await target.isVisible({ timeout: 5_000 })) {
                  await target.click();
                  await waitForPageSettle(page, opts.waitMs);
                } else {
                  console.warn(`[ui:capture] Warning: --click selector "${clickSel}" not visible on ${routeSpec.path}`);
                }
              }

              await takeSnap(page, {
                routePath: routeSpec.path,
                routeName: routeSpec.name,
                tabSuffix: null,
                consoleErrors,
                apiErrors,
              });

              // Also iterate sub-nav tabs if --tabs is enabled
              if (opts.tabs) {
                const tabsToVisit = opts.tabList || routeSpec.tabs || [];
                for (let tIdx = 0; tIdx < tabsToVisit.length; tIdx++) {
                  const tabLabel = tabsToVisit[tIdx];
                  const clicked = await clickTabByLabel(page, tabLabel);
                  if (clicked) {
                    await waitForPageSettle(page, opts.waitMs);
                    await takeSnap(page, {
                      routePath: routeSpec.path,
                      routeName: routeSpec.name,
                      tabSuffix: tabLabel,
                      consoleErrors,
                      apiErrors,
                    });
                  }
                }
              }
            } finally {
              page.off('console', onConsole);
              page.off('response', onResponse);
              await page.close().catch(() => {});
            }
          }

          // Interactive states capture
          if (opts.interactive) {
            const interactiveDefs = [
              {
                name: 'accounts__drawer-add-manual-account',
                path: '/settings?tab=accounts&sub=manual',
                action: async (p) => {
                  const btn = p.locator('button:has-text("Add")');
                  for (let i = 0; i < await btn.count(); i++) {
                    if (await btn.nth(i).isVisible()) {
                      await btn.nth(i).click();
                      await waitForPageSettle(p, opts.waitMs);
                      return true;
                    }
                  }
                  return false;
                },
              },
              {
                name: 'accounts__card-detail-selected',
                path: '/accounts',
                action: async (p) => {
                  const row = p.locator('div[id^="account-row-"]').first();
                  if (await row.isVisible()) {
                    await row.click();
                    await waitForPageSettle(p, opts.waitMs);
                    return true;
                  }
                  return false;
                },
              },
              {
                name: 'transactions__modal-add-transaction',
                path: '/transactions',
                action: async (p) => {
                  const btn = p.locator('button:has-text("Add Transaction")');
                  for (let i = 0; i < await btn.count(); i++) {
                    if (await btn.nth(i).isVisible()) {
                      await btn.nth(i).click();
                      await waitForPageSettle(p, opts.waitMs);
                      return true;
                    }
                  }
                  return false;
                },
              },
              {
                name: 'budgets__modal-add-budget',
                path: '/budgets',
                action: async (p) => {
                  const tableTab = p.locator('button[title="Table"], button[aria-label$="Table"], [role="tab"]:has-text("Table"), button:has-text("Table")');
                  for (let i = 0; i < await tableTab.count(); i++) {
                    if (await tableTab.nth(i).isVisible()) {
                      await tableTab.nth(i).click();
                      await p.waitForTimeout(300);
                      break;
                    }
                  }
                  const addBtn = p.locator('button[aria-label="Add Budget"], button:has-text("Add")');
                  for (let i = 0; i < await addBtn.count(); i++) {
                    if (await addBtn.nth(i).isVisible()) {
                      await addBtn.nth(i).click();
                      await waitForPageSettle(p, opts.waitMs);
                      return true;
                    }
                  }
                  return false;
                },
              },
              {
                name: 'goals__modal-add-goal',
                path: '/goals',
                action: async (p) => {
                  const btn = p.locator('button:has-text("Add Goal")');
                  for (let i = 0; i < await btn.count(); i++) {
                    if (await btn.nth(i).isVisible()) {
                      await btn.nth(i).click();
                      await waitForPageSettle(p, opts.waitMs);
                      return true;
                    }
                  }
                  return false;
                },
              },
            ];

            for (const item of interactiveDefs) {
              const page = await context.newPage();
              const consoleErrors = [];
              const apiErrors = [];
              const onConsole = (msg) => {
                if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
              };
              const onResponse = (res) => {
                if (res.url().includes('/api/') && res.status() >= 400) {
                  apiErrors.push({ url: new URL(res.url()).pathname, status: res.status() });
                }
              };
              page.on('console', onConsole);
              page.on('response', onResponse);

              try {
                if (storageStatePath) {
                  const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
                  await context.addCookies(state.cookies);
                }
                await safeGoto(page, item.path);
                await applyTheme(page, theme);
                await waitForPageSettle(page, opts.waitMs);
                const triggered = await item.action(page);
                if (triggered) {
                  await takeSnap(page, {
                    routePath: item.path,
                    routeName: item.name,
                    tabSuffix: null,
                    isInteractive: true,
                    customBaseName: item.name,
                    consoleErrors,
                    apiErrors,
                  });
                }
              } catch (err) {
                console.warn(`[ui:capture] Warning: interactive capture "${item.name}" failed: ${err.message}`);
              } finally {
                page.off('console', onConsole);
                page.off('response', onResponse);
                await page.close().catch(() => {});
              }
            }
          }

          await context.close();
        }
      }
    } finally {
      await browser.close();
    }

    const summary = {
      capturedAt: new Date().toISOString(),
      baseUrl: opts.baseUrl,
      outputDir: outDir,
      totalCaptures: captures.length,
      issuesSummary: {
        horizontalOverflowCount: captures.filter((c) => c.audit.hasHorizontalOverflow).length,
        subFloorFontPages: captures.filter((c) => c.audit.subFloorFonts.length > 0).length,
        clippedTextPages: captures.filter((c) => c.audit.clippedTextElements.length > 0).length,
        apiErrorPages: captures.filter((c) => c.audit.apiErrors.length > 0).length,
      },
      captures,
    };

    const summaryPath = path.join(outDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Mirror to tmp/ui-capture/latest only for local runs, never leak audit files outside tmp/ui-audit
    if (outDir !== latestDir && !opts.outDir?.includes('ui-audit')) {
      fs.rmSync(latestDir, { recursive: true, force: true });
      fs.cpSync(outDir, latestDir, { recursive: true });
    }

    console.log(`\n[ui:capture] Completed ${captures.length} capture(s).`);
    console.log(`[ui:capture] Output directory : ${outDir}`);
    if (!opts.outDir?.includes('ui-audit')) {
      console.log(`[ui:capture] Latest shortcut  : ${latestDir}`);
    }
    console.log(`[ui:capture] Audit summary    : ${summaryPath}`);
  } finally {
    if (serverHandle.startedByUs) {
      console.log('[ui:capture] Stopping temporary dev server...');
      await serverHandle.stop();
    }
  }
}

main().catch((err) => {
  console.error('[ui:capture] Fatal error:', err);
  process.exit(1);
});
