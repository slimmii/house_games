// Screenshot helper for the defense game and its review pages (needs `npm run dev` on port 5174).
//   node tests/defense-shot.mjs "<url>" <out.png> ["<js to evaluate before the shot>"]
//   env: W, H (viewport, default 1280x800), DPR (default 1), WAIT (ms after ready, default 500)
// Waits for `document.body.dataset.ready === 'true'`, prints the evaluated value and any console errors.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [url, out, script] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node tests/defense-shot.mjs "<url>" <out.png> ["<js>"]');
  process.exit(2);
}
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({
  viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 800) },
  deviceScaleFactor: Number(process.env.DPR ?? 1),
});
const problems = [];
page.on('console', message => { if (message.type() === 'error') problems.push(`[console] ${message.text()}`); });
page.on('pageerror', error => problems.push(`[pageerror] ${error.message}`));
try {
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 120000 });
  if (script) {
    const value = await page.evaluate(script);
    if (value !== undefined) console.log(JSON.stringify(value));
  }
  await page.waitForTimeout(Number(process.env.WAIT ?? 500));
  await page.screenshot({ path: out });
  console.log(`saved ${out}`);
} catch (error) {
  problems.push(`[shot] ${error instanceof Error ? error.message : error}`);
}
if (problems.length) console.log(problems.slice(0, 20).join('\n'));
await browser.close();
process.exit(problems.length ? 1 : 0);
