/** Extract actual fixed glazing triangles; never fill an entire window opening. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const asset = new URL('../public/models/house.glb', import.meta.url);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;
const document = await io.read(asset.pathname);
const patterns = [
  /^\d+ front \d+ glass/,
  /^Bedroom [12] \/ window (glazing|glass pane)/,
  /^Entrance photo \/ full height sidelight clear substrate/,
  /^Kitchen veranda window glass/,
  /^Rear photo \/ (ground terrace two panel sliding glazing|kitchen single white casement|laundry horizontal black window) glass/,
  /^Stair dome \/ transparent shallow domed glazing/,
  /^Veranda glazed roof/,
];
const positions: number[] = [];
const panes: { name: string; firstTriangle: number; triangleCount: number }[] = [];
const point = new Vector3();
for (const node of document.getRoot().listNodes()) {
  if (!patterns.some(pattern => pattern.test(node.getName()))) continue;
  const mesh = node.getMesh();
  if (!mesh) continue;
  const firstTriangle = positions.length / 9;
  const matrix = new Matrix4().fromArray(node.getWorldMatrix());
  for (const primitive of mesh.listPrimitives()) {
    if (primitive.getMode() !== 4) throw new Error(`Non-triangle glazing: ${node.getName()}`);
    const attribute = primitive.getAttribute('POSITION');
    if (!attribute) continue;
    const indices = primitive.getIndices();
    const count = indices?.getCount() ?? attribute.getCount();
    const vertex: number[] = [];
    for (let i = 0; i < count; i++) {
      attribute.getElement(indices ? indices.getScalar(i) : i, vertex);
      point.fromArray(vertex).applyMatrix4(matrix);
      positions.push(...point.toArray().map(value => Math.round(value * 1e6) / 1e6));
    }
  }
  panes.push({ name: node.getName(), firstTriangle, triangleCount: positions.length / 9 - firstTriangle });
}
if (panes.length < 15) throw new Error('Missing expected architectural glazing');
const sourceSha256 = createHash('sha256').update(await readFile(asset)).digest('hex');
await writeFile(new URL('../src/shared/window-collision.json', import.meta.url), JSON.stringify({ sourceSha256, panes, positions }) + '\n');
console.log(`Prepared ${panes.length} fixed panes, ${positions.length / 9} triangles. Moving doors retain their own collision.`);
