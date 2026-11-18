/** Apply the browser-reviewed linear tint to the incrementally imported oak floor. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const housePath = 'public/models/house.glb';
const manifestPath = 'public/models/house-manifest.json';
const sourcePath = '../../models/Huis_Oude_Terelststraat_15.blend';
const materialName = 'Reference floor / warm greige oak wide staggered planks';
const linearFactor = [0.55, 0.55, 0.55, 1];

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(housePath);
const materials = document.getRoot().listMaterials().filter((material) => material.getName() === materialName);
if (materials.length !== 1) throw new Error(`Expected one ${materialName} material, found ${materials.length}.`);
materials[0].setBaseColorFactor(linearFactor);
await io.write(housePath, document);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.sourceSha256 = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
const floor = manifest.incrementalVisualReplacements?.find((entry) => entry.scope === 'first-floor-oak');
if (!floor) throw new Error('Missing first-floor-oak manifest provenance.');
floor.linearBaseColorFactor = linearFactor;
floor.colorCalibration = 'Browser-reviewed linear multiplier matching the canonical Blender material; source texture pixels are unchanged.';
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Applied linear factor ${linearFactor.join(', ')}; source SHA-256 ${manifest.sourceSha256}.`);
