/** Add only the photographed fixtures; retain every existing corrected house surface. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
const path='public/models/house.glb', backup='test-results/fixtures/house-before.glb';
try { await access(backup); } catch { await copyFile(path,backup); }
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const [house,fixtures]=await Promise.all([io.read(path),io.read('test-results/fixtures/reference-lights.glb')]);
const prefix='Reference lighting / ';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const textureHashes=house.getRoot().listTextures().map(t=>hash(t.getImage()));
const preserved=house.getRoot().listNodes().filter(n=>!n.getName().startsWith(prefix)&&n.getName()!=='Ground bathroom photo / ceiling lamp');
const snapshots=preserved.map(n=>({n,matrix:n.getWorldMatrix(),primitives:(n.getMesh()?.listPrimitives()??[]).map(p=>({p,attributes:p.listAttributes().map(a=>hash(a.getArray())),indices:p.getIndices()?hash(p.getIndices().getArray()):null,material:p.getMaterial()}))}));
for(const node of [...house.getRoot().listNodes()])if(node.getName().startsWith(prefix)||node.getName()==='Ground bathroom photo / ceiling lamp')node.dispose();
const map=mergeDocuments(house,fixtures),merged=map.get(fixtures.getRoot().listScenes()[0]);
const target=house.getRoot().getDefaultScene();
let count=0;
for(const node of [...merged.listChildren()]){target.addChild(node);count++;}
merged.dispose();assert.equal(count,57);
for(const {n,matrix,primitives} of snapshots){
 assert.deepEqual(n.getWorldMatrix(),matrix);
 for(const {p,attributes,indices,material} of primitives){
  assert.deepEqual(p.listAttributes().map(a=>hash(a.getArray())),attributes);
  assert.equal(p.getIndices()?hash(p.getIndices().getArray()):null,indices);assert.equal(p.getMaterial(),material);
 }
}
assert.deepEqual(house.getRoot().listTextures().map(t=>hash(t.getImage())),textureHashes);
await house.transform(unpartition());await io.write(path,house);
const manifestPath='public/models/house-manifest.json';const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
manifest.sourceSha256=hash(await readFile('../../models/Huis_Oude_Terelststraat_15.blend'));
manifest.incrementalCollections=[...(manifest.incrementalCollections??[]).filter(c=>c.scope!=='reference-lighting'),{
 scope:'reference-lighting',objectCount:57,spots:10,sconces:3,strips:3,sourceScript:'../../models/reference_light_fixtures.py',
 removedObject:'Ground bathroom photo / ceiling lamp',lightDefinitions:'src/client/house-light-fixtures.json',
 note:'Existing geometry, UVs, textures and material references verified unchanged; fixtures are small surface fittings backed by existing wall/ceiling collisions.'
}];
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({addedMeshes:count,preservedNodes:snapshots.length,unchangedTextures:textureHashes.length,houseSha256:hash(await readFile(path))}));
