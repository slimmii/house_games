import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { INK_INDICES_PER_MARK, INK_VERTICES_PER_MARK, PaintBatch } from '../src/client/paintBatch';
import { rayWorld } from '@huis/house/shared/collision';
import { DOORS, createDoorStates, doorComponentBoxes, doorComponentCount, doorWorldPoint } from '@huis/house/shared/doors';
import { createPaintAttachment, doorWorldVector, paintWorldPoint } from '../src/shared/paint';
import { MAX_PAINTS, type PaintMark, type Vec3 } from '../src/shared/protocol';

const close=(actual:number,expected:number,message?:string) =>
  assert.ok(Math.abs(actual-expected)<2e-5,`${message ?? 'value'}: ${actual} != ${expected}`);

type InspectablePaintBatch={
  centers:Float64Array;
  closedCenters:Float64Array;
  closedPositions:Float32Array;
  closedNormals:Float32Array;
  slotsById:Map<number,number>;
};
function inspect(batch:PaintBatch):InspectablePaintBatch {
  return batch as unknown as InspectablePaintBatch;
}

function geometry(scene:THREE.Scene):THREE.BufferGeometry {
  const mesh=scene.getObjectByName('paint-batch');
  assert.ok(mesh instanceof THREE.Mesh);
  return mesh.geometry;
}

function attachedMark(id:number,doorIndex:number,localPosition:Vec3,localNormal:Vec3,impactFraction:number,partIndex=0):PaintMark {
  const position=doorWorldPoint(localPosition,doorIndex,impactFraction,partIndex);
  const normal=doorWorldVector(localNormal,doorIndex,impactFraction,partIndex);
  return {
    id,position,normal,color:'#58bdb0',size:.22,
    attachment:createPaintAttachment(doorIndex,impactFraction,position,normal,partIndex),
  };
}

test('every attached splat vertex and its sort center follow interpolated door pose',()=>{
  const scene=new THREE.Scene(),batch=new PaintBatch(scene),index=DOORS.findIndex(d=>d.id==='door_0');
  assert.notEqual(index,-1);
  const door=DOORS[index],local={
    x:(door.min[0]+door.max[0])/2,
    y:door.max[1],
    z:(door.min[2]+door.max[2])/2,
  };
  // A top/bottom-facing splat has its outline in XZ. Rotating every point is
  // required even though its +Y normal itself is unchanged by a Y hinge.
  const mark=attachedMark(11,index,local,{x:0,y:1,z:0},.41),states=createDoorStates();
  batch.reconcile([mark]);
  batch.update(states);
  const attribute=geometry(scene).getAttribute('position') as THREE.BufferAttribute;
  const closed=Float32Array.from(attribute.array as Float32Array);
  const slot=inspect(batch).slotsById.get(mark.id)!;
  const centerOffset=slot*3;
  const closedCenter=Array.from(inspect(batch).closedCenters.slice(centerOffset,centerOffset+3));

  states[index].fraction=.67;
  batch.update(states);
  const offset=slot*INK_VERTICES_PER_MARK*3;
  for(let vertex=0;vertex<INK_VERTICES_PER_MARK;vertex++){
    const source={x:closed[offset+vertex*3],y:closed[offset+vertex*3+1],z:closed[offset+vertex*3+2]};
    const expected=paintWorldPoint(mark,source,states);
    close(attribute.getX(slot*INK_VERTICES_PER_MARK+vertex),expected.x,`vertex ${vertex} x`);
    close(attribute.getY(slot*INK_VERTICES_PER_MARK+vertex),expected.y,`vertex ${vertex} y`);
    close(attribute.getZ(slot*INK_VERTICES_PER_MARK+vertex),expected.z,`vertex ${vertex} z`);
  }
  const expectedCenter=paintWorldPoint(mark,{x:closedCenter[0],y:closedCenter[1],z:closedCenter[2]},states);
  close(inspect(batch).centers[centerOffset],expectedCenter.x,'sort center x');
  close(inspect(batch).centers[centerOffset+1],expectedCenter.y,'sort center y');
  close(inspect(batch).centers[centerOffset+2],expectedCenter.z,'sort center z');
  const version=attribute.version;
  batch.update(states);
  assert.equal(attribute.version,version,'unchanged displayed fraction does not rewrite attached vertices');
  batch.dispose();
});

