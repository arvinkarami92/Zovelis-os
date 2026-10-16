// End-to-end check in a real browser.
//
//   node scripts/e2e.mjs            server build (starts the API in simulated mode)
//   node scripts/e2e.mjs demo       in-browser demo build (serves web/dist-demo)
//
// Build first (npm run build / npm run build:demo). Screenshots go to
// E2E_OUT (default: test-results/). Fails on any page error or console error.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const mode = process.argv[2] === 'demo' ? 'demo' : 'server';
const out = resolve(process.env.E2E_OUT ?? join(root, 'test-results'));
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const port = 8790 + (mode === 'demo' ? 1 : 0);
const base = `http://127.0.0.1:${port}/`;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

async function startTarget() {
  if (mode === 'demo') {
    const dir = join(root, 'web/dist-demo');
    if (!existsSync(join(dir, 'index.html'))) throw new Error('Run npm run build:demo first');
    const server = createServer((req, res) => {
      const path = new URL(req.url, base).pathname;
      const file = join(dir, path === '/' ? 'index.html' : path);
      if (!file.startsWith(dir) || !existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    await new Promise((r) => server.listen(port, '127.0.0.1', r));
    return () => server.close();
  }
  if (!existsSync(join(root, 'web/dist/index.html'))) throw new Error('Run npm run build first');
  const data = mkdtempSync(join(tmpdir(), 'zemvii-e2e-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/node/main.ts'], {
    cwd: join(root, 'server'),
    env: { ...process.env, PORT: String(port), ZEMVII_DATA: data, ZEMVII_SIMULATED: '1', ZEMVII_QUIET: '1', ZEMVII_WEB: join(root, 'web/dist') },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}healthz`)).ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return () => {
    child.kill();
    rmSync(data, { recursive: true, force: true });
  };
}

const errors = [];
let step = 0;

async function shot(page, name) {
  step++;
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(out, `${mode}-${String(step).padStart(2, '0')}-${name}.png`), fullPage: false });
}

function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] page error: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/fonts\.(googleapis|gstatic)\.com|ERR_TUNNEL|net::ERR_/.test(text)) return; // fonts may be unreachable offline
    if (/status of 4\d\d/.test(text)) return; // expected API answers (e.g. the tone nudge is a 409)
    errors.push(`[${label}] console error: ${text}`);
  });
}

async function goto(page, hash) {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(500);
}

async function phoneJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  watch(page, 'phone');
  await page.goto(base);
  await page.getByText('The social network that works').waitFor({ timeout: 20000 });
  await shot(page, 'landing');

  await page.getByRole('link', { name: mode === 'demo' ? 'Step into the demo' : 'Create your account' }).click();
  await page.locator('#su-name').fill('Ari Testa');
  if (mode === 'server') {
    await page.locator('#su-email').fill('ari@example.com');
    await page.locator('#su-password').fill('a long test password');
  }
  await page.locator('#su-birth').fill('1995-04-12');
  await shot(page, 'signup');
  await page.getByRole('button', { name: mode === 'demo' ? 'Enter Zemvii' : 'Create account' }).click();

  await page.getByText('What are you into').waitFor({ timeout: 20000 });
  for (const topic of ['Hiking', 'Photography', 'Coffee']) await page.getByRole('button', { name: topic }).first().click();
  await shot(page, 'onboarding-interests');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('How should your Mix feed work?').waitFor();
  await page.getByRole('button', { name: /^Balanced/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('How much Zemvii is enough?').waitFor();
  await page.getByRole('radio', { name: '60 min a day' }).click();
  await shot(page, 'onboarding-time');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Your people' }).waitFor();
  await page.getByRole('button', { name: 'Go to my feed' }).click();

  await page.locator('article.post').first().waitFor({ timeout: 20000 });
  await shot(page, 'home-friends');
  for (let i = 0; i < 4; i++) {
    const more = page.getByRole('button', { name: 'Show older posts' });
    if (!(await more.count())) break;
    await more.click();
    await page.waitForTimeout(400);
  }
  await page.locator('.caught-up').scrollIntoViewIfNeeded();
  await shot(page, 'friends-caught-up');

  await goto(page, '/home?feed=mix');
  await page.locator('.why-chip').first().waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await shot(page, 'home-mix');
  await page.locator('.why-chip').first().click();
  await page.getByRole('dialog', { name: 'Why am I seeing this?' }).waitFor();
  await page.getByText('What made up the score').waitFor();
  await shot(page, 'why-sheet');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Tune' }).click();
  await page.getByRole('dialog', { name: 'Feed Dials' }).waitFor();
  await shot(page, 'dials');
  await page.getByRole('button', { name: /^Calm Sunday/ }).click();
  await page.getByRole('button', { name: 'Save dials' }).click();
  await page.getByText('Feed Dials saved').waitFor();

  await page.getByRole('button', { name: "What's on your mind?" }).click();
  await page.locator('#composer-text').fill("you're an idiot");
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.getByText('Pause & rethink').waitFor();
  await shot(page, 'tone-nudge');
  await page.getByRole('button', { name: 'Edit my words' }).click();
  await page.locator('#composer-text').fill('Golden hour walk along the river today #photography');
  await page.getByRole('button', { name: 'Art', exact: true }).click();
  await page.locator('.art-option').first().click();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.getByText('Posted').first().waitFor();

  await goto(page, '/clips');
  await page.locator('.clip').first().waitFor();
  await shot(page, 'clips');

  await goto(page, '/plans');
  await page.locator('.plan-card').first().waitFor();
  await shot(page, 'plans');
  const going = page.getByRole('button', { name: 'Going', exact: true }).first();
  if (await going.count()) await going.click();

  await goto(page, '/messages');
  await page.getByText('Maya Okafor').first().click();
  await page.locator('#msg-input').fill('Hi Maya! Count me in for Sunday');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.locator('.bubble-row:not(.mine)').nth(1).waitFor({ timeout: 15000 });
  await shot(page, 'conversation');

  await goto(page, '/notifications');
  await page.getByRole('heading', { name: /asked you to vouch/ }).waitFor();
  await shot(page, 'notifications');

  await goto(page, '/wellbeing');
  await page.getByText('Connections this week').waitFor();
  await shot(page, 'wellbeing');

  await goto(page, '/u/maya');
  await page.getByRole('heading', { name: /Maya Okafor/ }).waitFor();
  await shot(page, 'profile');

  await goto(page, '/discover');
  await page.getByText('Talked about now').waitFor();
  await shot(page, 'discover');

  await goto(page, '/moderation');
  await page.getByText('Reports (').waitFor();
  await shot(page, 'moderation');

  await page.emulateMedia({ colorScheme: 'dark' });
  await goto(page, '/home?feed=friends');
  await page.locator('article.post').first().waitFor();
  await shot(page, 'home-dark');
  await context.close();
}

async function desktopJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  watch(page, 'desktop');
  await page.goto(base);
  await page.getByText('The social network that works').waitFor({ timeout: 20000 });
  await shot(page, 'desktop-landing');
  await page.getByRole('link', { name: mode === 'demo' ? 'Step into the demo' : 'Create your account' }).click();
  await page.locator('#su-name').fill('Desk Top');
  if (mode === 'server') {
    await page.locator('#su-email').fill('desk@example.com');
    await page.locator('#su-password').fill('a long test password');
  }
  await page.locator('#su-birth').fill('1990-01-20');
  await page.getByRole('button', { name: mode === 'demo' ? 'Enter Zemvii' : 'Create account' }).click();
  await page.getByText('What are you into').waitFor({ timeout: 20000 });
  await goto(page, '/home?feed=mix');
  await page.locator('.why-chip').first().waitFor();
  await shot(page, 'desktop-home-mix');
  await goto(page, '/wellbeing');
  await page.getByRole('heading', { name: 'This week', exact: true }).waitFor();
  await shot(page, 'desktop-wellbeing');
  await page.emulateMedia({ colorScheme: 'dark' });
  await goto(page, '/creator');
  await page.getByText('You earned').waitFor();
  await shot(page, 'desktop-creator-dark');
  await context.close();
}

const stop = await startTarget();
const browser = await chromium.launch({ executablePath });
try {
  await phoneJourney(browser);
  await desktopJourney(browser);
} catch (error) {
  errors.push(`journey failed: ${error.message}`);
} finally {
  await browser.close();
  stop();
}
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n${errors.map((e) => ` - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`E2E (${mode}) passed. Screenshots in ${out}`);
