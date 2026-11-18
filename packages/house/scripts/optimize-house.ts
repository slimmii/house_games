import { readFile, stat, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

// Lossless packaging only: no vertex quantization, welding, texture resizing,
// or lossy texture recompression. Keep the exported visual detail intact.
const path = 'public/models/house.glb';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const before = (await stat(path)).size;
const document = await io.read(path);
const manifestPath = 'public/models/house-manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
// These source decals mix a Transparent BSDF with Principled using PNG alpha.
// Blender exports their RGBA pixels but drops that shader mix's blend mode.
// Restore blending only for the decals, not the opaque baked material atlases.
const transparentDecals = new Set([
  'Small bedroom - detailed bear wall decal',
  'Bedroom 1 - detailed dragon wall decal',
]);
for (const material of document.getRoot().listMaterials()) {
  if (!transparentDecals.has(material.getName())) continue;
  if (!material.getBaseColorTexture()) throw new Error(`Missing decal image: ${material.getName()}`);
  material.setAlphaMode('BLEND');
}
manifest.transparentDecalMaterials = [...transparentDecals];
// Declared colour calibrations for directly exported image materials.
const overrides = JSON.parse(await readFile(new URL('./export-material-overrides.json', import.meta.url), 'utf8')) as {
  baseColorFactor: Record<string, number[] | string>;
};
const appliedOverrides: Record<string, number[]> = {};
for (const material of document.getRoot().listMaterials()) {
  const factor = overrides.baseColorFactor[material.getName()];
  if (!Array.isArray(factor)) continue;
  material.setBaseColorFactor(factor as [number, number, number, number]);
  appliedOverrides[material.getName()] = factor;
}
manifest.materialOverrides = appliedOverrides;
// Fail before packaging if Blender dropped a baked color texture. Deduplication
// can merge identical materials later, so check the authored names first.
const supersededBakedMaterials = new Set((manifest.incrementalVisualReplacements ?? [])
  .flatMap((replacement: { supersedesBakedMaterials?: string[] }) => replacement.supersedesBakedMaterials ?? []));
for (const baked of manifest.bakedProceduralMaterials ?? []) {
  if (supersededBakedMaterials.has(baked.exportMaterial)) continue;
  const material = document.getRoot().listMaterials().find(item => item.getName() === baked.exportMaterial);
  if (!material?.getBaseColorTexture()) {
    throw new Error(`Missing baked color texture: ${baked.sourceMaterial}`);
  }
}
const doorDetails: string[] = JSON.parse(await readFile(new URL('./door-details.json', import.meta.url), 'utf8'));
const detailPatterns = doorDetails.map(pattern => new RegExp(pattern, 'i'));
const removedDoorDetails: string[] = [];
for (const node of document.getRoot().listNodes()) {
  if (detailPatterns.some(pattern => pattern.test(node.getName()))) {
    removedDoorDetails.push(node.getName());
    node.dispose();
  }
}
await document.transform(
  dedup(), prune(), reorder({ encoder: MeshoptEncoder, target: 'size' }),
);
document.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(path, document);
const after = (await stat(path)).size;
manifest.optimization = { method: 'lossless deduplication and meshopt buffer compression; original textures and float vertices', beforeBytes: before, afterBytes: after };
manifest.removedDoorDetails = [...new Set([...(manifest.removedDoorDetails ?? []), ...removedDoorDetails])];
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`House optimized: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
