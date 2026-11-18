import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOSET_DOORS, CLOSET_DRAWER_BOXES } from '@huis/house/shared/closet-interiors';
import { DOORS, createDoorStates, doorWorldPoint, overlapsDoor } from '@huis/house/shared/doors';
import { targetDoorOnRay } from '../src/shared/interaction';
import { GameSimulation } from '../src/server/simulation';
import { chaseCameraPose } from '../src/shared/aim';
import { overlapsWorld } from '@huis/house/shared/collision';
const bins=CLOSET_DOORS.filter(d=>d.unitId.startsWith('small-bedroom-fabric-bin-'));
test('all sixteen fabric bins have reachable moving handles and hollow trays without a static cavity',()=>{
 assert.equal(bins.length,16);
 for(const bin of bins){
  const index=DOORS.findIndex(d=>d.id===bin.id),states=createDoorStates();
  assert.equal(bin.kind,'drawer');
  assert.equal(bin.attachedNames.length,4,'front, handle and both fabric sides move together');
  const target=bin.targetBoxes[0];
  const handle={x:(target.min[0]+target.max[0])/2,y:(target.min[1]+target.max[1])/2,z:(target.min[2]+target.max[2])/2};
  for(const fraction of [0,.5,1]){
   states[index].fraction=fraction;
   const point=doorWorldPoint(handle,index,fraction);
   const start={...point,x:point.x-.06},end={...point,x:point.x+.06};
   assert.equal(targetDoorOnRay(start,start,end,states),index,`${bin.id}: handle at ${fraction}`);
  }
  const [bottom,left,right,back]=CLOSET_DRAWER_BOXES[bin.id];
  const center={x:(bottom.min[0]+back.min[0])/2,y:(bottom.max[1]+left.max[1])/2,z:(left.max[2]+right.min[2])/2};
  assert.equal(overlapsWorld(center,.02),false,`${bin.id}: no static placeholder`);
  for(const fraction of [0,.5,1])assert.equal(overlapsDoor(doorWorldPoint(center,index,fraction),.02,index,fraction),false,`${bin.id}: hollow at ${fraction}`);
 }
});
test('fabric bin faces clear the shelving and nearby bed throughout travel',()=>{
 for(const bin of bins){
  const index=DOORS.findIndex(d=>d.id===bin.id);
  for(let step=0;step<=40;step++)for(const y of [.02,.25,.5,.75,.98])for(const z of [.02,.25,.5,.75,.98]){
   const p=doorWorldPoint({x:bin.min[0],y:bin.min[1]+(bin.max[1]-bin.min[1])*y,z:bin.min[2]+(bin.max[2]-bin.min[2])*z},index,step/40);
   assert.equal(overlapsWorld(p,.003),false,`${bin.id} at ${step}/40`);
  }
 }
});

test('the server opens and closes every bin through the normal aimed interaction',()=>{
 for(const bin of bins){
  const game=new GameSimulation(()=>.5),pilot=game.addPlayer('bin-pilot','Pilot');
  const box=bin.targetBoxes[0],point={x:(box.min[0]+box.max[0])/2,y:(box.min[1]+box.max[1])/2,z:(box.min[2]+box.max[2])/2};
  const index=DOORS.findIndex(d=>d.id===bin.id);
  pilot.position={x:point.x-.5,y:point.y+.6,z:point.z};
  pilot.yaw=Math.atan2(point.x-pilot.position.x,point.z-pilot.position.z);
  let lo=-1.13,hi=1.13;
  for(let n=0;n<40;n++){
   pilot.pitch=(lo+hi)/2;
   const {position:p,target:t}=chaseCameraPose(pilot,game.doors);
   const desired=Math.atan2(point.y-p.y,Math.hypot(point.x-p.x,point.z-p.z));
   const actual=Math.atan2(t.y-p.y,Math.hypot(t.x-p.x,t.z-p.z));
   if(actual<desired)lo=pilot.pitch;else hi=pilot.pitch;
  }
  assert.equal(game.toggleDoor('bin-pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),true,`${bin.id}: G opens`);
  assert.equal(game.doors[index].opening,true,bin.id);
  game.doors[index].fraction=.5;game.time+=.3;pilot.yaw+=Math.PI;pilot.pitch=0;
  assert.equal(game.toggleDoor('bin-pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),true,`${bin.id}: G closes`);
  assert.equal(game.doors[index].opening,false,bin.id);
 }
});
