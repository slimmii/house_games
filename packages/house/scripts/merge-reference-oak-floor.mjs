/** Replace only first-floor oak surfaces in the corrected packaged house GLB. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const housePath='public/models/house.glb', floorPath='test-results/reference-oak-floor.glb';
const manifestPath='public/models/house-manifest.json', sourcePath='../../models/Huis_Oude_Terelststraat_15.blend';
const collisionPath='src/shared/house-collision.json';
const OLD_MAIN='Light timber living-room floor / game color bake';
const OLD_LANDING='Reference spiral / landing matches floor 1 timber coordinates / game color bake';
const NEW_MATERIAL='Reference floor / warm greige oak wide staggered planks';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const [house,floor]=await Promise.all([io.read(housePath),io.read(floorPath)]);
// A full export carries the oak material itself (with the procedural colour bake suffix); only older packaged GLBs need this merge.
if(house.getRoot().listMaterials().some(m=>m.getName().startsWith(NEW_MATERIAL)))throw new Error('Reference oak floor already integrated.');
// Blender assigns the shared material to TEXCOORD_1 because the main floor has
// an older UV0 plus ReferenceOakWorldUV as UV1. The landing only has the new UV
// layer, exported as UV0. Mirror that accessor to UV1 so all three primitives
// sample the same explicit world mapping without disturbing their existing UVs.
for(const mesh of floor.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
 if(primitive.getMaterial()?.getName()!==NEW_MATERIAL)continue;
 if(!primitive.getAttribute('TEXCOORD_1')){
  const worldUV=primitive.getAttribute('TEXCOORD_0');
  if(!worldUV)throw new Error('Reference oak primitive has no UV coordinates.');
  primitive.setAttribute('TEXCOORD_1',worldUV);
 }
}
// The existing house retains its authored ivory stair-opening edge. Import only
// new oak primitives, otherwise the selected source node would duplicate that
// non-oak edge at identical coordinates.
for(const node of floor.getRoot().listNodes()){
 if(!['1 / floor finish','Kitchen floor finish - continuous with living','Reference spiral / 0 landing timber finish'].includes(node.getName()))continue;
 for(const primitive of [...(node.getMesh()?.listPrimitives()??[])])
  if(primitive.getMaterial()?.getName()!==NEW_MATERIAL)primitive.dispose();
}

// The old baked main-floor primitive also contains the untouched upper floor.
// Remove only triangles on the first-floor finish plane; retain all upper-floor triangles.
// The kitchen shell reaches Y=7.254, above the main floor at Y=7.230.
// Include its entire shell: the former 7.25 cutoff left its top and side triangles.
let removedTriangles=0;
for(const node of house.getRoot().listNodes()){
 const matrix=node.getWorldMatrix();
 for(const primitive of node.getMesh()?.listPrimitives()??[]){
  if(primitive.getMaterial()?.getName()!==OLD_MAIN)continue;
  const position=primitive.getAttribute('POSITION'),indices=primitive.getIndices();
  if(!position||!indices)throw new Error('Expected indexed baked floor geometry.');
  const pos=position.getArray(),src=indices.getArray(),kept=[];
  const worldY=i=>matrix[1]*pos[i*3]+matrix[5]*pos[i*3+1]+matrix[9]*pos[i*3+2]+matrix[13];
  for(let i=0;i<src.length;i+=3){
   // Remove the complete old first-floor shell (top, underside and perimeter),
   // rather than only its coplanar top triangles. The replacement carries the
   // same geometry with the new material and preserves the ivory opening edge.
   const firstFloor=[src[i],src[i+1],src[i+2]].every(index=>worldY(index)>7.17&&worldY(index)<7.26);
   if(firstFloor)removedTriangles++; else kept.push(src[i],src[i+1],src[i+2]);
  }
  indices.setArray(new src.constructor(kept));
 }
}
if(removedTriangles<10)throw new Error(`Removed only ${removedTriangles} old first-floor triangles.`);
const oldLandingNodes=house.getRoot().listNodes().filter(node=>node.getMesh()?.listPrimitives().some(p=>p.getMaterial()?.getName()===OLD_LANDING));
if(oldLandingNodes.length!==1)throw new Error(`Expected one old landing node, found ${oldLandingNodes.length}.`);
oldLandingNodes[0].dispose();

const sourceScene=floor.getRoot().listScenes()[0], map=mergeDocuments(house,floor), mergedScene=map.get(sourceScene);
const targetScene=house.getRoot().getDefaultScene()??house.getRoot().listScenes()[0];
const keepNames=new Set(['1 / floor finish','Kitchen floor finish - continuous with living','Reference spiral / 0 landing timber finish']);
const wrapper=house.createNode('Reference oak floor / incremental replacement'); let added=0;
for(const node of [...mergedScene.listChildren()]){
 if(keepNames.has(node.getName())){wrapper.addChild(node);added++;}else node.dispose();
}
if(added!==3)throw new Error(`Expected three game floor nodes, added ${added}.`);
targetScene.addChild(wrapper);mergedScene.dispose();await house.transform(unpartition());await io.write(housePath,house);

const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
manifest.sourceSha256=createHash('sha256').update(await readFile(sourcePath)).digest('hex');
manifest.collisionSha256=createHash('sha256').update(await readFile(collisionPath)).digest('hex');
manifest.incrementalVisualReplacements=[...(manifest.incrementalVisualReplacements??[]).filter(x=>x.scope!=='first-floor-oak'),{
 scope:'first-floor-oak',sourceObjects:[...keepNames],reviewOnlySourceObject:'Reference spiral / section floor 1',
 material:NEW_MATERIAL,texture:'Reference floor / warm oak albedo',uvLayer:'ReferenceOakWorldUV',
 uvMapping:'((sourceX - 0.30) / 2.24, (sourceY - 0.30) / 2.0)',removedOldTriangles:removedTriangles,
 supersedesBakedMaterials:[OLD_MAIN,OLD_LANDING],note:'OLD_MAIN remains in use by the untouched upper floor; floor-1 landing bake is retained in provenance only.'
}];
manifest.supersededVisualScopes=[...(manifest.supersededVisualScopes??[]).filter(x=>x.scope!=='first-floor-oak'),{scope:'first-floor-oak',bakeRecordsPreserved:true}];
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
console.log(`Replaced ${removedTriangles} old first-floor triangles and one landing node with ${added} UV-mapped source nodes.`);
