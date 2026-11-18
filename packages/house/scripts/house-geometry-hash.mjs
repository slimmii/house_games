/**
 * SHA-256 over a GLB's scene graph and decoded mesh data only: node names,
 * transforms and hierarchy, primitive modes, material slots, indices and vertex
 * attributes (with their quantization extras). Texture pixels and the binary
 * layout are ignored, so re-encoding images keeps geometry-derived data (the
 * visibility bake) valid.
 */
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

export async function houseGeometrySha256(bytes) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const root = (await io.readBinary(bytes)).getRoot();
  const hash = createHash('sha256');
  const nodes = root.listNodes();
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const add = value => hash.update(`${JSON.stringify(value)}|`);
  const addArray = array => hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  // Batching separates transparent and transmissive materials, so those count too.
  add(materials.map(material => [material.getName(), material.getAlphaMode(), material.getDoubleSided(),
    material.getExtension('KHR_materials_transmission')?.getTransmissionFactor() ?? 0]));
  for (const node of nodes) {
    add([node.getName(), node.getMatrix(), meshes.indexOf(node.getMesh()), node.listChildren().map(child => nodes.indexOf(child))]);
  }
  for (const mesh of meshes) {
    add(mesh.getName());
    for (const primitive of mesh.listPrimitives()) {
      add([primitive.getMode(), materials.indexOf(primitive.getMaterial()), primitive.getMaterial()?.getName() ?? '',
        primitive.getExtras(), primitive.listSemantics()]);
      const indices = primitive.getIndices();
      if (indices) addArray(indices.getArray());
      for (const semantic of primitive.listSemantics()) {
        const attribute = primitive.getAttribute(semantic);
        add([semantic, attribute.getComponentType(), attribute.getNormalized()]);
        addArray(attribute.getArray());
      }
    }
  }
  return hash.digest('hex');
}
