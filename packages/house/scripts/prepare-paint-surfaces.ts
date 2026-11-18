import { prepareLaundry } from '../src/client/laundry';
/** Export exactly the static rendered surfaces, including runtime cabinet interiors. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prepareClosets } from '../src/client/closets';
import { decodePaintSurfaces, PAINT_SURFACES_MAGIC } from '../src/shared/paint-surfaces';
import detailPatterns from './door-details.json';

const root = new URL('../', import.meta.url);
const inputs = ['public/models/house.glb', 'src/shared/closets-manifest.json', 'src/shared/doors-manifest.json',
  'scripts/door-details.json', 'src/client/laundry.ts', 'src/shared/laundry.ts', 'src/shared/laundry-source-names.json', 'src/client/closets.ts', 'src/client/fridge.ts', 'src/shared/closet-interiors.ts', 'scripts/prepare-paint-surfaces.ts'];
const digest = createHash('sha256');
for (const path of inputs) digest.update(await readFile(new URL(path, root)));
const sourceSha256 = digest.digest('hex');
const output = new URL('public/models/paint-surfaces.meshopt.bin', root);
const manifestPath = new URL('public/models/paint-surfaces.json', root);
if (process.argv.includes('--verify')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const assetSha256 = createHash('sha256').update(await readFile(output)).digest('hex');
  if (manifest.sourceSha256 !== sourceSha256 || manifest.assetSha256 !== assetSha256) throw new Error('Paint surfaces are stale. Run npm run prepare:paint.');
  console.log('Paint surface geometry is current.');
} else {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(new URL(inputs[0], root).pathname);
  const scene = new THREE.Group();
  const movingPatterns = detailPatterns.map(pattern => new RegExp(pattern, 'i'));
  const materials = new Map<object, THREE.MeshStandardMaterial>();
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || movingPatterns.some(pattern => pattern.test(node.getName()))) continue;
    const group = new THREE.Group();
    group.name = node.getName();
    group.userData = { ...node.getExtras(), name: node.getName() };
    group.matrix.fromArray(node.getWorldMatrix());
    group.matrix.decompose(group.position, group.quaternion, group.scale);
    for (const primitive of mesh.listPrimitives()) {
      const attribute = primitive.getAttribute('POSITION');
      if (!attribute || primitive.getMode() !== 4) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(attribute.getArray()!), 3));
      const indices = primitive.getIndices();
      if (indices) geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices.getArray()!), 1));
      const sourceMaterial = primitive.getMaterial();
      let material = sourceMaterial ? materials.get(sourceMaterial) : undefined;
      if (!material) {
        material = new THREE.MeshStandardMaterial();
        material.name = sourceMaterial?.getName() ?? '';
        if (sourceMaterial) materials.set(sourceMaterial, material);
      }
      const object = new THREE.Mesh(geometry, material);
      object.name = mesh.getName();
      group.add(object);
    }
    scene.add(group);
  }
  scene.updateMatrixWorld(true);
  const laundry = prepareLaundry(scene);
  for (const child of [...laundry.children]) if (/:door$|:rotor$/.test(child.name)) child.removeFromParent();
  scene.add(laundry);
  const closets = prepareClosets(scene);
  // Moving panels and trays continue to use their articulated hit/attachment system.
  for (const child of [...closets.children]) if (child.name.startsWith('closet-pivot:')) child.removeFromParent();
  scene.add(closets);
  scene.updateMatrixWorld(true);
  const vertices: number[] = [], indices: number[] = [];
  const lookup = new Map<string, number>();
  const point = new THREE.Vector3();
  let meshes = 0;
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    const position = object.geometry.getAttribute('position');
    const index = object.geometry.index;
    const count = index?.count ?? position.count;
    for (let i = 0; i < count; i++) {
      point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(object.matrixWorld);
      const xyz = point.toArray().map(value => Math.round(value * 1e6) / 1e6);
      const key = xyz.join(',');
      let id = lookup.get(key);
      if (id === undefined) { id = vertices.length / 3; lookup.set(key, id); vertices.push(...xyz); }
      indices.push(id);
    }
  });
  const bytes = new ArrayBuffer(8 + vertices.length * 4 + indices.length * 4);
  new Uint32Array(bytes, 0, 2).set([vertices.length / 3, indices.length]);
  new Float32Array(bytes, 8, vertices.length).set(vertices);
  new Uint32Array(bytes, 8 + vertices.length * 4, indices.length).set(indices);
  await MeshoptEncoder.ready;
  const vertexStream = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(bytes, 8, vertices.length * 4), vertices.length / 3, 12);
  const indexStream = MeshoptEncoder.encodeIndexSequence(new Uint8Array(bytes, 8 + vertices.length * 4), indices.length, 4);
  const encoded = new Uint8Array(20 + vertexStream.length + indexStream.length);
  new Uint32Array(encoded.buffer, 0, 5).set([PAINT_SURFACES_MAGIC, vertices.length / 3, indices.length, vertexStream.length, indexStream.length]);
  encoded.set(vertexStream, 20);
  encoded.set(indexStream, 20 + vertexStream.length);
  if (!Buffer.from(await decodePaintSurfaces(encoded.buffer)).equals(Buffer.from(bytes))) throw new Error('Paint surface encoding is not lossless');
  await writeFile(output, encoded);
  await writeFile(manifestPath, JSON.stringify({ sourceSha256, assetSha256: createHash('sha256').update(encoded).digest('hex'),
    meshes, vertices: vertices.length / 3, triangles: indices.length / 3, bytes: encoded.length }, null, 2) + '\n');
  console.log(`${meshes} paintable meshes, ${indices.length / 3} triangles, ${(encoded.length / 1048576).toFixed(1)} MiB meshopt-encoded.`);
}
