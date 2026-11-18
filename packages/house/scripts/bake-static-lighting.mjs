import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder as ThreeMeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applyArchitectureBackfaces } from '../src/client/architectureBackfaces';
import { encodeIrradiance } from './daylight-gather.mjs';
import { expandDraftFixtures } from '../src/shared/draftFixtures';
import { allocateLightingSubdivision } from './lighting-subdivision.mjs';

const SOURCE_PATH = 'public/models/house.glb';
const GPU_PATH = 'public/models/house-gpu.glb';
const FIXTURES_PATH = 'src/client/house-light-fixtures.json';
const EMITTERS_PATH = 'src/client/house-lamp-emitters.json';
const DRAFTS_PATH = 'src/client/house-light-drafts.json';
const DAYLIGHT_PATH = 'src/shared/daylight.json';
const MANIFEST_PATH = 'public/models/house-baked-lighting.json';
const DATA_PATH = 'public/models/house-baked-lighting.bin';
const TOPOLOGY_PATH = 'public/models/house-baked-lighting-topology.bin';
const VOLUME_PATH = 'public/models/house-irradiance-volume.bin';
const ALBEDO_CACHE_PATH = 'node_modules/.cache/house-albedo.json';
const VERSION = 3;
// Front/back fixture irradiance, then front/back daylight irradiance.
const CHANNELS = 4;
const SUBDIVISION_SPACING = 1;
// Level 5 lets a 30-unit ceiling fan triangle reach the 1.4-unit spacing.
const MAX_SUBDIVISION_LEVEL = 5;
// Large flat walls and ceilings need interior samples for smooth daylight and
// bounce gradients; this budget replaces the old 59,526-triangle cap.
const MAX_ADDED_TRIANGLES = 320_000;
const ARCHITECTURAL_SPACING = 1.4;
const VOLUME_CELL = 1;
// BAKE_QUALITY=quick trades accuracy for a short bake (smoke tests of the pipeline).
const SAMPLING = process.env.BAKE_QUALITY === 'quick'
  ? { insideRays: 12, bounceRays: 8, nearRays: 6, outsideRays: 4, centroidRays: 8, sunRays: 2 }
  : { insideRays: 48, bounceRays: 24, nearRays: 24, outsideRays: 8, centroidRays: 12, sunRays: 4 };
// Two gathers: the second reads direct plus first-bounce light, so deep rooms
// receive light that has reflected twice. daylight.json's gain covers the rest.
const BOUNCES = Math.max(1, Number(process.env.BAKE_BOUNCES) || 2);
// Daylight is low-frequency: average it over neighbouring samples on the same plane.
const SMOOTH_CELL = 1;
const BAKE_INPUTS = ['scripts/bake-static-lighting.mjs', 'scripts/daylight-gather.mjs', 'scripts/bake-worker.mjs',
  'scripts/lighting-subdivision.mjs', 'scripts/door-details.json', 'src/shared/closets-manifest.json',
  'src/shared/laundry-source-names.json', 'src/client/architecture-backfaces.json', 'src/shared/draftFixtures.ts', DAYLIGHT_PATH, EMITTERS_PATH, DRAFTS_PATH];
const verifyOnly = process.argv.includes('--verify');
const planOnly = process.argv.includes('--plan-only');
const workerCount = Math.max(1, Math.min(10, Number(process.env.BAKE_WORKERS) || cpus().length - 1));

// Runtime-only settings in daylight.json (applied in shaders, not baked).
const RUNTIME_DAYLIGHT_KEYS = ['ambientFill', 'exposure', 'comic'];
async function sha256(path) {
  if (path === DAYLIGHT_PATH) {
    const settings = JSON.parse(await readFile(path, 'utf8'));
    for (const key of RUNTIME_DAYLIGHT_KEYS) delete settings[key];
    return createHash('sha256').update(JSON.stringify(settings)).digest('hex');
  }
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function verify() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const [sourceHash, gpuHash, fixtureHash, dataHash, topologyHash, volumeHash, dataInfo, topologyInfo, volumeInfo] = await Promise.all([
    sha256(SOURCE_PATH), sha256(GPU_PATH), sha256(FIXTURES_PATH), sha256(DATA_PATH),
    sha256(TOPOLOGY_PATH), sha256(VOLUME_PATH), stat(DATA_PATH), stat(TOPOLOGY_PATH), stat(VOLUME_PATH),
  ]);
  const problems = [];
  if (manifest.version !== VERSION || manifest.channels !== CHANNELS) problems.push('unsupported manifest format');
  for (const path of BAKE_INPUTS) {
    if (manifest.inputs?.[path] === await sha256(path)) continue;
    // Draft fixtures are proposals evaluated live first; a changed drafts file
    // only means the bake predates them, which must not block a build.
    if (path === DRAFTS_PATH) {
      console.warn('Draft fixtures changed since the last bake; evaluate with ?drafts=live, then run npm run bake:lighting.');
      continue;
    }
    problems.push(`${path} changed`);
  }
  if (manifest.subdivision.renderedTriangles - manifest.subdivision.sourceTriangles > MAX_ADDED_TRIANGLES) {
    problems.push('subdivision exceeds the rendering budget');
  }
  if (manifest.sourceFiles['/models/house.glb'] !== sourceHash) problems.push('house.glb hash changed');
  if (manifest.sourceFiles['/models/house-gpu.glb'] !== gpuHash) problems.push('house-gpu.glb hash changed');
  if (manifest.fixturesSha256 !== fixtureHash) problems.push('fixture definitions changed');
  if (manifest.dataSha256 !== dataHash) problems.push('baked data hash changed');
  if (manifest.subdivision.sha256 !== topologyHash) problems.push('subdivision data hash changed');
  if (manifest.volume.sha256 !== volumeHash) problems.push('irradiance volume hash changed');
  if (manifest.byteLength !== dataInfo.size) problems.push('baked data byte length changed');
  if (manifest.subdivision.byteLength !== topologyInfo.size) problems.push('subdivision byte length changed');
  if (manifest.volume.byteLength !== volumeInfo.size) problems.push('irradiance volume byte length changed');
  const entryBytes = manifest.entries.reduce((sum, entry) => sum + entry.vertexCount * CHANNELS, 0);
  if (entryBytes !== manifest.byteLength) problems.push('entry byte count does not match data');
  if (problems.length) throw new Error(`Static lighting bake is stale: ${problems.join('; ')}`);
  console.log(`Static lighting verified: ${manifest.entries.length} primitives, ${(dataInfo.size / 1e6).toFixed(1)} MB, volume ${manifest.volume.dims.join('×')}`);
}