test('a mark created on a partly open drawer stays on its rendered pose while opening and closing',()=>{
  const scene=new THREE.Scene(),batch=new PaintBatch(scene),index=DOORS.findIndex(d=>d.id==='closet_017');
  assert.notEqual(index,-1);
  const door=DOORS[index],local={
    x:(door.min[0]+door.max[0])/2,
    y:(door.min[1]+door.max[1])/2,
    z:(door.min[2]+door.max[2])/2,
  },normal={x:-1,y:0,z:0};
  const mark=attachedMark(12,index,local,normal,.43),states=createDoorStates();
  batch.reconcile([mark]);
  const attribute=geometry(scene).getAttribute('position') as THREE.BufferAttribute;
  const slot=inspect(batch).slotsById.get(mark.id)!;
  const localOffset=slot*INK_VERTICES_PER_MARK*3;
  const raisedLocal={
    x:inspect(batch).closedPositions[localOffset],
    y:inspect(batch).closedPositions[localOffset+1],
    z:inspect(batch).closedPositions[localOffset+2],
  };
  for(const fraction of [.43,.91,.18]){
    states[index].fraction=fraction;
    batch.update(states);
    const expected=doorWorldPoint(raisedLocal,index,fraction);
    close(attribute.getX(slot*INK_VERTICES_PER_MARK),expected.x,`center x at ${fraction}`);
    close(attribute.getY(slot*INK_VERTICES_PER_MARK),expected.y,`center y at ${fraction}`);
    close(attribute.getZ(slot*INK_VERTICES_PER_MARK),expected.z,`center z at ${fraction}`);
  }
  batch.dispose();
});

test('static slots stay cached and an evicted attachment cannot move a reused slot',()=>{
  const scene=new THREE.Scene(),batch=new PaintBatch(scene),index=DOORS.findIndex(d=>d.id==='closet_123');
  const door=DOORS[index],attached=attachedMark(20,index,{
    x:(door.min[0]+door.max[0])/2,y:(door.min[1]+door.max[1])/2,z:(door.min[2]+door.max[2])/2,
  },{x:0,y:0,z:-1},0);
  const states=createDoorStates();
  batch.reconcile([attached]);
  states[index].fraction=1;
  batch.update(states);
  batch.reconcile([]);
  const staticMark:PaintMark={
    id:21,position:{x:2,y:3,z:4},normal:{x:0,y:0,z:1},color:'#f27654',size:.16,
  };
  batch.reconcile([staticMark]);
  const attribute=geometry(scene).getAttribute('position') as THREE.BufferAttribute;
  const before=Float32Array.from(attribute.array as Float32Array);
  const version=attribute.version;
  states[index].fraction=0;
  batch.update(states);
  assert.deepEqual(attribute.array,before,'static geometry does not inherit the evicted attachment');
  assert.equal(attribute.version,version,'static-only update leaves the GPU position buffer cached');
  assert.equal(geometry(scene).drawRange.count,INK_INDICES_PER_MARK);
  batch.reconcile([]);
  assert.equal(geometry(scene).drawRange.count,0);
  const mesh=scene.getObjectByName('paint-batch');
  batch.dispose();
  assert.equal(mesh?.parent,null);
});

