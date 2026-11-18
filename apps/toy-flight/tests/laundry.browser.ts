import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5185/tests/laundry-review.html');
  await page.waitForFunction(() => (window as any).reviewReady, {}, { timeout: 180000 });
  await mkdir('test-results/laundry', { recursive: true });
  const a = await page.evaluate(() => (window as any).laundryReview.show(0));
  assert.equal(a.removed, 14);
  await page.waitForTimeout(700);
  const b = await page.evaluate(() => (window as any).laundryReview.show(0));
  assert.ok(b.rotations.every((r: number, i: number) => r !== a.rotations[i]));
  await page.screenshot({ path: 'test-results/laundry/closed.png' });
  const c = await page.evaluate(() => (window as any).laundryReview.show(1));
  await page.waitForTimeout(500);
  const d = await page.evaluate(() => (window as any).laundryReview.show(1));
  assert.deepEqual(d.rotations, c.rotations);
  await page.screenshot({ path: 'test-results/laundry/open.png' });
  assert.deepEqual(errors, []);
  console.log('Both machines render, rotate closed, and stop open; all 14 source solids replaced.');
} finally { await browser.close(); }