if (verifyOnly) {
  await verify();
  process.exit(0);
}

const startedAt = performance.now();
const elapsed = () => `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
await MeshoptDecoder.ready;
// Proposed fixtures (house-light-drafts.json) bake like the reference ones.
const fixtures = [
  ...JSON.parse(await readFile(FIXTURES_PATH, 'utf8')),
  ...expandDraftFixtures(JSON.parse(await readFile(DRAFTS_PATH, 'utf8')).drafts),
];
const emitters = JSON.parse(await readFile(EMITTERS_PATH, 'utf8')).emitters;
const daylight = JSON.parse(await readFile(DAYLIGHT_PATH, 'utf8'));
const fixtureColor = daylight.fixtureColor;
if (fixtures.some(fixture => fixture.color.some((value, i) => Math.abs(value - fixtureColor[i]) > 1e-6))) {
  throw new Error(`Reference fixtures must share the daylight.json fixtureColor ${fixtureColor}`);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
});
console.log('Reading house geometry…');
const document = await io.read(SOURCE_PATH);
const root = document.getRoot();
const nodes = root.listNodes();
const meshes = root.listMeshes();
const meshIndices = new Map(meshes.map((mesh, index) => [mesh, index]));
const closets = JSON.parse(await readFile('src/shared/closets-manifest.json', 'utf8'));
const movingNames = new Set([
  ...closets.entries.flatMap(entry => [...entry.frontNames, ...entry.handleNames, ...entry.attachedNames, ...entry.removeNames]),
  ...JSON.parse(await readFile('src/shared/laundry-source-names.json', 'utf8')),
]);
const movingPatterns = JSON.parse(await readFile('scripts/door-details.json', 'utf8')).map(pattern => new RegExp(pattern, 'i'));
const isStatic = node => !movingNames.has(node.getName()) && !movingPatterns.some(pattern => pattern.test(node.getName()));

function matrixFor(node) {
  return new THREE.Matrix4().fromArray(node.getWorldMatrix());
}

// Closed shutters and curtains are modelled as solid sheets; daylight passes
// them so the rooms behind read as lived-in rather than shuttered.
const lightPassing = new Set(daylight.lightPassingMaterials ?? []);
const lightPassingNodes = (daylight.lightPassingNodePatterns ?? []).map(pattern => new RegExp(pattern, 'i'));
function isOccluder(primitive, node) {
  const material = primitive.getMaterial();
  if (!material) return true;
  if (material.getAlphaMode() === 'BLEND' || lightPassing.has(material.getName())) return false;
  if (node && lightPassingNodes.some(pattern => pattern.test(node.getName()))) return false;
  return !material.listExtensions().some(extension => extension.extensionName === 'KHR_materials_transmission');
}

function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Mean linear albedo per material: base colour factor times the average texture colour. */
let albedoCache = {};
try { albedoCache = JSON.parse(await readFile(ALBEDO_CACHE_PATH, 'utf8')); } catch { /* first run */ }
const materialAlbedo = new Map();
async function albedoFor(material) {
  if (!material) return [0.6, 0.6, 0.6];
  if (materialAlbedo.has(material)) return materialAlbedo.get(material);
  const factor = material.getBaseColorFactor();
  let texture = [1, 1, 1];
  const image = material.getBaseColorTexture()?.getImage();
  if (image) {
    const key = createHash('sha256').update(image).digest('hex');
    if (!albedoCache[key]) {
      const pixels = await sharp(Buffer.from(image)).resize(16, 16, { fit: 'fill' }).removeAlpha().raw().toBuffer();
      const sum = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 3) {
        sum[0] += srgbToLinear(pixels[i]);
        sum[1] += srgbToLinear(pixels[i + 1]);
        sum[2] += srgbToLinear(pixels[i + 2]);
      }
      albedoCache[key] = sum.map(value => value / (pixels.length / 3));
    }
    texture = albedoCache[key];
  }
  const albedo = [0, 1, 2].map(i => Math.min(0.95, factor[i] * texture[i]));
  materialAlbedo.set(material, albedo);
  return albedo;
}

let occluderVertexCount = 0;
for (const node of nodes) {
  const mesh = node.getMesh();
  if (!mesh || !isStatic(node)) continue;
  for (const primitive of mesh.listPrimitives()) {
    if (!isOccluder(primitive, node)) continue;
    occluderVertexCount += primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount();
  }
}
const triangleTotal = occluderVertexCount / 3;
console.log(`Collecting ${triangleTotal.toLocaleString()} static occluder triangles and material albedos…`);
const trianglePositions = new Float32Array(new SharedArrayBuffer(occluderVertexCount * 3 * 4));
const triangleAlbedo = new Float32Array(new SharedArrayBuffer(triangleTotal * 3 * 4));
// Each BVH triangle remembers its source primitive and corner vertices so the
// bounce pass can read the direct irradiance baked at those vertices.
const triangleCorners = new Uint32Array(new SharedArrayBuffer(triangleTotal * 3 * 4));
const triangleVertexBase = new Uint32Array(new SharedArrayBuffer(triangleTotal * 4));
const occluderRanges = [];
const point = new THREE.Vector3();
const positionElement = [];
let cursor = 0;
let triangleCursor = 0;
for (const node of nodes) {
  const mesh = node.getMesh();
  if (!mesh || !isStatic(node)) continue;
  const matrix = matrixFor(node);
  for (const primitive of mesh.listPrimitives()) {
    if (!isOccluder(primitive, node)) continue;
    const albedo = await albedoFor(primitive.getMaterial());
    const positions = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    const count = indices?.getCount() ?? positions.getCount();
    for (let i = 0; i < count; i++) {
      const vertex = indices ? indices.getScalar(i) : i;
      point.fromArray(positions.getElement(vertex, positionElement)).applyMatrix4(matrix);
      point.toArray(trianglePositions, cursor);
      triangleCorners[triangleCursor * 3 + i] = vertex;
      cursor += 3;
    }
    for (let t = 0; t < count / 3; t++) {
      triangleAlbedo.set(albedo, (triangleCursor + t) * 3);
    }
    occluderRanges.push({ node, primitive, firstTriangle: triangleCursor, count: count / 3 });
    triangleCursor += count / 3;
  }
}
await mkdir('node_modules/.cache', { recursive: true });
await writeFile(ALBEDO_CACHE_PATH, JSON.stringify(albedoCache));
console.log(`Geometry ready after ${elapsed()} (${materialAlbedo.size} materials)`);

/**
 * Meshes the runtime culls to their front faces never show a back side, so the
 * bake skips those samples. Moving cupboard fronts become double-sided again
 * when opened and keep both sides.
 */
async function frontOnlyPrimitives() {
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  const bytes = await readFile(SOURCE_PATH);
  const gltf = await new GLTFLoader().setMeshoptDecoder(ThreeMeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const gpuManifest = JSON.parse(await readFile('public/models/house-gpu-manifest.json', 'utf8'));
  const stats = await applyArchitectureBackfaces(gltf.scene, {
    enabled: true, assetPath: '/models/house.glb',
    verifiedAssets: { '/models/house.glb': gpuManifest.sourceSha256, '/models/house-gpu.glb': gpuManifest.outputSha256 },
  });
  if (!stats.manifestMatched) throw new Error(`Back-face manifest unavailable for the bake: ${stats.manifestReason}`);
  const keys = new Set();
  gltf.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.every(material => material.side === THREE.FrontSide)) return;
    const name = object.userData.name ?? object.name;
    if (movingNames.has(name) || / baked geometry$/.test(name)) return;
    const association = gltf.parser.associations.get(object);
    let ancestor = object;
    let nodeIndex;
    while (ancestor && nodeIndex === undefined) {
      nodeIndex = gltf.parser.associations.get(ancestor)?.nodes;
      ancestor = ancestor.parent;
    }
    if (nodeIndex === undefined || association?.meshes === undefined || typeof association.primitives !== 'number') return;
    keys.add(`${nodeIndex}:${association.meshes}:${association.primitives}`);
  });
  return keys;
}
const frontOnly = await frontOnlyPrimitives();
console.log(`${frontOnly.size.toLocaleString()} front-culled primitives skip back-side samples (${elapsed()})`);

const preparedFixtures = fixtures.map(fixture => ({
  ...fixture,
  positionVector: new THREE.Vector3().fromArray(fixture.position),
  directionVector: new THREE.Vector3().fromArray(fixture.direction).normalize(),
}));
const houseBox = { min: [-0.3, -0.6, -33.2], max: [22.5, 25.5, 2.1] };

function forEachLevelCount(level) {
  const divisions = 1 << level;
  return { triangles: 4 ** level, addedVertices: level ? (divisions + 1) * (divisions + 2) / 2 - 3 : 0 };
}

const triangle = new THREE.Triangle();
const triangleA = new THREE.Vector3();
const triangleB = new THREE.Vector3();
const triangleC = new THREE.Vector3();
const closestPoint = new THREE.Vector3();
const toLight = new THREE.Vector3();
function subdivisionCandidate(positions, indices, offset, matrix, eligible, architectural) {
  const ia = indices ? indices.getScalar(offset) : offset;
  const ib = indices ? indices.getScalar(offset + 1) : offset + 1;
  const ic = indices ? indices.getScalar(offset + 2) : offset + 2;
  triangleA.fromArray(positions.getElement(ia, positionElement)).applyMatrix4(matrix);
  triangleB.fromArray(positions.getElement(ib, positionElement)).applyMatrix4(matrix);
  triangleC.fromArray(positions.getElement(ic, positionElement)).applyMatrix4(matrix);
  const maxEdge = Math.max(
    triangleA.distanceTo(triangleB), triangleB.distanceTo(triangleC), triangleC.distanceTo(triangleA),
  );
  if (maxEdge <= SUBDIVISION_SPACING) return undefined;
  triangle.set(triangleA, triangleB, triangleC);
  const area = triangle.getArea();
  // Long, thin bevel and trim triangles gain little visible accuracy from
  // tessellation and were the main source of runaway refinement.
  if (area < 0.05 || area / (maxEdge * maxEdge) < 0.01) return undefined;
  if (!eligible) {
    // Non-static or garden surfaces only refine where a fixture reaches them.
    const influenced = preparedFixtures.some(fixture => {
      triangle.closestPointToPoint(fixture.positionVector, closestPoint);
      toLight.copy(closestPoint).sub(fixture.positionVector);
      const distance = toLight.length();
      if (distance <= 0.02) return true;
      if (fixture.type === 'spot') {
        return distance <= fixture.distance
          && fixture.directionVector.dot(toLight.multiplyScalar(1 / distance)) >= Math.cos(fixture.angle);
      }
      return distance <= fixture.width * 0.5 + 8 && fixture.directionVector.dot(toLight.multiplyScalar(1 / distance)) > 0;
    });
    if (!influenced) return undefined;
  }
  return {
    level: Math.min(architectural ? MAX_SUBDIVISION_LEVEL : 2, Math.max(1, Math.ceil(Math.log2(maxEdge / SUBDIVISION_SPACING)))),
    area,
    maxEdge,
    priority: architectural ? 1 : 0,
  };
}

const entries = [];
const plans = [];
const candidates = [];
console.log('Planning bounded subdivision…');
for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
  const node = nodes[nodeIndex];
  const mesh = node.getMesh();
  if (!mesh) continue;
  const meshIndex = meshIndices.get(mesh);
  const matrix = matrixFor(node);
  const primitives = mesh.listPrimitives();
  for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex++) {
    const primitive = primitives[primitiveIndex];
    const positions = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    const sourceIndexCount = indices?.getCount() ?? positions.getCount();
    const triangleCount = Math.floor(sourceIndexCount / 3);
    const levels = new Uint8Array(triangleCount);
    const eligible = isStatic(node) && isOccluder(primitive, node) && !node.getName().startsWith('Garden photo /');
    const architectural = eligible && /ceiling|plaster|wall|paint|floor/i.test(`${node.getName()} ${primitive.getMaterial()?.getName()}`);
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const candidate = subdivisionCandidate(positions, indices, triangleIndex * 3, matrix, eligible, architectural);
      if (candidate) candidates.push({ ...candidate, levels, triangleIndex });
    }
    const sourceVertexCount = positions.getCount();
    const entry = {
      node: nodeIndex, mesh: meshIndex, primitive: primitiveIndex,
      sourceVertexCount, sourceIndexCount, triangleCount,
      subdivisionByteOffset: 0, vertexCount: sourceVertexCount, byteOffset: 0,
    };
    entries.push(entry);
    plans.push({ primitive, matrix, levels, entry });
  }
}

const allocation = allocateLightingSubdivision(candidates, MAX_ADDED_TRIANGLES, ARCHITECTURAL_SPACING);

let byteOffset = 0;
let subdivisionByteOffset = 0;
let addedVertices = 0;
let sourceTriangles = 0;
let renderedTriangles = 0;
for (const { levels, entry } of plans) {
  let primitiveAddedVertices = 0;
  let primitiveRenderedTriangles = 0;
  for (const level of levels) {
    const counts = forEachLevelCount(level);
    primitiveRenderedTriangles += counts.triangles;
    primitiveAddedVertices += counts.addedVertices;
  }
  entry.subdivisionByteOffset = subdivisionByteOffset;
  entry.vertexCount = entry.sourceVertexCount + primitiveAddedVertices;
  entry.byteOffset = byteOffset;
  byteOffset += entry.vertexCount * CHANNELS;
  subdivisionByteOffset += entry.triangleCount;
  addedVertices += primitiveAddedVertices;
  sourceTriangles += entry.triangleCount;
  renderedTriangles += primitiveRenderedTriangles;
}
if (renderedTriangles - sourceTriangles > MAX_ADDED_TRIANGLES) {
  throw new Error('Subdivision planning exceeded its hard triangle budget');
}
const totalVertices = byteOffset / CHANNELS;
const topology = new Uint8Array(subdivisionByteOffset);
for (const plan of plans) topology.set(plan.levels, plan.entry.subdivisionByteOffset);
console.log(`Subdivision plan: +${addedVertices.toLocaleString()} vertices, +${(renderedTriangles - sourceTriangles).toLocaleString()} triangles (architectural spacing ${allocation.spacing.toFixed(2)}); ${totalVertices.toLocaleString()} samples`);
if (planOnly) process.exit(0);

// Direct pass results, shared with the workers for the bounce pass, then the
// final irradiance: [fixtureFront, fixtureBack, dayFront, dayBack] per vertex.
const vertexDirect = new Float32Array(new SharedArrayBuffer(totalVertices * CHANNELS * 4));
const directOnly = new Float32Array(totalVertices * CHANNELS);
const raw = new Float32Array(totalVertices * CHANNELS);
const vertexSamples = new Float32Array(totalVertices * 6);
const entryByPrimitive = new Map(plans.map(plan => [plan.primitive, plan.entry]));
for (const range of occluderRanges) {
  const entry = entryByPrimitive.get(range.primitive);
  if (!entry) throw new Error(`Occluder primitive of ${range.node.getName()} has no bake entry`);
  triangleVertexBase.fill(entry.byteOffset / CHANNELS, range.firstTriangle, range.firstTriangle + range.count);
}

function typedCopy(accessor) {
  const array = accessor.getArray();
  if (array instanceof Float32Array && !accessor.getNormalized()) return array.slice();
  const size = accessor.getElementSize();
  const out = new Float32Array(accessor.getCount() * size);
  const element = [];
  for (let i = 0; i < accessor.getCount(); i++) out.set(accessor.getElement(i, element), i * size);
  return out;
}

function primitiveTask(plan) {
  const { primitive, matrix, levels, entry } = plan;
  const indices = primitive.getIndices();
  return {
    key: `${entry.node}:${entry.mesh}:${entry.primitive}`,
    backSide: !frontOnly.has(`${entry.node}:${entry.mesh}:${entry.primitive}`),
    positions: typedCopy(primitive.getAttribute('POSITION')),
    normals: typedCopy(primitive.getAttribute('NORMAL')),
    indices: indices ? Uint32Array.from(indices.getArray()) : null,
    levels: levels.slice(),
    matrix: matrix.toArray(),
    vertexCount: entry.vertexCount,
    sourceVertexCount: entry.sourceVertexCount,
    triangleCount: entry.triangleCount,
  };
}

// Probe grid over the house for runtime objects that carry no bake of their own.
const volumeOrigin = houseBox.min;
const volumeDims = [0, 1, 2].map(axis => Math.ceil((houseBox.max[axis] - houseBox.min[axis]) / VOLUME_CELL));
const cellCount = volumeDims[0] * volumeDims[1] * volumeDims[2];
const probeCentres = new Float32Array(cellCount * 3);
for (let z = 0; z < volumeDims[2]; z++) {
  for (let y = 0; y < volumeDims[1]; y++) {
    for (let x = 0; x < volumeDims[0]; x++) {
      const cell = (z * volumeDims[1] + y) * volumeDims[0] + x;
      probeCentres[cell * 3] = volumeOrigin[0] + (x + 0.5) * VOLUME_CELL;
      probeCentres[cell * 3 + 1] = volumeOrigin[1] + (y + 0.5) * VOLUME_CELL;
      probeCentres[cell * 3 + 2] = volumeOrigin[2] + (z + 0.5) * VOLUME_CELL;
    }
  }
}
const probeRaw = new Float32Array(cellCount * 3);

console.log(`Starting ${workerCount} bake workers…`);
const workerData = {
  trianglePositions: trianglePositions.buffer, triangleAlbedo: triangleAlbedo.buffer,
  triangleVertexBase: triangleVertexBase.buffer, triangleCorners: triangleCorners.buffer, vertexDirect: vertexDirect.buffer,
  fixtures, emitters, daylight, houseBox, sampling: SAMPLING,
};
const entryByKey = new Map(plans.map(plan => [`${plan.entry.node}:${plan.entry.mesh}:${plan.entry.primitive}`, plan.entry]));
const byVertexCount = [...plans].sort((a, b) => b.entry.vertexCount - a.entry.vertexCount);
let queue = [...byVertexCount];
let phase = 'direct';
const PROBE_CHUNK = 256;
let nextProbe = 0;
let completedVertices = 0;
let completedProbes = 0;
let outstanding = 0;
let lastReport = performance.now();
const workerStats = [];

function nextPrimitiveBatch() {
  const tasks = [];
  let vertices = 0;
  while (queue.length && (vertices < 12_000 || tasks.length === 0) && tasks.length < 64) {
    const plan = queue.shift();
    tasks.push(primitiveTask(plan));
    vertices += plan.entry.vertexCount;
  }
  return tasks;
}

await new Promise((resolve, reject) => {
  let active = 0;
  const waiting = [];
  const workers = Array.from({ length: workerCount }, () => new Worker(new URL('./bake-worker.mjs', import.meta.url), { workerData }));
  const dispatch = worker => {
    if (phase === 'direct' || phase === 'bounce' || phase === 'bounce2') {
      const tasks = nextPrimitiveBatch();
      if (tasks.length) {
        outstanding += 1;
        const finalGather = phase === (BOUNCES > 1 ? 'bounce2' : 'bounce');
        worker.postMessage({ type: 'primitives', mode: phase, gain: finalGather ? daylight.bounce.gain : 1, tasks },
          tasks.flatMap(task => [task.positions.buffer, task.normals.buffer, task.levels.buffer, ...(task.indices ? [task.indices.buffer] : [])]));
        return;
      }
      if (outstanding > 0) {
        // The bounce pass must only start once every direct sample is written.
        waiting.push(worker);
        return;
      }
      if (phase === 'direct') {
        console.log(`Direct pass finished after ${elapsed()}; gathering bounce light…`);
        directOnly.set(vertexDirect);
        phase = 'bounce';
        queue = [...byVertexCount];
        completedVertices = 0;
      } else if (phase === 'bounce' && BOUNCES > 1) {
        console.log(`First bounce finished after ${elapsed()}; gathering the second bounce…`);
        // Workers now gather from direct plus first-bounce light.
        vertexDirect.set(raw);
        phase = 'bounce2';
        queue = [...byVertexCount];
        completedVertices = 0;
      } else {
        console.log(`Bounce passes finished after ${elapsed()}; sampling probe volume…`);
        phase = 'probes';
      }
      const resume = [worker, ...waiting.splice(0)];
      for (const idle of resume) dispatch(idle);
      return;
    }
    if (nextProbe < cellCount) {
      const start = nextProbe;
      nextProbe = Math.min(cellCount, nextProbe + PROBE_CHUNK);
      worker.postMessage({ type: 'probes', id: start, centres: probeCentres.slice(start * 3, nextProbe * 3) });
      return;
    }
    worker.postMessage({ type: 'stop' });
  };
  for (const worker of workers) {
    active += 1;
    worker.on('error', reject);
    worker.on('message', message => {
      if (message.type === 'ready') { dispatch(worker); return; }
      if (message.type === 'primitives') {
        outstanding -= 1;
        message.keys.forEach((key, i) => {
          const entry = entryByKey.get(key);
          const result = message.results[i];
          if (message.mode === 'direct') {
            vertexDirect.set(result, entry.byteOffset);
          } else {
            const offset = entry.byteOffset;
            for (let v = 0; v < result.length; v++) raw[offset + v] = directOnly[offset + v] + result[v];
            if (message.samples[i]) vertexSamples.set(message.samples[i], (offset / CHANNELS) * 6);
          }
          completedVertices += entry.vertexCount;
        });
      } else if (message.type === 'probes') {
        probeRaw.set(message.output, message.id * 3);
        completedProbes += message.output.length / 3;
      } else if (message.type === 'stopped') {
        workerStats.push(message.stats);
        active -= 1;
        if (active === 0) resolve();
        return;
      }
      if (performance.now() - lastReport > 5000) {
        lastReport = performance.now();
        console.log(`  ${phase}: ${(completedVertices / totalVertices * 100).toFixed(1)}% of samples, ${completedProbes}/${cellCount} probes, ${elapsed()}`);
      }
      dispatch(worker);
    });
  }
});
const rays = workerStats.reduce((sum, stats) => sum + stats.rays, 0);

// Smooth the daylight channels: sky visibility sampled with a few dozen rays is
// quantised indoors, and vertex interpolation would show it as blotches on
// large walls. Average each sample with its neighbours in a 3×3×3 cell block
// that share its orientation. Fixture pools keep their full detail.
{
  const SMOOTH_MARGIN = 8;
  const smoothMin = houseBox.min.map(v => v - SMOOTH_MARGIN);
  const smoothMax = houseBox.max.map(v => v + SMOOTH_MARGIN);
  const dims = [0, 1, 2].map(axis => Math.ceil((smoothMax[axis] - smoothMin[axis]) / SMOOTH_CELL) + 4);
  const bins = 125;
  const sums = new Float32Array(dims[0] * dims[1] * dims[2] * bins);
  const fixtureSums = new Float32Array(dims[0] * dims[1] * dims[2] * bins);
  const counts = new Uint32Array(dims[0] * dims[1] * dims[2] * bins);
  // Faint fixture light far from a lamp is as noisy as daylight; bright pools stay sharp.
  const FIXTURE_SMOOTH_BELOW = 0.3;
  const cellOf = (value, axis) => Math.floor((value - smoothMin[axis]) / SMOOTH_CELL) + 2;
  const binOf = (nx, ny, nz) => ((Math.round(nx * 2) + 2) * 5 + (Math.round(ny * 2) + 2)) * 5 + (Math.round(nz * 2) + 2);
  const slotOf = (cx, cy, cz, bin) => (((cz * dims[1]) + cy) * dims[0] + cx) * bins + bin;
  const inside = i => {
    const x = vertexSamples[i * 6], y = vertexSamples[i * 6 + 1], z = vertexSamples[i * 6 + 2];
    return x >= smoothMin[0] && x <= smoothMax[0] && y >= smoothMin[1] && y <= smoothMax[1]
      && z >= smoothMin[2] && z <= smoothMax[2];
  };
  for (let i = 0; i < totalVertices; i++) {
    if (!inside(i)) continue;
    const o = i * 6;
    const cx = cellOf(vertexSamples[o], 0), cy = cellOf(vertexSamples[o + 1], 1), cz = cellOf(vertexSamples[o + 2], 2);
    const front = slotOf(cx, cy, cz, binOf(vertexSamples[o + 3], vertexSamples[o + 4], vertexSamples[o + 5]));
    sums[front] += raw[i * 4 + 2]; fixtureSums[front] += raw[i * 4]; counts[front] += 1;
    if (raw[i * 4 + 3] > 0 || raw[i * 4 + 1] > 0) {
      const back = slotOf(cx, cy, cz, binOf(-vertexSamples[o + 3], -vertexSamples[o + 4], -vertexSamples[o + 5]));
      sums[back] += raw[i * 4 + 3]; fixtureSums[back] += raw[i * 4 + 1]; counts[back] += 1;
    }
  }
  const smoothed = new Float32Array(totalVertices * 4);
  // Gaussian-weighted gather over the surrounding 5×5×5 cells by distance to
  // each cell centre, so the result varies continuously with position instead
  // of stepping at cell boundaries.
  const SIGMA = 1.1;
  const gathered = [0, 0];
  const gather = (x, y, z, bin) => {
    const cx = cellOf(x, 0), cy = cellOf(y, 1), cz = cellOf(z, 2);
    let sum = 0, fixture = 0, weightTotal = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx, ny = cy + dy, nz = cz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= dims[0] || ny >= dims[1] || nz >= dims[2]) continue;
      const slot = slotOf(nx, ny, nz, bin);
      const count = counts[slot];
      if (!count) continue;
      const centreX = smoothMin[0] + (nx - 0.5) * SMOOTH_CELL;
      const centreY = smoothMin[1] + (ny - 0.5) * SMOOTH_CELL;
      const centreZ = smoothMin[2] + (nz - 0.5) * SMOOTH_CELL;
      const d2 = (x - centreX) ** 2 + (y - centreY) ** 2 + (z - centreZ) ** 2;
      const weight = Math.exp(-d2 / (2 * SIGMA * SIGMA)) * count;
      sum += sums[slot] / count * weight;
      fixture += fixtureSums[slot] / count * weight;
      weightTotal += weight;
    }
    gathered[0] = weightTotal ? sum / weightTotal : NaN;
    gathered[1] = weightTotal ? fixture / weightTotal : NaN;
    return gathered;
  };
  const blendFixture = (own, average) => {
    const weight = Math.max(0, 1 - own / FIXTURE_SMOOTH_BELOW);
    return own + (average - own) * weight;
  };
  let smoothedVertices = 0;
  for (let i = 0; i < totalVertices; i++) {
    smoothed.set(raw.subarray(i * 4, i * 4 + 4), i * 4);
    if (!inside(i)) continue;
    const o = i * 6;
    const x = vertexSamples[o], y = vertexSamples[o + 1], z = vertexSamples[o + 2];
    const front = gather(x, y, z, binOf(vertexSamples[o + 3], vertexSamples[o + 4], vertexSamples[o + 5]));
    if (!Number.isNaN(front[0])) {
      smoothed[i * 4 + 2] = front[0];
      smoothed[i * 4] = blendFixture(raw[i * 4], front[1]);
      smoothedVertices += 1;
    }
    if (raw[i * 4 + 3] > 0 || raw[i * 4 + 1] > 0) {
      const back = gather(x, y, z, binOf(-vertexSamples[o + 3], -vertexSamples[o + 4], -vertexSamples[o + 5]));
      if (!Number.isNaN(back[0])) {
        smoothed[i * 4 + 3] = back[0];
        smoothed[i * 4 + 1] = blendFixture(raw[i * 4 + 1], back[1]);
      }
    }
  }
  raw.set(smoothed);
  console.log(`Smoothed daylight on ${smoothedVertices.toLocaleString()} samples around the house`);
}
console.log(`Sampling finished after ${elapsed()}: ${rays.toLocaleString()} rays, ${workerStats.reduce((sum, stats) => sum + stats.triangleEvaluations, 0).toLocaleString()} bounce surfaces`);

/** Upper percentile of a channel, so a few hot spots do not crush the encoding range. */
function percentile(values, stride, offset, fraction) {
  const sample = [];
  const step = Math.max(1, Math.floor(values.length / stride / 200_000));
  for (let i = offset; i < values.length; i += stride * step) if (values[i] > 0) sample.push(values[i]);
  if (!sample.length) return 1;
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(sample.length * fraction))];
}
const maxFixture = Math.max(0.5, Math.max(percentile(raw, CHANNELS, 0, 0.999), percentile(raw, CHANNELS, 1, 0.999)));
const maxDaylight = Math.max(0.5, Math.max(percentile(raw, CHANNELS, 2, 0.999), percentile(raw, CHANNELS, 3, 0.999)));
console.log(`Encoding range: fixture ≤ ${maxFixture.toFixed(3)}, daylight ≤ ${maxDaylight.toFixed(3)}`);
const baked = new Uint8Array(totalVertices * CHANNELS);
for (let i = 0; i < totalVertices; i++) {
  const offset = i * CHANNELS;
  baked[offset] = encodeIrradiance(raw[offset], maxFixture);
  baked[offset + 1] = encodeIrradiance(raw[offset + 1], maxFixture);
  baked[offset + 2] = encodeIrradiance(raw[offset + 2], maxDaylight);
  baked[offset + 3] = encodeIrradiance(raw[offset + 3], maxDaylight);
}

// Cells inside solid geometry take the average of their open neighbours so a
// door leaf in its frame reads the room's light rather than the wall's interior.
const enclosed = new Uint8Array(cellCount);
for (let cell = 0; cell < cellCount; cell++) enclosed[cell] = probeRaw[cell * 3 + 2] ? 1 : 0;
const cellIndex = (x, y, z) => (z * volumeDims[1] + y) * volumeDims[0] + x;
for (let pass = 0; pass < 3; pass++) {
  const filled = new Uint8Array(enclosed);
  for (let z = 0; z < volumeDims[2]; z++) for (let y = 0; y < volumeDims[1]; y++) for (let x = 0; x < volumeDims[0]; x++) {
    const cell = cellIndex(x, y, z);
    if (!enclosed[cell]) continue;
    let fixture = 0, day = 0, count = 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= volumeDims[0] || ny >= volumeDims[1] || nz >= volumeDims[2]) continue;
      const neighbour = cellIndex(nx, ny, nz);
      if (enclosed[neighbour]) continue;
      fixture += probeRaw[neighbour * 3];
      day += probeRaw[neighbour * 3 + 1];
      count += 1;
    }
    if (!count) continue;
    probeRaw[cell * 3] = fixture / count;
    probeRaw[cell * 3 + 1] = day / count;
    filled[cell] = 0;
  }
  enclosed.set(filled);
}
const volume = new Uint8Array(cellCount * 2);
for (let cell = 0; cell < cellCount; cell++) {
  volume[cell * 2] = encodeIrradiance(probeRaw[cell * 3], maxFixture);
  volume[cell * 2 + 1] = encodeIrradiance(probeRaw[cell * 3 + 1], maxDaylight);
}

const [sourceHash, gpuHash, fixtureHash] = await Promise.all([
  sha256(SOURCE_PATH), sha256(GPU_PATH), sha256(FIXTURES_PATH),
]);
const manifest = {
  version: VERSION,
  inputs: Object.fromEntries(await Promise.all(BAKE_INPUTS.map(async path => [path, await sha256(path)]))),
  sampling: { ...SAMPLING, bounces: BOUNCES, workers: workerCount, rays, seconds: Number(((performance.now() - startedAt) / 1000).toFixed(1)) },
  daylight,
  sourceFiles: {
    '/models/house.glb': sourceHash,
    '/models/house-gpu.glb': gpuHash,
  },
  fixturesSha256: fixtureHash,
  emitterCount: emitters.length,
  data: 'house-baked-lighting.bin',
  byteLength: baked.byteLength,
  dataSha256: createHash('sha256').update(baked).digest('hex'),
  subdivision: {
    data: 'house-baked-lighting-topology.bin',
    byteLength: topology.byteLength,
    sha256: createHash('sha256').update(topology).digest('hex'),
    targetSpacing: SUBDIVISION_SPACING,
    architecturalSpacing: allocation.spacing,
    maxLevel: MAX_SUBDIVISION_LEVEL,
    sourceTriangles,
    renderedTriangles,
    addedVertices,
  },
  volume: {
    data: 'house-irradiance-volume.bin',
    byteLength: volume.byteLength,
    sha256: createHash('sha256').update(volume).digest('hex'),
    dims: volumeDims,
    origin: volumeOrigin,
    cellSize: VOLUME_CELL,
  },
  channels: CHANNELS,
  maxFixture,
  maxDaylight,
  color: fixtureColor,
  skyColor: daylight.sky.color,
  entries,
};
await Promise.all([
  writeFile(DATA_PATH, baked),
  writeFile(TOPOLOGY_PATH, topology),
  writeFile(VOLUME_PATH, volume),
  writeFile(MANIFEST_PATH, `${JSON.stringify(manifest)}\n`),
]);
console.log(`Wrote ${entries.length.toLocaleString()} primitive bakes (${(baked.byteLength / 1e6).toFixed(1)} MB) and a ${volumeDims.join('×')} irradiance volume in ${elapsed()}`);
await verify();