test('garage-panel ink clips to its thin section and transforms every glossy normal through the bend',()=>{
  const scene=new THREE.Scene(),batch=new PaintBatch(scene),index=DOORS.findIndex(d=>d.id==='door_5');
  const partIndex=Math.floor(doorComponentCount(index)/2),box=doorComponentBoxes(index,partIndex,'collision')[0];
  assert.ok(box);
  const local={x:box.max[0]-.008,y:(box.min[1]+box.max[1])/2,z:box.min[2]};
  const mark=attachedMark(31,index,local,{x:0,y:0,z:-1},.37,partIndex);
  batch.reconcile([mark]);
  const slot=inspect(batch).slotsById.get(mark.id)!;
  const closed=inspect(batch).closedPositions,closedNormals=inspect(batch).closedNormals;
  const start=slot*INK_VERTICES_PER_MARK*3;
  for(let vertex=0;vertex<INK_VERTICES_PER_MARK;vertex++){
    const offset=start+vertex*3;
    assert.ok(closed[offset]>=box.min[0]-1e-5&&closed[offset]<=box.max[0]+1e-5,`vertex ${vertex} stays within panel X`);
    assert.ok(closed[offset+1]>=box.min[1]-1e-5&&closed[offset+1]<=box.max[1]+1e-5,`vertex ${vertex} stays within panel Y`);
  }
  const states=createDoorStates(),attribute=geometry(scene).getAttribute('position') as THREE.BufferAttribute;
  const normals=geometry(scene).getAttribute('normal') as THREE.BufferAttribute;
  for(const fraction of [0,.5,1]){
    states[index].fraction=fraction;batch.update(states);
    for(let vertex=0;vertex<INK_VERTICES_PER_MARK;vertex++){
      const offset=start+vertex*3,world=doorWorldPoint({x:closed[offset],y:closed[offset+1],z:closed[offset+2]},index,fraction,partIndex);
      const normal=doorWorldVector({x:closedNormals[offset],y:closedNormals[offset+1],z:closedNormals[offset+2]},index,fraction,partIndex);
      close(attribute.getX(slot*INK_VERTICES_PER_MARK+vertex),world.x,`garage ${fraction} vertex ${vertex} x`);
      close(attribute.getY(slot*INK_VERTICES_PER_MARK+vertex),world.y,`garage ${fraction} vertex ${vertex} y`);
      close(attribute.getZ(slot*INK_VERTICES_PER_MARK+vertex),world.z,`garage ${fraction} vertex ${vertex} z`);
      close(normals.getX(slot*INK_VERTICES_PER_MARK+vertex),normal.x,`garage ${fraction} normal ${vertex} x`);
      close(normals.getY(slot*INK_VERTICES_PER_MARK+vertex),normal.y,`garage ${fraction} normal ${vertex} y`);
      close(normals.getZ(slot*INK_VERTICES_PER_MARK+vertex),normal.z,`garage ${fraction} normal ${vertex} z`);
    }
  }
  batch.dispose();
});

test('top-hinged laundry flap carries attached ink positions and normals through its Z rotation',()=>{
  const scene=new THREE.Scene(),batch=new PaintBatch(scene),index=DOORS.findIndex(d=>d.id==='closet_056');
  const door=DOORS[index],local={
    x:door.max[0],
    y:(door.min[1]+door.max[1])/2,
    z:(door.min[2]+door.max[2])/2,
  };
  const mark=attachedMark(36,index,local,{x:1,y:0,z:0},.29);
  batch.reconcile([mark]);
  const slot=inspect(batch).slotsById.get(mark.id)!,start=slot*INK_VERTICES_PER_MARK*3;
  const closed=inspect(batch).closedPositions,closedNormals=inspect(batch).closedNormals;
  const attribute=geometry(scene).getAttribute('position') as THREE.BufferAttribute;
  const normals=geometry(scene).getAttribute('normal') as THREE.BufferAttribute;
  const states=createDoorStates();
  for(const fraction of [0,.5,1]){
    states[index].fraction=fraction;batch.update(states);
    for(const vertex of [0,1,17,48,INK_VERTICES_PER_MARK-1]){
      const offset=start+vertex*3;
      const world=doorWorldPoint({x:closed[offset],y:closed[offset+1],z:closed[offset+2]},index,fraction);
      const normal=doorWorldVector({x:closedNormals[offset],y:closedNormals[offset+1],z:closedNormals[offset+2]},index,fraction);
      close(attribute.getX(slot*INK_VERTICES_PER_MARK+vertex),world.x,`flap ${fraction} vertex ${vertex} x`);
      close(attribute.getY(slot*INK_VERTICES_PER_MARK+vertex),world.y,`flap ${fraction} vertex ${vertex} y`);
      close(attribute.getZ(slot*INK_VERTICES_PER_MARK+vertex),world.z,`flap ${fraction} vertex ${vertex} z`);
      close(normals.getX(slot*INK_VERTICES_PER_MARK+vertex),normal.x,`flap ${fraction} normal ${vertex} x`);
      close(normals.getY(slot*INK_VERTICES_PER_MARK+vertex),normal.y,`flap ${fraction} normal ${vertex} y`);
      close(normals.getZ(slot*INK_VERTICES_PER_MARK+vertex),normal.z,`flap ${fraction} normal ${vertex} z`);
    }
  }
  batch.dispose();
});

