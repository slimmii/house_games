/** Patch the already-packaged GLB to match export-house.py's landing repair. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const path = new URL('../public/models/house.glb', import.meta.url).pathname;
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(path);
let changed = 0;
for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const matrix = node.getWorldMatrix();
  for (const primitive of mesh.listPrimitives()) {
    if (primitive.getMaterial()?.getName() !== 'Warm white plaster') continue;
    if (Math.abs(matrix[1]) > 1e-8 || Math.abs(matrix[4]) > 1e-8 || Math.abs(matrix[6]) > 1e-8 || Math.abs(matrix[9]) > 1e-8)
      continue;
    const position = primitive.getAttribute('POSITION');
    const values = position?.getArray();
    if (!position || !values) continue;
    for (let i = 0; i < position.getCount(); i++) {
      const localX = values[i * 3];
      const localY = values[i * 3 + 1];
      const localZ = values[i * 3 + 2];
      const x = matrix[0] * localX + matrix[12];
      const y = matrix[5] * localY + matrix[13];
      const z = matrix[10] * localZ + matrix[14];
      if (Math.abs(y - 15.93) <= 0.0031 && x >= 0.98 && x <= 8.93 && z >= -15.92 && z <= -14.33) {
        values[i * 3 + 1] = localY + (15.894 - y) / matrix[5];
        changed++;
      }
    }
    position.setArray(values);
  }
}
if (changed < 20) throw new Error(`Expected upper landing cap vertices, changed only ${changed}`);
await io.write(path, document);
console.log(`Lowered ${changed} packaged Warm white plaster vertices beneath the upper floor finish.`);
