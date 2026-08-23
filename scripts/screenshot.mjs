import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/raphaelkalandadze/.hermes/hermes-agent/node_modules/playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '../site');
const runDir = resolve(process.cwd(), process.argv[2] ?? '../runs/demo');
const baseUrl = process.argv[3] ?? 'http://localhost:5173';
const runId = basename(runDir);

const servesViewer = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.text()).includes('VitaBench');
  } catch {
    return false;
  }
};

const freePort = () =>
  new Promise((done) => {
    const probe = createServer();
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });

let server = null;
let origin = baseUrl;
if (!(await servesViewer(origin))) {
  const port = await freePort();
  origin = `http://localhost:${port}/app`;
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: SITE,
    stdio: 'ignore',
    detached: true,
  });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await servesViewer(origin);
  }
  if (!up) {
    console.error(`site server did not start at ${origin} (run scripts/build_site.sh first)`);
    try {
      process.kill(-server.pid);
    } catch {
      /* already gone */
    }
    process.exit(1);
  }
}

const frames = JSON.parse(readFileSync(resolve(runDir, 'frames.json'), 'utf8'));
const rows = Array.isArray(frames) ? frames : (frames.frames ?? []);
const payoff = rows.find((f) => f.type === 'moment' && f.kind !== 'plant');
const end = rows.find((f) => f.type === 'end');
const endT = end ? end.t : 172;
const shots = [
  ['t0', 't=0', null],
  ['follow_12', 't=12', null],
  ['t34', 't=34&view=overview', null],
  [`t${payoff ? payoff.t : 126}`, `t=${payoff ? payoff.t : 126}`, null],
  [`t${endT}`, `t=${endT}`, null],
  ['title', 'title=1', null],
  ['drawer', 't=0', 'drawer'],
  ['bring', `t=${endT}`, 'space'],
];

const outDir = resolve(runDir, 'screens');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') console.log(`  [page ${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => console.log(`  [page error] ${err.message}`));

for (const [name, query, action] of shots) {
  await page.goto(`${origin}/?run=${runId}&${query}`, { waitUntil: 'load' });
  await page.waitForFunction('window.vitabenchFrames > 60', null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(6000);
  if (action === 'drawer') {
    await page.click('.lb-btn');
    await page.waitForTimeout(900);
  }
  if (action === 'space') {
    await page.keyboard.press('Space');
    await page.waitForTimeout(1200);
  }
  const file = resolve(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

await browser.close();
if (server) {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
}
