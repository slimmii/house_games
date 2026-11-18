/** Restore authored metric stair UVs and sample one continuous sheet, not tiny atlas islands. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const path='public/models/house.glb',doc=await io.read(path);
const {bounds,corners}=JSON.parse(await readFile('test-results/fixtures/stair-brick-corners.json','utf8'));
const [u0,u1,v0,v1]=bounds;
const name='Stair brick - metre-scale curved and planar mapping / game color bake';
const material=doc.getRoot().listMaterials().find(m=>m.getName()===name);assert(material);
const oldTexture=material.getBaseColorTexture();
const texture=doc.createTexture('Stair brick / continuous metric sheet').setImage(await readFile('public/models/stair-brick-continuous.png')).setMimeType('image/png');
let repaired=0;let maximumPositionError=0;let maximumHeightError=0;
for(const node of doc.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()??[]){
 if(p.getMaterial()!==material)continue;
 const position=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),matrix=node.getWorldMatrix();
 const uv=new Float32Array(position.getCount()*2);
 for(let i=0;i<position.getCount();i++){
  const q=position.getElement(i,[]),n=normal.getElement(i,[]);
  const w=[0,1,2].map(j=>(matrix[j]*q[0]+matrix[j+4]*q[1]+matrix[j+8]*q[2]+matrix[j+12])/3);
  const source=[w[0],-w[2],w[1]],direction=[n[0],-n[2],n[1]];
  let match;let best=Infinity;
  for(const corner of corners){
   if(source[2]<corner.minZ-.025||source[2]>corner.maxZ+.025)continue;
   const dot=direction.reduce((sum,v,j)=>sum+v*corner.normal[j],0);if(dot<.998)continue;
   const distance=Math.hypot(source[0]-corner.position[0],source[1]-corner.position[1]);
   if(distance<best){best=distance;match=corner;}
  }
  assert(match&&best<.0002,`Unmatched source UV at ${JSON.stringify({source,direction,best})}`);
  maximumPositionError=Math.max(maximumPositionError,best);
  uv[i*2]=(match.uv[0]-u0)/(u1-u0);
  // glTF V increases downwards. Height comes from the corrected game surface,
  // retaining the previously repaired slab-cap clearances.
  uv[i*2+1]=1-(source[2]-v0)/(v1-v0);
  maximumHeightError=Math.max(maximumHeightError,Math.abs((1-uv[i*2+1])*(v1-v0)+v0-source[2]));
  assert(uv[i*2]>=0&&uv[i*2]<=1&&uv[i*2+1]>=0&&uv[i*2+1]<=1);
 }
 p.setAttribute('TEXCOORD_0',doc.createAccessor('Stair continuous metric UV').setType('VEC2').setArray(uv).setBuffer(position.getBuffer()));
 repaired+=position.getCount();
}
assert(repaired>1000);
material.setBaseColorTexture(texture);material.getBaseColorTextureInfo().setTexCoord(0).setWrapS(33071).setWrapT(33071);
if(oldTexture.listParents().every(parent=>parent.propertyType==='Root'))oldTexture.dispose();
await io.write(path,doc);
const report={repairedVertices:repaired,maximumPositionError,maximumHeightError,bounds,textureResolution:[4096,4096],method:'Match original Blender metric UV corners by world position and face normal. Preserve geometry and corrected cap heights.'};
await writeFile('test-results/fixtures/stair-uv-verification.json',JSON.stringify(report,null,2)+'\n');
const manifestPath='public/models/house-manifest.json',manifest=JSON.parse(await readFile(manifestPath,'utf8'));
manifest.continuousStairBrick=report;manifest.visualSha256=createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(report));
