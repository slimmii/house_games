import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const phase = process.argv[2] ?? 'after';
const base = process.env.GAME_URL ?? 'http://localhost:5173';
const views = [
  ['ground-bedroom', [13.3, 4.4, -22], [20.6, 6.8, -27.5]],
  ['ground-entrance', [5.2, 4.5, -6.3], [1, 6.7, -2]],
  ['first-living', [15, 12, -17], [21, 15.2, -20.8]],
  ['first-living-west', [14, 13.8, -17.4], [8.4, 13.8, -17.4]],
  ['first-kitchen', [5.2, 11.5, -24], [2, 14.5, -31.5]],
  ['upper-bedroom1', [13, 20.1, -8], [20.8, 24, -12.5]],
  ['upper-bedroom2', [13, 20.1, -20], [20.8, 24, -25.5]],
  ['upper-bathroom', [5.3, 20.1, -22], [1, 24, -25.5]],
  ['ground-stair', [4.5, 4.6, -13.0], [2.6, 5.6, -14.9]],
  ['first-dining-ring', [15.5, 11.2, -17.5], [16.0, 15.0, -19.0]],
  ['first-kitchen-floor', [5.1, 12.6, -26.8], [4.6, 10.0, -29.5]],
  // Lobby-style orbit from [-18, 36, 22], pushed to ~60 units from target (camera far plane is 90).
  ['exterior-lobby', [-21.78, 39.01, 26.8], [11.5, 12.5, -15.5]],
];
const phaseQueries = {
  toy: '',
  'toy-outline': '?outline=on',
  splat: '?style=splat',
  'splat-coarse': '?style=splat&splat=100',
  'splat-fine': '?style=splat&splat=220',
  classic: '?style=classic',
  'classic-live': '?style=classic&lighting=live',
  before: '?fog=old',
  'ambient-off': '?ambient=off',
  live: '?lighting=live',
  transmission: '?glass=transmission',
  noglow: '?glow=off',
  flatbg: '?background=flat',
  'show-daylight': '?show=daylight',
  'show-fixture': '?show=fixture',
  nospec: '?show=nospec',
  'show-front': '?show=front',
  drafts: '?drafts=live',
  comic: '?style=comic',
  'comic-aa4': '?style=comic&aa=4&env=on',
  'comic-fast': '?style=comic&aa=0&env=off',
  'comic-cells18': '?style=comic&cells=18',
  'comic-cells36': '?style=comic&cells=36',
  'comic-aa2': '?style=comic&aa=2&env=off',
};
// LIGHTING_VIEWS=ground-bedroom,first-living restricts a run to a few views.
const selected = process.env.LIGHTING_VIEWS?.split(',').map(name => name.trim()).filter(Boolean);
const activeViews = selected?.length ? views.filter(([name]) => selected.includes(name)) : views;
await mkdir('test-results/lighting', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
try {
  // LIGHTING_SIZE=1920x1080 measures at a larger canvas (the review page reads w/h).
const [vw, vh] = (process.env.LIGHTING_SIZE ?? '1280x800').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  if (phase === 'before') {
    // Retained local baseline enables paired measurements after the offline bake.
    for (const [asset, baseline] of [
      ['house-baked-lighting.json', 'before-manifest.json'],
      ['house-baked-lighting.bin', 'before-lighting.bin'],
      ['house-baked-lighting-topology.bin', 'before-topology.bin'],
      ['house-irradiance-volume.bin', 'before-volume.bin'],
    ]) {
      if (!existsSync(`test-results/lighting/${baseline}`)) continue;
      await page.route(`**/models/${asset}`, route => route.fulfill({ path: `test-results/lighting/${baseline}` }));
    }
  }
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const query = Object.hasOwn(phaseQueries, phase) ? phaseQueries[phase] : '';
  const sizeQuery = `${query ? '&' : '?'}w=${vw}&h=${vh}`;
  await page.goto(`${base}/tests/lighting-review.html${query}${sizeQuery}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true', {}, { timeout: 180_000 });
  // Warm-up: visit every view once so shader compilation and texture uploads
  // do not land in the first measured view.
  for (const [, position, target] of activeViews) {
    await page.evaluate(({ position, target }) => {
      const { camera, renderer, scene } = window.review;
      camera.position.set(...position);
      camera.lookAt(...target);
      window.review.draw();
    }, { position, target });
  }
  await page.waitForTimeout(1500);
  const results = [];
  for (const [name, position, target] of activeViews) {
    await page.evaluate(({ position, target }) => {
      const { camera, renderer, scene } = window.review;
      camera.position.set(...position);
      camera.lookAt(...target);
      window.review.draw();
    }, { position, target });
    const metrics = await page.evaluate(async () => {
      const { renderer, scene, camera } = window.review;
      renderer.setAnimationLoop(null);
      const gl = renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const queries = [], cpu = [];
      for (let i = 0; i < 65; i++) {
        await new Promise(requestAnimationFrame);
        const query = i >= 20 && ext ? gl.createQuery() : null;
        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        const start = performance.now();
        window.review.draw();
        if (i >= 20) cpu.push(performance.now() - start);
        if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); queries.push(query); }
      }
      const gpu = [];
      for (const query of queries) {
        for (let i = 0; i < 120 && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE); i++) {
          await new Promise(requestAnimationFrame);
        }
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        }
        gl.deleteQuery(query);
      }
      const median = values => values.length ? values.sort((a,b) => a-b)[Math.floor(values.length / 2)] : null;
      const stats = { ...renderer.info.render, textures: renderer.info.memory.textures,
        cpuMs: median(cpu), gpuMs: median(gpu), gpuSamples: gpu.length,
        baked: scene.getObjectByName('blender-house').children.find(child => child.userData.bakedLightingStatus)?.userData.bakedLightingStatus };
      renderer.setAnimationLoop(window.review.draw);
      return stats;
    });
    // Live phase disables the bake by design.
    if (query.includes('style=classic') && !query.includes('lighting=live')) assert.equal(metrics.baked?.applied, true, 'Bake must apply without live-light fallback');
    await page.screenshot({ path: `test-results/lighting/${phase}-${name}.png` });
    results.push({ name, ...metrics });
    console.log(phase, name, JSON.stringify(metrics));
  }
  assert.deepEqual(errors, [], 'No browser or shader errors');
  await writeFile(`test-results/lighting/${phase}.json`, JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); }
