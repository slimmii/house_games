/** Patch the packaged GLB to match export-house.py's first-landing repair. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { resolve } from 'node:path';

const path = process.argv[2]
  ? resolve(process.argv[2])
  : new URL('../public/models/house.glb', import.meta.url).pathname;
const targetNames = new Set(Array.from({ length: 48 }, (_, index) =>
  `ground / source masonry ${String(index + 36).padStart(3, '0')} / material part`));
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(path);
let changed = 0;
const repaired = [];
for (const node of document.getRoot().listNodes()) {
  if (!targetNames.has(node.getName())) continue;
  const matrix = node.getWorldMatrix();
  if (Math.abs(matrix[1]) > 1e-8 || Math.abs(matrix[4]) > 1e-8
    || Math.abs(matrix[6]) > 1e-8 || Math.abs(matrix[9]) > 1e-8 || Math.abs(matrix[5]) < 1e-8)
    throw new Error(`Unexpected transform on first-landing cap node: ${node.getName()}`);
  let nodeChanged = 0;
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    if (primitive.getMaterial()?.getName() !== 'Warm white plaster') continue;
    const position = primitive.getAttribute('POSITION');
    const values = position?.getArray();
    if (!position || !values) continue;
    for (let i = 0; i < position.getCount(); i++) {
      const localY = values[i * 3 + 1];
      const y = matrix[1] * values[i * 3] + matrix[5] * localY
        + matrix[9] * values[i * 3 + 2] + matrix[13];
      if (Math.abs(y - 7.23) > 0.0031) continue;
      values[i * 3 + 1] = localY + (7.194 - y) / matrix[5];
      nodeChanged++;
    }
    position.setArray(values);
  }
  if (nodeChanged) repaired.push(node.getName());
  changed += nodeChanged;
}
if (!repaired.includes('ground / source masonry 036 / material part') || changed < 20)
  throw new Error(`Expected first-landing cap vertices, changed ${changed} across ${repaired.length} nodes`);
await io.write(path, document);
console.log(`Lowered ${changed} packaged vertices across ${repaired.length} first-landing plaster meshes.`);
