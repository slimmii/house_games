/**
 * Store house positions as normalized int16 and normals as normalized int8
 * (gltfpack's default precision) for download size.
 * Unlike gltf-transform's quantize(), node transforms stay untouched: each
 * primitive carries `extras.dequantize` and src/client/houseQuantization.ts
 * restores float32 geometry before anything else sees the scene.
 */
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const MAX = 32767;

async function createIO() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

function positionVolume(array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < array.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], array[i + c]);
      max[c] = Math.max(max[c], array[i + c]);
    }
  }
  const offset = min.map((value, c) => (value + max[c]) / 2);
  // Never zero, so flat or single-vertex meshes still decode.
  const scale = Math.max(...max.map((value, c) => (value - min[c]) / 2), 1e-6);
  return [...offset, scale];
}

const NORMAL_MAX = 127;
const quantizeUnit = (value, max = MAX) => Math.round(Math.max(-1, Math.min(1, value)) * max);

/** Returns the quantized GLB and the largest position error in model units. */
export async function quantizeHouseGeometry(bytes) {
  const io = await createIO();
  const document = await io.readBinary(bytes);
  const positions = new Map();
  const normals = new Set();
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      assert.equal(primitive.listTargets().length, 0, 'Morph targets are not supported');
      const position = primitive.getAttribute('POSITION');
      const normal = primitive.getAttribute('NORMAL');
      assert.ok(position && position.getArray() instanceof Float32Array, `${mesh.getName()} has no float positions`);
      if (!positions.has(position)) positions.set(position, positionVolume(position.getArray()));
      // Restoring float32 on the client needs both values from the same primitive.
      primitive.setExtras({ ...primitive.getExtras(), dequantize: { position: positions.get(position) } });
      if (normal) {
        assert.ok(normal.getArray() instanceof Float32Array, `${mesh.getName()} has non-float normals`);
        normals.add(normal);
      }
    }
  }
  for (const [accessor, [x, y, z, scale]] of positions) {
    const source = accessor.getArray();
    const offset = [x, y, z];
    const target = new Int16Array(source.length);
    for (let i = 0; i < source.length; i++) target[i] = quantizeUnit((source[i] - offset[i % 3]) / scale);
    accessor.setArray(target).setNormalized(true);
  }
  for (const accessor of normals) {
    const source = accessor.getArray();
    const target = new Int8Array(source.length);
    for (let i = 0; i < source.length; i++) target[i] = quantizeUnit(source[i], NORMAL_MAX);
    accessor.setArray(target).setNormalized(true);
  }
  document.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const output = Buffer.from(await io.writeBinary(document));
  const maxError = await verifyQuantizedHouse(bytes, output, io);
  return { output, maxError, positionAccessors: positions.size, normalAccessors: normals.size };
}

/** Prove the scene is unchanged apart from position/normal precision. */
async function verifyQuantizedHouse(before, after, io) {
  const [a, b] = await Promise.all([io.readBinary(before), io.readBinary(after)]);
  const ra = a.getRoot();
  const rb = b.getRoot();
  for (const list of ['listNodes', 'listMeshes', 'listMaterials', 'listTextures', 'listScenes']) {
    assert.equal(ra[list]().length, rb[list]().length, `${list} count changed`);
  }
  ra.listNodes().forEach((node, index) => {
    const other = rb.listNodes()[index];
    assert.equal(other.getName(), node.getName());
    assert.deepEqual(other.getMatrix(), node.getMatrix(), `${node.getName()} transform changed`);
    assert.equal(ra.listMeshes().indexOf(node.getMesh()), rb.listMeshes().indexOf(other.getMesh()));
    assert.deepEqual(other.listChildren().map(child => rb.listNodes().indexOf(child)),
      node.listChildren().map(child => ra.listNodes().indexOf(child)));
  });
  ra.listMaterials().forEach((material, index) => {
    const other = rb.listMaterials()[index];
    assert.ok(material.equals(other), `${material.getName()} material changed`);
  });
  ra.listTextures().forEach((texture, index) => {
    assert.ok(Buffer.from(rb.listTextures()[index].getImage()).equals(Buffer.from(texture.getImage())), `${texture.getName()} image changed`);
  });
  let maxError = 0;
  ra.listMeshes().forEach((mesh, meshIndex) => {
    const other = rb.listMeshes()[meshIndex];
    assert.equal(other.getName(), mesh.getName());
    assert.equal(other.listPrimitives().length, mesh.listPrimitives().length);
    mesh.listPrimitives().forEach((primitive, primitiveIndex) => {
      const next = other.listPrimitives()[primitiveIndex];
      assert.equal(ra.listMaterials().indexOf(primitive.getMaterial()), rb.listMaterials().indexOf(next.getMaterial()));
      assert.equal(next.getMode(), primitive.getMode());
      assert.deepEqual(next.listSemantics(), primitive.listSemantics());
      assert.deepEqual(next.getIndices()?.getArray(), primitive.getIndices()?.getArray(), `${mesh.getName()} indices changed`);
      const [x, y, z, scale] = next.getExtras().dequantize.position;
      const offset = [x, y, z];
      for (const semantic of primitive.listSemantics()) {
        const source = primitive.getAttribute(semantic).getArray();
        const quantized = next.getAttribute(semantic).getArray();
        assert.equal(quantized.length, source.length, `${mesh.getName()} ${semantic} length changed`);
        if (semantic === 'POSITION') {
          for (let i = 0; i < source.length; i++) {
            maxError = Math.max(maxError, Math.abs(Math.max(quantized[i] / MAX, -1) * scale + offset[i % 3] - source[i]));
          }
        } else if (semantic === 'NORMAL') {
          for (let i = 0; i < source.length; i++) {
            assert.ok(Math.abs(Math.max(quantized[i] / NORMAL_MAX, -1) - source[i]) <= 0.5 / NORMAL_MAX + 1e-6, `${mesh.getName()} normal error`);
          }
        } else assert.deepEqual(quantized, source, `${mesh.getName()} ${semantic} changed`);
      }
    });
  });
  return maxError;
}