test('static ink near a wall edge clips every emitted vertex back to supported surface',()=>{
  const scene=new THREE.Scene(),batch=new PaintBatch(scene);
  const hit=rayWorld({x:2,y:20,z:-10.59},{x:0,y:20,z:-10.59});
  assert.ok(hit&&hit.normal.x>.9,'fixture is the exposed Bedroom 3 wall edge');
  const mark:PaintMark={id:41,position:hit.position,normal:hit.normal,color:'#f27654',size:.28};
  batch.reconcile([mark]);
  const attribute=geometry(scene).getAttribute('position') as THREE.BufferAttribute;
  const slot=inspect(batch).slotsById.get(mark.id)!;
  for(let vertex=0;vertex<INK_VERTICES_PER_MARK;vertex++){
    const point={
      x:attribute.getX(slot*INK_VERTICES_PER_MARK+vertex),
      y:attribute.getY(slot*INK_VERTICES_PER_MARK+vertex),
      z:attribute.getZ(slot*INK_VERTICES_PER_MARK+vertex),
    };
    const probe=rayWorld(
      {x:point.x+mark.normal.x*.06,y:point.y+mark.normal.y*.06,z:point.z+mark.normal.z*.06},
      {x:point.x-mark.normal.x*.06,y:point.y-mark.normal.y*.06,z:point.z-mark.normal.z*.06},
    );
    assert.ok(probe&&Math.hypot(probe.position.x-point.x,probe.position.y-point.y,probe.position.z-point.z)<.03,
      `vertex ${vertex} remains on wall instead of floating beyond its edge`);
  }
  batch.dispose();
});

test('newer overlapping ink is indexed last and coats the older color without writing depth',()=>{
  const scene=new THREE.Scene(),batch=new PaintBatch(scene);
  const position={x:.867,y:20,z:-8},normal={x:1,y:0,z:0};
  batch.reconcile([
    {id:51,position,normal,color:'#f27654',size:.22},
    {id:52,position,normal,color:'#58bdb0',size:.22},
  ]);
  const mesh=scene.getObjectByName('paint-batch');assert.ok(mesh instanceof THREE.Mesh);
  const material=mesh.material as THREE.MeshStandardMaterial;
  assert.equal(material.depthWrite,false);
  assert.equal(material.transparent,true,'ink draws after alpha-blended wall art');
  assert.equal(material.opacity,1,'transparent queue placement keeps ink fully opaque');
  assert.equal(material.depthTest,true,'opaque world geometry still occludes ink');
  assert.ok(mesh.renderOrder>0,'ink is ordered after ordinary blended decorations');
  const index=geometry(scene).index!;
  const newerSlot=inspect(batch).slotsById.get(52)!;
  assert.ok(index.getX(INK_INDICES_PER_MARK)>=newerSlot*INK_VERTICES_PER_MARK,
    'second patch indices follow the first patch and therefore paint over it');
  batch.dispose();
});

test('a 600-mark late join builds one bounded Uint32 batch without per-frame static rewrites',()=>{
  assert.equal(MAX_PAINTS,600);
  const scene=new THREE.Scene(),batch=new PaintBatch(scene);
  const marks:PaintMark[]=Array.from({length:MAX_PAINTS},(_,index)=>({
    id:index+1,
    position:{x:.867,y:18.2+(index%20)*.08,z:-8.8+(Math.floor(index/20)%20)*.12},
    normal:{x:1,y:0,z:0},
    color:['#f27654','#58bdb0','#b096e7'][index%3],
    size:.18+(index%11)*.01,
  }));
  const started=performance.now();batch.reconcile(marks);const elapsed=performance.now()-started;
  const geometryValue=geometry(scene),position=geometryValue.getAttribute('position') as THREE.BufferAttribute;
  assert.ok(geometryValue.index?.array instanceof Uint32Array,'capacity cannot wrap 16-bit vertex indices');
  assert.equal(geometryValue.drawRange.count,MAX_PAINTS*INK_INDICES_PER_MARK);
  assert.equal(scene.children.filter(child=>child.name==='paint-batch').length,1,'one draw object for the full history');
  assert.ok(elapsed<2500,`late-join footprint build took ${elapsed.toFixed(1)}ms`);
  const version=position.version;batch.update(createDoorStates());assert.equal(position.version,version,'static history stays cached per frame');
  console.log(`600-mark PaintBatch preload: ${elapsed.toFixed(1)}ms`);
  batch.dispose();
});
