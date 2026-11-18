/** Merge the incrementally exported desk into the corrected packaged house. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const housePath = 'public/models/house.glb';
const deskPath = 'test-results/living-craft-desk.glb';
const manifestPath = 'public/models/house-manifest.json';
const sourcePath = '../../models/Huis_Oude_Terelststraat_15.blend';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const [house, desk] = await Promise.all([io.read(housePath), io.read(deskPath)]);
if (house.getRoot().listNodes().some(node => node.getName().startsWith('Living craft desk / ')))
  throw new Error('Desk is already present in the house GLB.');
const sourceScene = desk.getRoot().listScenes()[0];
const map = mergeDocuments(house, desk);
const mergedScene = map.get(sourceScene);
const targetScene = house.getRoot().getDefaultScene() ?? house.getRoot().listScenes()[0];
const root = house.createNode('Living craft desk / incremental collection');
for (const node of [...mergedScene.listChildren()]) root.addChild(node);
targetScene.addChild(root);
mergedScene.dispose();
await house.transform(unpartition());
await io.write(housePath, house);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.sourceSha256 = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
manifest.incrementalCollections = [...(manifest.incrementalCollections ?? []).filter(item => item.collection !== '01 / Furniture / living craft desk'), {
  collection: '01 / Furniture / living craft desk', objectCount: 163,
  sourceBounds: { min: [2.981, 5.355, 2.41], max: [3.511, 7.035, 3.655] },
  sourceScript: '../../models/living_craft_desk.py',
  visualIntegration: 'incremental GLB merge; plain solid materials plus one packed UV-mapped original photo texture',
}];
manifest.canonicalObjectCount = (manifest.canonicalObjectCount ?? 0) + 163;
manifest.visualObjectCount = (manifest.visualObjectCount ?? 0) + 163;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Merged 163 desk objects; source SHA-256 ${manifest.sourceSha256}`);
