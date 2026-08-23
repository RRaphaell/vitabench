import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/raphaelkalandadze/.hermes/hermes-agent/node_modules/playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../web');
const SEASONS = [0, 34, 126, 172];
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
  origin = `http://localhost:${port}`;
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: WEB,
    stdio: 'ignore',
    detached: true,
  });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await servesViewer(origin);
  }
  if (!up) {
    console.error(`preview server did not start at ${origin}`);
    try {
      process.kill(-server.pid);
    } catch {
      /* already gone */
    }
    process.exit(1);
  }
}

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

for (const t of SEASONS) {
  await page.goto(`${origin}/?run=${runId}&t=${t}`, { waitUntil: 'load' });
  await page.waitForFunction('window.vitabenchFrames > 60', null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const file = resolve(outDir, `t${t}.png`);
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
