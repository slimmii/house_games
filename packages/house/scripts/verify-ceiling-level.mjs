/** Check the actual exported ceiling and its matching collision surface. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Matrix4,Ray,Triangle,Vector3} from 'three';
const config=JSON.parse(await readFile('scripts/ceiling-levels.json','utf8'));
const target=config.finishHeight*3,top=15.894;
await MeshoptDecoder.ready;
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read('public/models/house.glb');
const slabs=[];let found=0;
for(const node of doc.getRoot().listNodes()){
 assert.ok(!config.removedPanels.includes(node.getName()),`Duplicate ceiling panel: ${node.getName()}`);
 if(!config.slabs.includes(node.getName()))continue;
 found++;
 const matrix=new Matrix4().fromArray(node.getWorldMatrix());
 for(const primitive of node.getMesh().listPrimitives()){
  const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices();
  for(let i=0;i<positions.getCount();i++){
   const v=new Vector3().fromArray(positions.getElement(i,[])).applyMatrix4(matrix);
   assert.ok(Math.abs(v.y-target)<.00002||Math.abs(v.y-top)<.00002,`Unexpected ceiling height: ${node.getName()} ${v.y}`);
  }
  for(let i=0;i<indices.getCount();i+=3)slabs.push(new Triangle(...[0,1,2].map(j=>new Vector3().fromArray(positions.getElement(indices.getScalar(i+j),[])).applyMatrix4(matrix))));
 }
}
assert.equal(found,2,'Main slab and stair landing infill must both remain');
const ray=new Ray(),point=new Vector3();
function intersection(triangles,x,z){
 ray.set(new Vector3(x,15,z),new Vector3(0,1,0));
 let y=Infinity;
 for(const t of triangles)if(ray.intersectTriangle(t.a,t.b,t.c,false,point))y=Math.min(y,point.y);
 return y;
}
const probes=[[7.5,-12.5],[4,-5],[15,-15],[15,-26],[8.84,-8],[8.86,-8]];
for(const [x,z]of probes)assert.ok(Math.abs(intersection(slabs,x,z)-target)<.00002,`Ceiling step at ${x},${z}`);
assert.equal(intersection(slabs,2.8,-12.75),Infinity,'The original stair opening must stay open');

const collision=JSON.parse(await readFile('src/shared/house-collision.json','utf8'));
const inventory=JSON.parse(await readFile('src/shared/house-collision-inventory.json','utf8'));
const collisionSlabs=[];let cursor=0;
for(const object of inventory.objects){
 assert.equal(object.firstTriangle,cursor,'Collision inventory must remain contiguous');cursor+=object.triangleCount;
 assert.ok(!config.removedPanels.includes(object.name));
 if(!config.slabs.includes(object.name))continue;
 for(let i=object.firstTriangle;i<object.firstTriangle+object.triangleCount;i++)collisionSlabs.push(new Triangle(...[0,1,2].map(j=>new Vector3().fromArray(collision.positions,collision.indices[i*3+j]*3))));
}
assert.equal(cursor*3,collision.indices.length);
for(const [x,z]of probes)assert.ok(Math.abs(intersection(collisionSlabs,x,z)-target)<.00002,`Collision disagrees with visible ceiling at ${x},${z}`);
assert.equal(intersection(collisionSlabs,2.8,-12.75),Infinity,'Collision must preserve the stair opening');
const lights=JSON.parse(await readFile('src/client/house-light-fixtures.json','utf8')).filter(l=>l.name.startsWith(config.fixturePrefix));
assert.equal(lights.length,2);
for(const light of lights)assert.ok(Math.abs(light.position[1]-(target-.054))<.00002,'WC spotlight must remain below the new ceiling');
console.log(`Ceiling verified at ${target} game units: living, office, landing, matching collision and open stairs.`);
