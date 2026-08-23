import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/raphaelkalandadze/.hermes/hermes-agent/node_modules/playwright');

const dir = '/Users/raphaelkalandadze/Desktop/personal/projects/agihouse-long-horizon-hackathon/vitabench/web/landing';
const out = `${dir}/screens`;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

const shots = [
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
  { name: 'mobile', width: 390, height: 844, scale: 2 },
];

for (const s of shots) {
  const page = await browser.newPage({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: s.scale,
  });
  await page.goto(`file://${dir}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  // trigger every reveal, then settle
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    const step = window.innerHeight * 0.7;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    for (const el of document.querySelectorAll('.reveal')) el.classList.add('in');
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${out}/${s.name}_hero.png` });
  await page.screenshot({ path: `${out}/${s.name}_full.png`, fullPage: true });

  for (const [label, sel] of [['how', '#how'], ['results', '#results'], ['bring', '#bring'], ['limits', '#limits']]) {
    await page.evaluate((selector) => {
      document.querySelector(selector).scrollIntoView();
    }, sel);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${s.name}_${label}.png` });
  }
  await page.close();
}

await browser.close();
console.log('screens written to', out);
