/** One-time cleanup for an incrementally merged asset: remove old floor-shell sides. */
import {NodeIO} from '@gltf-transform/core'; import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
// The kitchen shell reaches Y=7.254, above the main floor at Y=7.230.
// Include its entire shell: the former 7.25 cutoff left its top and side triangles.
const path='public/models/house.glb',doc=await io.read(path);let removed=0,removedIncoming=0;
for(const node of doc.getRoot().listNodes()){
 if(!['1 / floor finish','Kitchen floor finish - continuous with living','Reference spiral / 0 landing timber finish'].includes(node.getName()))continue;
 for(const primitive of [...(node.getMesh()?.listPrimitives()??[])])
  if(primitive.getMaterial()?.getName()!=='Reference floor / warm greige oak wide staggered planks'){primitive.dispose();removedIncoming++;}
}
for(const node of doc.getRoot().listNodes()){const matrix=node.getWorldMatrix();for(const p of node.getMesh()?.listPrimitives()??[]){
 if(p.getMaterial()?.getName()!=='Light timber living-room floor / game color bake')continue;
 const pos=p.getAttribute('POSITION').getArray(),ix=p.getIndices();if(!ix)continue;const src=ix.getArray(),kept=[];
 const wy=i=>matrix[1]*pos[i*3]+matrix[5]*pos[i*3+1]+matrix[9]*pos[i*3+2]+matrix[13];
 for(let i=0;i<src.length;i+=3){const old=[src[i],src[i+1],src[i+2]].every(j=>wy(j)>7.17&&wy(j)<7.26);if(old)removed++;else kept.push(src[i],src[i+1],src[i+2]);}
 ix.setArray(new src.constructor(kept));
}}
if(!removed&&!removedIncoming)throw new Error('No remaining floor overlap geometry found.');await io.write(path,doc);console.log(`Removed ${removed} old shell triangles and ${removedIncoming} duplicate incoming non-oak primitives.`);
