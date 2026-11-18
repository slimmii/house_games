import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
  architectureStructureFingerprint,
  prepareArchitectureBackfaceManifest,
  type ArchitectureBackfaceManifest,
} from '../src/client/architectureBackfaces';

const SOURCE_PATH = 'public/models/house.glb';
const GPU_PATH = 'public/models/house-gpu.glb';
const GPU_MANIFEST_PATH = 'public/models/house-gpu-manifest.json';
const OUTPUT_PATH = 'src/client/architecture-backfaces.json';

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function loadSource(bytes: Uint8Array) {
  // Geometry/material analysis does not sample pixels. Supply tiny image
  // placeholders so GLTFLoader can reconstruct the scene graph in Node.
  (globalThis as any).self = globalThis;
  (globalThis as any).createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, '');
}

const sourceBytes = await readFile(SOURCE_PATH);
const gpuBytes = await readFile(GPU_PATH);
const gpuManifest = JSON.parse(await readFile(GPU_MANIFEST_PATH, 'utf8')) as {
  sourceSha256: string;
  outputSha256: string;
};
assert.equal(hash(sourceBytes), gpuManifest.sourceSha256, 'house.glb does not match its verified texture manifest');
assert.equal(hash(gpuBytes), gpuManifest.outputSha256, 'house-gpu.glb does not match its verified texture manifest');
const assets = {
  '/models/house.glb': gpuManifest.sourceSha256,
  '/models/house-gpu.glb': gpuManifest.outputSha256,
};
const { scene } = await loadSource(sourceBytes);

if (process.argv.includes('--verify')) {
  const manifest = JSON.parse(await readFile(OUTPUT_PATH, 'utf8')) as ArchitectureBackfaceManifest;
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.assets, assets, 'Back-face manifest asset hashes are stale');
  const structure = architectureStructureFingerprint(scene);
  assert.equal(manifest.meshCount, structure.meshCount, 'Back-face manifest mesh count is stale');
  assert.equal(manifest.structureFingerprint, structure.fingerprint, 'Back-face manifest structure is stale');
  const bits = Buffer.from(manifest.eligibleBitset, 'base64');
  assert.ok(bits.length * 8 >= manifest.meshCount, 'Back-face eligibility table is truncated');
  let eligible = 0;
  for (let ordinal = 0; ordinal < manifest.meshCount; ordinal += 1) {
    if ((bits[ordinal >> 3] & (1 << (ordinal & 7))) !== 0) eligible += 1;
  }
  assert.equal(eligible, manifest.eligibleMeshCount, 'Back-face eligibility count is inconsistent');
  console.info(`Verified ${eligible} selectively culled meshes against ${manifest.meshCount} source meshes.`);
} else {
  const { manifest, stats } = prepareArchitectureBackfaceManifest(scene, assets);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.info(
    `Prepared ${stats.meshesEligible} meshes / ${stats.trianglesEligible} triangles `
    + `from ${stats.meshesVisited} source meshes.`,
  );
}
