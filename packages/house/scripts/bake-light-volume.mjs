/**
 * Quick lamp-light volume for the toy style.
 *
 * Samples only the lamps (reference fixtures, draft fixtures and derived
 * emitters) on a coarse grid over the house, with shadow rays against the
 * static geometry. The result is a small 3D texture the shaders read at world
 * position, so lamp pools follow the room and not the triangles. Daylight is
 * not part of it: the toy shading supplies that per pixel. Runs in about a
 * minute on worker threads; `--verify` checks the inputs for `npm run build`.
 */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { createLightingSampler, encodeIrradiance, prepareFixtures } from './daylight-gather.mjs';
import { expandDraftFixtures } from '../src/shared/draftFixtures';

const SOURCE_PATH = 'public/models/house.glb';
const GPU_MANIFEST_PATH = 'public/models/house-gpu-manifest.json';
const FIXTURES_PATH = 'src/client/house-light-fixtures.json';
const DRAFTS_PATH = 'src/client/house-light-drafts.json';
const EMITTERS_PATH = 'src/client/house-lamp-emitters.json';
const DAYLIGHT_PATH = 'src/shared/daylight.json';
const MANIFEST_PATH = 'public/models/house-light-volume.json';
const DATA_PATH = 'public/models/house-light-volume.bin';
const INPUTS = [FIXTURES_PATH, DRAFTS_PATH, EMITTERS_PATH, 'src/shared/draftFixtures.ts', 'scripts/daylight-gather.mjs'];
const HOUSE_BOX = { min: [-0.3, -0.6, -33.2], max: [22.5, 25.5, 2.1] };
const CELL = 0.5;

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function verify() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const gpu = JSON.parse(await readFile(GPU_MANIFEST_PATH, 'utf8'));
  const problems = [];
  if (manifest.version !== 1) problems.push('unsupported volume format');
  if (manifest.sourceSha256 !== gpu.sourceSha256) problems.push('house.glb changed');
  for (const path of INPUTS) if (manifest.inputs[path] !== await sha256(path)) problems.push(`${path} changed`);
  if (manifest.dataSha256 !== await sha256(DATA_PATH)) problems.push('volume data changed');
  if (manifest.byteLength !== (await stat(DATA_PATH)).size) problems.push('volume byte length changed');
  if (problems.length) throw new Error(`Light volume is stale: ${problems.join('; ')}. Run npm run bake:volume.`);
  console.log(`Light volume verified: ${manifest.dims.join('×')} cells, ${manifest.fixtureCount} lamps`);
}

