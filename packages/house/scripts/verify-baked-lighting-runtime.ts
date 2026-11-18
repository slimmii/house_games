import { readFile } from 'node:fs/promises';
import { Mesh, Raycaster, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applyBakedFixtureLighting } from '../src/client/bakedLighting';

// CPU-only integration smoke: decode the actual source GLB, retain the real
// GLTFLoader associations, and serve companion files through an in-memory fetch.
Object.defineProperty(globalThis, 'location', {
  value: { origin: 'http://bake.test', search: '' }, configurable: true,
});
Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true });
const fileByPath: Record<string, string> = {
  '/models/house-baked-lighting.json': 'public/models/house-baked-lighting.json',
  '/models/house-baked-lighting.bin': 'public/models/house-baked-lighting.bin',
  '/models/house-baked-lighting-topology.bin': 'public/models/house-baked-lighting-topology.bin',
  '/models/house-irradiance-volume.bin': 'public/models/house-irradiance-volume.bin',
  '/models/house-gpu-manifest.json': 'public/models/house-gpu-manifest.json',
};
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.origin);
  const path = fileByPath[url.pathname];
  return path ? new Response(await readFile(path), { status: 200 }) : new Response(null, { status: 404 });
}) as typeof fetch;
Object.defineProperty(globalThis, 'createImageBitmap', {
  value: async () => ({ width: 1, height: 1, close() {} }), configurable: true,
});

const bytes = await readFile('public/models/house.glb');
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.parseAsync(buffer, '/models/');
const status = await applyBakedFixtureLighting(gltf.scene, gltf.parser, '/models/house.glb');
if (!status.applied) throw new Error(`Runtime bake rejected: ${status.reason}`);
let attributedMeshes = 0;
let shadedVertices = 0;
gltf.scene.traverse(object => {
  if (!(object instanceof Mesh)) return;
  const attribute = object.geometry.getAttribute('bakedFixtureLight');
  if (!attribute) return;
  attributedMeshes += 1;
  if (attribute.itemSize !== 4) throw new Error('Daylight channels are missing from the baked geometry');
  for (let vertex = 0; vertex < attribute.count; vertex++) {
    const front = attribute.getZ(vertex), back = attribute.getW(vertex);
    if (!(front >= 0 && front <= 1 && back >= 0 && back <= 1)) throw new Error('Invalid daylight irradiance');
    if (front > 0.02 || back > 0.02) shadedVertices++;
  }
});
if (attributedMeshes !== status.meshes) {
  throw new Error(`Only ${attributedMeshes} of ${status.meshes} meshes received baked lighting`);
}
if (!shadedVertices) throw new Error('The daylight bake did not light any vertices');
if (!status.volume || status.volume.data.byteLength !== status.volume.dims[0] * status.volume.dims[1] * status.volume.dims[2] * 2) {
  throw new Error('Irradiance volume is missing or has the wrong size');
}
// Regression: the living-room partition joins broad panels to narrow wall end
// faces. Previously only the broad panels had interior AO samples, producing
// dark vertical stripes across this otherwise continuous, coplanar wall.
gltf.scene.updateMatrixWorld(true);
const raycaster = new Raycaster();
const middleVisibility = [-15.7, -16.1, -18.9, -19.4, -19.8].map(z => {
  raycaster.set(new Vector3(15, 13.3, z), new Vector3(-1, 0, 0));
  const hit = raycaster.intersectObject(gltf.scene, true).find(hit => hit.object instanceof Mesh);
  if (!hit?.face || !(hit.object instanceof Mesh) || Math.abs(hit.point.x - 8.912) > .02) {
    throw new Error(`Living-room wall regression probe missed the partition at z=${z}`);
  }
  const geometry = hit.object.geometry;
  const positions = geometry.getAttribute('position');
  const ambient = geometry.getAttribute('bakedFixtureLight');
  const vertices = [hit.face.a, hit.face.b, hit.face.c];
  const weights = Triangle.getBarycoord(hit.object.worldToLocal(hit.point.clone()),
    new Vector3().fromBufferAttribute(positions, vertices[0]),
    new Vector3().fromBufferAttribute(positions, vertices[1]),
    new Vector3().fromBufferAttribute(positions, vertices[2]), new Vector3());
  if (!weights || !ambient) throw new Error('Wall is missing its baked daylight samples');
  const visibility = vertices.reduce((sum, vertex, i) => sum + ambient.getZ(vertex) * weights.getComponent(i), 0);
  const fixtureShare = vertices.reduce((sum, vertex, i) => sum + ambient.getX(vertex) * weights.getComponent(i), 0);
  console.log(`  wall z=${z}: daylight ${visibility.toFixed(3)} fixture ${fixtureShare.toFixed(3)}`);
  if (!(visibility > 0.05)) throw new Error(`Living-room wall receives no daylight at z=${z}: ${visibility}`);
  return visibility;
});
console.log(`Living-room wall probe: ${middleVisibility.map(value => value.toFixed(3)).join(', ')}`);
if (Math.max(...middleVisibility) - Math.min(...middleVisibility) > .08) {
  throw new Error('Adjacent living-room wall sections have inconsistent daylight shading');
}
console.log(`Runtime bake applied: ${status.meshes} meshes, ${status.vertices.toLocaleString()} vertices, ${(status.bytes / 1e6).toFixed(1)} MB`);
console.log(`Daylight reaches ${shadedVertices.toLocaleString()} vertices; volume ${status.volume.dims.join('×')}`);
console.log(`Living-room wall continuity: ${middleVisibility.map(value => value.toFixed(3)).join(', ')}`);
