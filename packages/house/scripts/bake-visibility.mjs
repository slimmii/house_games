#!/usr/bin/env node
/**
 * Precompute which static house batches are visible from each 2-unit voxel
 * (see src/client/visibility.ts). Starts a Vite dev server, loads
 * scripts/visibility-bake.html in headless Chrome and renders batch-ID cube
 * maps from a lattice of points. Takes about 15 minutes on an Apple M2; `--verify` checks the
 * inputs for `npm run build`.
 *
 *   npm run bake:visibility                 full bake
 *   npm run bake:visibility -- --cell 4     coarser grid (quick experiments)
 */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { houseGeometrySha256 } from './house-geometry-hash.mjs';

const MANIFEST_PATH = 'public/models/house-visibility.json';
const DATA_FILE = 'house-visibility.bin.gz';
const DATA_PATH = `public/models/${DATA_FILE}`;
const GPU_MANIFEST_PATH = 'public/models/house-gpu-manifest.json';
// Anything that changes the batch layout or the occluding surfaces.
const INPUTS = [
  'src/client/architectureBatching.ts', 'src/client/architecture-backfaces.json', 'scripts/door-details.json',
  'src/shared/closets-manifest.json', 'src/shared/laundry-source-names.json', 'scripts/visibility-bake.html',
];
const FORMAT = 1;

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// Back-face eligibility matters; the asset hashes it records change with every texture re-encode.
const sha256 = async path => {
  const bytes = await readFile(path);
  if (!path.endsWith('architecture-backfaces.json')) return digest(bytes);
  const { assets, ...eligibility } = JSON.parse(bytes.toString('utf8'));
  return digest(JSON.stringify(eligibility));
};

async function verify() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const gpu = JSON.parse(await readFile(GPU_MANIFEST_PATH, 'utf8'));
  const problems = [];
  if (manifest.version !== FORMAT) problems.push('unsupported visibility format');
  // Keyed on geometry, not file bytes: texture changes don't move batches or occluders.
  if (manifest.houseGeometrySha256 !== gpu.geometrySha256) problems.push('house-gpu.glb geometry changed');
  for (const path of INPUTS) if (manifest.inputs[path] !== await sha256(path)) problems.push(`${path} changed`);
  if (manifest.dataSha256 !== await sha256(DATA_PATH)) problems.push('visibility data changed');
  if (problems.length) throw new Error(`House visibility is stale (${problems.join(', ')}). Run npm run bake:visibility.`);
  console.log(`House visibility verified: ${manifest.dims.join('×')} voxels, ${manifest.batchCount} batches`);
}

async function bake() {
  const cellArg = process.argv.indexOf('--cell');
  const cell = cellArg > 0 ? Number(process.argv[cellArg + 1]) : 2;
  // --query 'cells=6' bakes for another batch layout (experiments only; the game loads one file).
  const queryArg = process.argv.indexOf('--query');
  const extra = queryArg > 0 ? `&${process.argv[queryArg + 1]}` : '';
  const { createServer } = await import('vite');
  const { chromium } = await import('@playwright/test');
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'warn' });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
  try {
    const page = await browser.newPage();
    page.on('console', message => console.log(message.text()));
    page.on('pageerror', error => console.error(error));
    await page.goto(`${url}scripts/visibility-bake.html?visibility=off&cell=${cell}${extra}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', {}, { timeout: 600_000 });
    const result = await page.evaluate(() => window.bakeVisibility());
    const raw = Buffer.from(result.bits, 'base64');
    const data = gzipSync(raw, { level: 9 });
    const gpu = JSON.parse(await readFile(GPU_MANIFEST_PATH, 'utf8'));
    const manifest = {
      version: FORMAT,
      houseGeometrySha256: gpu.geometrySha256,
      inputs: Object.fromEntries(await Promise.all(INPUTS.map(async path => [path, await sha256(path)]))),
      data: DATA_FILE,
      byteLength: raw.byteLength,
      dataSha256: createHash('sha256').update(data).digest('hex'),
      origin: result.origin,
      cellSize: result.cellSize,
      dims: result.dims,
      batchCount: result.batchCount,
      fingerprint: result.fingerprint,
      occluders: result.occluders,
      meanVisible: Math.round(result.meanVisible),
      seconds: result.seconds,
    };
    await writeFile(DATA_PATH, data);
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(`Wrote ${result.dims.join('×')} visibility voxels: ${manifest.meanVisible}/${result.batchCount} batches visible on average `
      + `(${(data.byteLength / 1e3).toFixed(0)} kB, ${result.seconds} s)`);
  } finally {
    await browser.close();
    await server.close();
  }
}

/**
 * One-time migration from file-hash keys: only accepted while the data was
 * baked against exactly the current house-gpu.glb and inputs.
 */
async function rekey() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const gpu = JSON.parse(await readFile(GPU_MANIFEST_PATH, 'utf8'));
  if (manifest.houseSha256 !== gpu.outputSha256) throw new Error('Visibility was not baked against the current house-gpu.glb');
  for (const path of INPUTS) {
    if (manifest.inputs[path] !== digest(await readFile(path))) throw new Error(`${path} changed since the bake`);
  }
  const { houseSha256, ...rest } = manifest;
  const next = { version: rest.version, houseGeometrySha256: await houseGeometrySha256(await readFile('public/models/house-gpu.glb')),
    ...rest, inputs: Object.fromEntries(await Promise.all(INPUTS.map(async path => [path, await sha256(path)]))) };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(next, null, 1)}\n`);
  console.log('Visibility manifest now keyed on house geometry.');
}

if (process.argv.includes('--verify')) await verify();
else if (process.argv.includes('--rekey')) await rekey();
else await bake();
