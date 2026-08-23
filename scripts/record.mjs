// Records a backup demo video of a run: node scripts/record.mjs <runName> [baseUrl]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/raphaelkalandadze/.hermes/hermes-agent/node_modules/playwright');
const run = process.argv[2] ?? 'demo';
let base = process.argv[3];
import { createServer } from 'node:net';
const freePort = () => new Promise(resolve => { const probe = createServer(); probe.listen(0, () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
let server;
if (!base) {
  const port = await freePort();
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: new URL('../web', import.meta.url).pathname, stdio: 'ignore' });
  base = `http://localhost:${port}`;
  await new Promise(r => setTimeout(r, 2500));
}
const out = `runs/${run}/video`; rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: out, size: { width: 1600, height: 900 } } });
const page = await ctx.newPage();
await page.goto(`${base}/?run=${run}`); await page.waitForTimeout(6000);
if (!(await page.title()).includes('VitaBench')) { console.error('wrong page at', base, await page.title()); process.exit(1); }
await page.keyboard.press('2'); await page.waitForTimeout(18000);
for (let i = 0; i < 9; i++) {
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(6500);
  await page.keyboard.press('Space'); await page.waitForTimeout(9000);
}
await page.keyboard.press('Tab'); await page.waitForTimeout(8000);
await ctx.close(); await browser.close(); server?.kill();
const webm = readdirSync(out).find(f => f.endsWith('.webm'));
renameSync(`${out}/${webm}`, `${out}/demo.webm`);
console.log('video saved', `${out}/demo.webm`);
