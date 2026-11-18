/** Level the existing slab underside; retain its stair opening and upper floor. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import {Matrix4,Vector3} from 'three';

const config=JSON.parse(await readFile('scripts/ceiling-levels.json','utf8'));
const housePath='public/models/house.glb',collisionPath='src/shared/house-collision.json';
const inventoryPath='src/shared/house-collision-inventory.json',manifestPath='public/models/house-manifest.json';
const fixturesPath='src/client/house-light-fixtures.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const from=config.sourceHeight*3,to=config.finishHeight*3,delta=to-from;
const removed=new Set(config.removedPanels),slabs=new Set(config.slabs);
const fixture=name=>name.startsWith(config.fixturePrefix);
const touched=name=>removed.has(name)||slabs.has(name)||fixture(name);
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const doc=await io.read(housePath),root=doc.getRoot();
const signature=node=>JSON.stringify({name:node.getName(),matrix:node.getWorldMatrix(),primitives:node.getMesh()?.listPrimitives().map(p=>({
 material:p.getMaterial()?.getName(),indices:p.getIndices()?hash(p.getIndices().getArray()):null,
 attributes:Object.fromEntries(p.listSemantics().map(s=>[s,hash(p.getAttribute(s).getArray())])),
}))});
const preserved=new Map(root.listNodes().filter(n=>!touched(n.getName())).map(n=>[n,signature(n)]));
const textures=root.listTextures().map(t=>hash(t.getImage()));
const changed=[];let removedNodes=0;
for(const node of [...root.listNodes()]){
 const name=node.getName();
 if(removed.has(name)){node.dispose();removedNodes++;continue;}
 if(!slabs.has(name)&&!fixture(name))continue;
 const matrix=new Matrix4().fromArray(node.getWorldMatrix()),inverse=matrix.clone().invert();
 let moved=0;const heights=new Set();
 for(const primitive of node.getMesh()?.listPrimitives()??[]){
  const original=primitive.getAttribute('POSITION'),position=original.clone();
  position.setArray(original.getArray().slice());primitive.setAttribute('POSITION',position);
  const v=new Vector3();
  for(let i=0;i<position.getCount();i++){
   v.fromArray(position.getElement(i,[])).applyMatrix4(matrix);heights.add(Math.round(v.y*10000)/10000);
   if(fixture(name)||Math.abs(v.y-from)<.00002){
    v.y=fixture(name)?v.y+delta:to;
    position.setElement(i,v.applyMatrix4(inverse).toArray());moved++;
   }
  }
 }
 assert.ok(moved>0,`No ceiling vertices changed on ${name}; repair may already be applied`);
 if(slabs.has(name))assert.ok([...heights].every(y=>Math.abs(y-from)<.0001||Math.abs(y-15.894)<.0001),`Unexpected slab shape: ${name}`);
 changed.push({name,vertices:moved});
}
assert.equal(removedNodes,2,'Expected both old room ceiling panels; repair may already be applied');
assert.equal(changed.length,8,'Expected two slabs and six WC fixture meshes');
for(const [node,before]of preserved)assert.equal(signature(node),before,`Unrelated geometry changed: ${node.getName()}`);
assert.deepEqual(root.listTextures().map(t=>hash(t.getImage())),textures,'Texture content changed');

// Clone changed collision vertices per object because indexing can share a
// corner with unrelated geometry. Retain every other triangle verbatim.
const collision=JSON.parse(await readFile(collisionPath,'utf8'));
const inventory=JSON.parse(await readFile(inventoryPath,'utf8'));
const indices=[],objects=[];let oldCursor=0;
for(const object of inventory.objects){
 assert.equal(object.firstTriangle,oldCursor,'Collision inventory must cover the complete mesh');
 oldCursor+=object.triangleCount;
 if(removed.has(object.name))continue;
 const start=indices.length/3,remapped=new Map();
 for(let i=object.firstTriangle*3;i<(object.firstTriangle+object.triangleCount)*3;i++){
  const index=collision.indices[i],y=collision.positions[index*3+1];
  if(fixture(object.name)||(slabs.has(object.name)&&Math.abs(y-from)<.00002)){
   if(!remapped.has(index)){
    remapped.set(index,collision.positions.length/3);
    collision.positions.push(collision.positions[index*3],Math.round((fixture(object.name)?y+delta:to)*1e5)/1e5,collision.positions[index*3+2]);
   }
   indices.push(remapped.get(index));
  }else indices.push(index);
 }
 objects.push({...object,firstTriangle:start});
}
assert.equal(oldCursor*3,collision.indices.length);
assert.equal(collision.indices.length-indices.length,24*3,'Only obsolete panel triangles should be removed');
collision.indices=indices;inventory.objects=objects;
const fixtures=JSON.parse(await readFile(fixturesPath,'utf8'));
let movedLights=0;
for(const light of fixtures)if(fixture(light.name)){
 assert.ok(Math.abs(light.position[1]-(from-.054))<.00002,'Unexpected WC light mounting height');
 light.position[1]=Math.round((light.position[1]+delta)*1e6)/1e6;movedLights++;
}
assert.equal(movedLights,2);
const collisionBytes=JSON.stringify(collision);
await io.write(housePath,doc);
await writeFile(collisionPath,collisionBytes);
await writeFile(inventoryPath,JSON.stringify(inventory,null,2)+'\n');
await writeFile(fixturesPath,JSON.stringify(fixtures,null,2)+'\n');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
manifest.visualSha256=hash(await readFile(housePath));manifest.collisionSha256=hash(collisionBytes);
manifest.collisionObjectCount=objects.length;manifest.collisionTriangleCount=indices.length/3;
manifest.visualObjectCount-=removedNodes;manifest.canonicalObjectCount-=removedNodes;
manifest.restoredInteriorCeilings=manifest.restoredInteriorCeilings.filter(n=>!removed.has(n));
manifest.interiorFinishRepairs=JSON.parse(await readFile('scripts/interior-finishes.json','utf8'));
manifest.firstFloorCeilingLevel={...config,changed,removedTriangles:24};
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({height:to,changed,removedPanels:removedNodes,removedTriangles:24,movedLights}));
