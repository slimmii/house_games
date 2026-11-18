import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import type { PaintMark } from '../src/shared/protocol';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/tests/entrance-paint-review.html`);
  await page.waitForFunction(() => Boolean((window as any).reviewReady), {}, { timeout: 180000 });
  const output = 'test-results/entrance-paint';
  await mkdir(output, { recursive: true });
  const before = await page.screenshot({ path: `${output}/before.png` });
  const marks = await page.evaluate(() => (window as any).review.show(true)) as PaintMark[];
  const after = await page.screenshot({ path: `${output}/after.png` });
  assert.equal(marks.length, 3);
  for (const mark of marks) assert.ok(Math.abs(mark.position.x - 1.035) < .00001);
  const [a, b] = await Promise.all([before, after].map(bytes => sharp(bytes).removeAlpha().raw().toBuffer()));
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) changed++;
  }
  assert.ok(changed > 10000, `entrance brick paint must be visible (${changed} changed pixels)`);
  assert.deepEqual(errors, []);
  console.log(`Entrance brick paint regression passed: ${changed} changed pixels.`);
} finally {
  await browser.close();
}
