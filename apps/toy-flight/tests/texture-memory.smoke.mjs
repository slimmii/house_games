/** Run with Vite active: GAME_URL=http://localhost:5173 npm run test:textures */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.GAME_URL ?? 'http://localhost:5173';
const manifest = JSON.parse(await readFile(new URL('../../../packages/house/public/models/house-gpu-manifest.json', import.meta.url), 'utf8'));
const views = ['living', 'kitchen', 'camber'];
await mkdir('test-results/textures', { recursive: true });
const results = {};
for (const mode of ['original', 'compressed']) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${message.location().url}: ${message.text()}`); });
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    const suffix = mode === 'original' ? '?textures=original' : '';
    await page.goto(`${base}/tests/texture-review.html${suffix}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', {}, { timeout: 180_000 });
    const textures = await page.evaluate(() => {
      const found = new Map();
      review.scene.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value?.isTexture) found.set(value.uuid, value);
        }
      });
      return [...found.values()].map(texture => {
        let bytes = 0;
        if (texture.isCompressedTexture) bytes = texture.mipmaps.reduce((sum, mip) => sum + mip.data.byteLength, 0);
        else {
          let { width, height } = texture.image;
          while (true) {
            bytes += width * height * 4;
            if (!texture.generateMipmaps || width === 1 && height === 1) break;
            width = Math.max(1, Math.floor(width / 2));
            height = Math.max(1, Math.floor(height / 2));
          }
        }
        return { name: texture.name, width: texture.image.width, height: texture.image.height,
          compressed: Boolean(texture.isCompressedTexture), format: texture.format, colorSpace: texture.colorSpace,
          mipmaps: texture.mipmaps.length, bytes };
      });
    });
    const captures = [];
    for (const view of views) {
      await page.selectOption('#view', view);
      // Let the existing fixture-light fade settle before comparing pixels.
      await page.waitForTimeout(1200);
      const path = `test-results/textures/${view}-${mode}.png`;
      await page.screenshot({ path });
      captures.push(path);
    }
    assert.deepEqual(errors, [], `${mode} browser errors`);
    results[mode] = { textures, bytes: textures.reduce((sum, texture) => sum + texture.bytes, 0), captures, errors };
    console.log(`${mode}: ${textures.length} material textures; ${(results[mode].bytes / 1024 ** 2).toFixed(1)} MiB`);
  } finally { await browser.close(); }
}
const signature = texture => `${texture.name}:${texture.width}x${texture.height}:${texture.colorSpace}`;
assert.deepEqual(results.compressed.textures.map(signature).sort(), results.original.textures.map(signature).sort(),
  'Texture dimensions, names and color spaces must be preserved');
assert.equal(results.original.textures.filter(texture => texture.compressed).length, 0);
assert.equal(results.compressed.textures.filter(texture => texture.compressed).length, manifest.compressedImages);
assert.ok(results.compressed.bytes < results.original.bytes * .5, 'GPU texture payload should shrink by at least 50%');
await writeFile('test-results/textures/browser-verification.json', `${JSON.stringify(results, null, 2)}\n`);
console.log(`Texture memory reduced by ${(100 * (1 - results.compressed.bytes / results.original.bytes)).toFixed(1)}%.`);
