/** Guard the repaired floor surfaces against overlapping export regressions. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(process.argv[2] ?? 'public/models/house.glb');
const oak = 'Reference floor / warm greige oak wide staggered planks';
const oldOak = 'Light timber living-room floor / game color bake';
const floorNames = new Set([
  '1 / floor finish', 'Kitchen floor finish - continuous with living',
  'Reference spiral / 0 landing timber finish',
]);
const capNames = new Set(Array.from({ length: 48 }, (_, index) =>
  `ground / source masonry ${String(index + 36).padStart(3, '0')} / material part`));
const foundFloors = new Set();
const foundCaps = new Set();
let staleFloorTriangles = 0;
let preservedUpperFloorTriangles = 0;
let uvError = 0;

function worldPosition(matrix, position, index) {
  const [x, y, z] = position.getElement(index, []);
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

for (const node of document.getRoot().listNodes()) {
  const matrix = node.getWorldMatrix();
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const material = primitive.getMaterial();
    const positions = primitive.getAttribute('POSITION');
    if (!material || !positions) continue;
    if (material.getName() === oldOak) {
      const indices = primitive.getIndices()?.getArray();
      assert.ok(indices, 'Original floor must retain indexed geometry');
      for (let i = 0; i < indices.length; i += 3) {
        const heights = [0, 1, 2].map(offset => worldPosition(matrix, positions, indices[i + offset])[1]);
        // Includes kitchen top Y=7.254, not just the main floor at Y=7.230.
        if (heights.every(y => y > 7.17 && y < 7.26)) staleFloorTriangles++;
        if (heights.every(y => y > 15.8 && y < 16)) preservedUpperFloorTriangles++;
      }
    }
    if (floorNames.has(node.getName()) && material.getName() === oak) {
      foundFloors.add(node.getName());
      const uv = primitive.getAttribute(`TEXCOORD_${material.getBaseColorTextureInfo().getTexCoord()}`);
      assert.ok(uv, `Missing oak coordinates on ${node.getName()}`);
      for (let i = 0; i < positions.getCount(); i++) {
        const [x, , z] = worldPosition(matrix, positions, i);
        const [u, v] = uv.getElement(i, []);
        // Blender exports V flipped into glTF's texture convention.
        uvError = Math.max(uvError, Math.abs(u - (x / 3 - .3) / 2.24),
          Math.abs(v - (1 - (-z / 3 - .3) / 2)));
      }
    }
    if (capNames.has(node.getName()) && material.getName() === 'Warm white plaster') {
      foundCaps.add(node.getName());
      let maximum = -Infinity;
      for (let i = 0; i < positions.getCount(); i++) maximum = Math.max(maximum, worldPosition(matrix, positions, i)[1]);
      assert.ok(Math.abs(maximum - 7.194) < .00002, `Cap still intersects oak: ${node.getName()} at ${maximum}`);
    }
  }
}
assert.equal(staleFloorTriangles, 0, 'Old first-floor geometry competes with the replacement oak');
assert.ok(preservedUpperFloorTriangles > 0, 'The untouched upper floor must remain');
assert.equal(foundFloors.size, 3, 'All three replacement floor surfaces must remain');
assert.equal(foundCaps.size, 48, 'All repaired stair-wall meshes must remain');
assert.ok(uvError < .000002, `Oak mapping is discontinuous: ${uvError}`);

if (process.argv[3]) {
  const baseline = await io.read(process.argv[3]);
  const textureHashes = doc => doc.getRoot().listTextures().map(texture =>
    createHash('sha256').update(texture.getImage()).digest('hex')).sort();
  const materialFactors = doc => doc.getRoot().listMaterials().map(material => JSON.stringify({
    name: material.getName(), color: material.getBaseColorFactor(),
    roughness: material.getRoughnessFactor(), metallic: material.getMetallicFactor(),
    emissive: material.getEmissiveFactor(), alpha: material.getAlphaMode(),
    cutoff: material.getAlphaCutoff(), doubleSided: material.getDoubleSided(),
  })).sort();
  assert.deepEqual(textureHashes(document), textureHashes(baseline), 'A texture changed during geometry repair');
  assert.deepEqual(materialFactors(document), materialFactors(baseline), 'A material changed during geometry repair');
}
console.log(JSON.stringify({ staleFloorTriangles, preservedUpperFloorTriangles,
  oakSurfaces: foundFloors.size, repairedCaps: foundCaps.size, maximumUvError: uvError }));