if (!isMainThread) {
  // Worker: rebuild the BVH from shared positions and sample assigned cells.
  const { positions, fixtures, emitters, daylight, dims, origin, cell } = workerData;
  const geometry = new THREE.BufferGeometry();
  const triangles = new Float32Array(positions);
  geometry.setAttribute('position', new THREE.BufferAttribute(triangles, 3));
  const bvh = new MeshBVH(geometry, { targetLeafSize: 24 });
  const sampler = createLightingSampler(bvh, {
    fixtures: prepareFixtures(fixtures, emitters), daylight,
    triangleAlbedo: new Float32Array(0), trianglePositions: triangles, houseBox: HOUSE_BOX,
  });
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const ray = new THREE.Ray();
  parentPort.on('message', ({ start, end }) => {
    const out = new Float32Array((end - start) * 2);
    for (let index = start; index < end; index++) {
      const x = index % dims[0];
      const y = Math.floor(index / dims[0]) % dims[1];
      const z = Math.floor(index / (dims[0] * dims[1]));
      point.set(origin[0] + (x + 0.5) * cell, origin[1] + (y + 0.5) * cell, origin[2] + (z + 0.5) * cell);
      let lamp = 0;
      let enclosed = 0;
      for (const axis of axes) {
        normal.fromArray(axis);
        ray.origin.copy(point);
        ray.direction.copy(normal);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, cell * 0.7);
        if (hit?.face && hit.face.normal.dot(normal) > 0) enclosed += 1;
        lamp += sampler.fixtureIrradiance(point, normal);
      }
      out[(index - start) * 2] = lamp / axes.length;
      out[(index - start) * 2 + 1] = enclosed >= 2 ? 1 : 0;
    }
    parentPort.postMessage({ start, out }, [out.buffer]);
  });
  parentPort.postMessage('ready');
} else if (process.argv.includes('--verify')) {
  await verify();
} else {
  const started = performance.now();
  const [{ NodeIO }, { ALL_EXTENSIONS }, { MeshoptDecoder }] = await Promise.all([
    import('@gltf-transform/core'), import('@gltf-transform/extensions'), import('meshoptimizer'),
  ]);
  await MeshoptDecoder.ready;
  const daylight = JSON.parse(await readFile(DAYLIGHT_PATH, 'utf8'));
  const fixtures = [
    ...JSON.parse(await readFile(FIXTURES_PATH, 'utf8')),
    ...expandDraftFixtures(JSON.parse(await readFile(DRAFTS_PATH, 'utf8')).drafts),
  ];
  const emitters = JSON.parse(await readFile(EMITTERS_PATH, 'utf8')).emitters;
  const closets = JSON.parse(await readFile('src/shared/closets-manifest.json', 'utf8'));
  const movingNames = new Set([
    ...closets.entries.flatMap(entry => [...entry.frontNames, ...entry.handleNames, ...entry.attachedNames, ...entry.removeNames]),
    ...JSON.parse(await readFile('src/shared/laundry-source-names.json', 'utf8')),
  ]);
  const movingPatterns = JSON.parse(await readFile('scripts/door-details.json', 'utf8')).map(pattern => new RegExp(pattern, 'i'));
  const lightPassing = new Set(daylight.lightPassingMaterials ?? []);
  const lightPassingNodes = (daylight.lightPassingNodePatterns ?? []).map(pattern => new RegExp(pattern, 'i'));
  const isStatic = node => !movingNames.has(node.getName()) && !movingPatterns.some(pattern => pattern.test(node.getName()));
  const isOccluder = (primitive, node) => {
    const material = primitive.getMaterial();
    if (!material) return true;
    if (material.getAlphaMode() === 'BLEND' || lightPassing.has(material.getName())) return false;
    if (lightPassingNodes.some(pattern => pattern.test(node.getName()))) return false;
    return !material.listExtensions().some(extension => extension.extensionName === 'KHR_materials_transmission');
  };

  console.log('Reading house geometry…');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(SOURCE_PATH);
  const nodes = document.getRoot().listNodes();
  let vertexCount = 0;
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh || !isStatic(node)) continue;
    for (const primitive of mesh.listPrimitives()) {
      if (isOccluder(primitive, node)) vertexCount += primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount();
    }
  }
  const positions = new Float32Array(new SharedArrayBuffer(vertexCount * 3 * 4));
  const point = new THREE.Vector3();
  const element = [];
  let cursor = 0;
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh || !isStatic(node)) continue;
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      if (!isOccluder(primitive, node)) continue;
      const attribute = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      const count = indices?.getCount() ?? attribute.getCount();
      for (let i = 0; i < count; i++) {
        point.fromArray(attribute.getElement(indices ? indices.getScalar(i) : i, element)).applyMatrix4(matrix);
        point.toArray(positions, cursor);
        cursor += 3;
      }
    }
  }
  const dims = [0, 1, 2].map(axis => Math.ceil((HOUSE_BOX.max[axis] - HOUSE_BOX.min[axis]) / CELL));
  const cellCount = dims[0] * dims[1] * dims[2];
  console.log(`${(vertexCount / 3).toLocaleString()} occluder triangles, ${fixtures.length + emitters.length} lamps, ${dims.join('×')} cells`);

  const raw = new Float32Array(cellCount * 2);
  const workerCount = Math.max(1, Math.min(10, cpus().length - 1));
  const chunk = 2048;
  let next = 0;
  await new Promise((resolve, reject) => {
    let active = 0;
    const workers = Array.from({ length: workerCount }, () => new Worker(new URL(import.meta.url), {
      workerData: { positions: positions.buffer, fixtures, emitters, daylight, dims, origin: HOUSE_BOX.min, cell: CELL },
    }));
    const dispatch = worker => {
      if (next >= cellCount) {
        worker.terminate();
        if (--active === 0) resolve();
        return;
      }
      const start = next;
      next = Math.min(cellCount, next + chunk);
      worker.postMessage({ start, end: next });
    };
    for (const worker of workers) {
      active += 1;
      worker.on('error', reject);
      worker.on('message', message => {
        if (message === 'ready') return dispatch(worker);
        raw.set(message.out, message.start * 2);
        dispatch(worker);
      });
    }
  });

  // Cells inside walls take the average of their open neighbours, so a door
  // leaf in its frame reads the room's light and not the wall's interior.
  const enclosed = new Uint8Array(cellCount);
  for (let i = 0; i < cellCount; i++) enclosed[i] = raw[i * 2 + 1] ? 1 : 0;
  const cellIndex = (x, y, z) => (z * dims[1] + y) * dims[0] + x;
  for (let pass = 0; pass < 3; pass++) {
    const filled = new Uint8Array(enclosed);
    for (let z = 0; z < dims[2]; z++) for (let y = 0; y < dims[1]; y++) for (let x = 0; x < dims[0]; x++) {
      const index = cellIndex(x, y, z);
      if (!enclosed[index]) continue;
      let sum = 0;
      let count = 0;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= dims[0] || ny >= dims[1] || nz >= dims[2]) continue;
        const neighbour = cellIndex(nx, ny, nz);
        if (enclosed[neighbour]) continue;
        sum += raw[neighbour * 2];
        count += 1;
      }
      if (!count) continue;
      raw[index * 2] = sum / count;
      filled[index] = 0;
    }
    enclosed.set(filled);
  }

  const values = Array.from({ length: cellCount }, (_, i) => raw[i * 2]).filter(v => v > 0).sort((a, b) => a - b);
  const maxFixture = Math.max(0.5, values[Math.floor(values.length * 0.995)] ?? 1);
  const data = new Uint8Array(cellCount * 2);
  for (let i = 0; i < cellCount; i++) data[i * 2] = encodeIrradiance(raw[i * 2], maxFixture);
  const gpu = JSON.parse(await readFile(GPU_MANIFEST_PATH, 'utf8'));
  const manifest = {
    version: 1,
    sourceSha256: gpu.sourceSha256,
    inputs: Object.fromEntries(await Promise.all(INPUTS.map(async path => [path, await sha256(path)]))),
    data: 'house-light-volume.bin',
    byteLength: data.byteLength,
    dataSha256: createHash('sha256').update(data).digest('hex'),
    dims, origin: HOUSE_BOX.min, cellSize: CELL,
    maxFixture,
    fixtureColor: daylight.fixtureColor,
    fixtureCount: fixtures.length + emitters.length,
    seconds: Number(((performance.now() - started) / 1000).toFixed(1)),
  };
  await writeFile(DATA_PATH, data);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest)}\n`);
  console.log(`Wrote ${dims.join('×')} light volume (${(data.byteLength / 1e3).toFixed(0)} kB, lamp ≤ ${maxFixture.toFixed(2)}) in ${manifest.seconds}s`);
  await verify();
}
