import test from 'node:test';
import assert from 'node:assert/strict';
import { DOORS, ROOM_DOOR_COUNT, createDoorStates, doorWorldPoint, doorWorldVector, overlapsDoor, sweepDoors, advanceDoors } from '@huis/house/shared/doors';
import { CLOSET_DOORS, CLOSET_UNITS, CLOSET_STATIC_BOXES, CLOSET_DRAWER_BOXES } from '@huis/house/shared/closet-interiors';
import { GameSimulation } from '../src/server/simulation';
import { chaseCameraPose } from '../src/shared/aim';
import { targetedDoor, targetDoorOnRay } from '../src/shared/interaction';
import { rayWorld, sweepWorld } from '@huis/house/shared/collision';
import type { SolidBox } from '@huis/house/shared/door-types';
const center=(box:SolidBox)=>({x:(box.min[0]+box.max[0])/2,y:(box.min[1]+box.max[1])/2,z:(box.min[2]+box.max[2])/2});
const vec=(a:number[])=>({x:a[0],y:a[1],z:a[2]});
function aimAt(pilot:{position:{x:number;y:number;z:number};yaw:number;pitch:number},point:{x:number;y:number;z:number},states:Parameters<typeof chaseCameraPose>[1]){
 pilot.yaw=Math.atan2(point.x-pilot.position.x,point.z-pilot.position.z);
 let lo=-1.13,hi=1.13;
 for(let n=0;n<40;n++){
  pilot.pitch=(lo+hi)/2;
  const {position:p,target:t}=chaseCameraPose(pilot,states);
  const desired=Math.atan2(point.y-p.y,Math.hypot(point.x-p.x,point.z-p.z));
  const actual=Math.atan2(t.y-p.y,Math.hypot(t.x-p.x,t.z-p.z));
  if(actual<desired)lo=pilot.pitch;else hi=pilot.pitch;
 }
}

test('inventory covers the house with unique fronts, logical motion, and real interior units',()=>{
 assert.ok(CLOSET_DOORS.length>=120,'cover all rooms, including baked wooden fronts');
 assert.equal(new Set(DOORS.map(d=>d.id)).size,DOORS.length);
 const used=new Set<string>();
 for(const entry of CLOSET_DOORS){
  assert.ok(CLOSET_UNITS.some(unit=>unit.id===entry.unitId),entry.label);
  for(const name of entry.frontNames){assert.ok(!used.has(name),`front assigned twice: ${name}`);used.add(name);}
  assert.ok(entry.targetBoxes.length,`no visible grip: ${entry.label}`);
  assert.ok(entry.min.every((n,i)=>Number.isFinite(n)&&n<entry.max[i]),entry.label);
  if(entry.kind==='drawer'){assert.equal(entry.angle,0);assert.ok(Math.hypot(...entry.slide)>.1);}
  if(entry.kind==='cupboard'){
   assert.ok(Math.abs(entry.angle)>.5||entry.motion?.type==='flap');
   assert.equal(Math.hypot(...entry.slide),0);
  }
  if(!entry.handleNames.length){
   for(const target of entry.targetBoxes){
    const targetArea=(target.max[1]-target.min[1])*Math.max(target.max[0]-target.min[0],target.max[2]-target.min[2]);
    const frontArea=(entry.max[1]-entry.min[1])*Math.max(entry.max[0]-entry.min[0],entry.max[2]-entry.min[2]);
    assert.ok(targetArea<frontArea*.65,`handleless front must get a precise visible grip: ${entry.label}`);
   }
  }
 }
 for(const box of CLOSET_STATIC_BOXES)assert.ok(box.min.every((n,i)=>Number.isFinite(n)&&n<box.max[i]));
});

test('Bedroom 1 wardrobes retain their authored structure behind the fronts',()=>{
 const rear=CLOSET_UNITS.find(unit=>unit.id==='bedroom1-rear-wardrobe')!;
 const entry=CLOSET_UNITS.find(unit=>unit.id==='bedroom1-entry-wardrobe')!;
 const rearFronts=CLOSET_DOORS.filter(door=>door.unitId===rear.id);
 assert.equal(rear.authoredStructureBounds?.length,48,'six backs, thirty shelves and twelve uprights');
 assert.ok(rearFronts.every(door=>door.outward[2]===1),'the room is on +Z and the cabinet cavity is behind the fronts');
 assert.equal(rear.interior.min[2],-14.856,'cavity starts at the authored back inner face');
 assert.ok(rear.authoredStructureBounds!.every(box=>box.max[2]<Math.min(...rearFronts.map(door=>door.min[2]))),
  'retained boards never project through the room-facing door plane');

 assert.equal(entry.authoredStructureBounds?.length,10,'back, sides, three shelves and four feet stay authored');
 assert.equal(entry.interior.min[0],10.362,'entry wardrobe cavity starts at its authored back');
 const authoredShelf=entry.authoredStructureBounds!.find(box=>box.name==='Bedroom 1 entry corner / wardrobe shelf.001')!;
 assert.deepEqual([authoredShelf.min[1],authoredShelf.max[1]],[18.003,18.056999]);
 assert.equal(entry.authoredStructureBounds!.some(box=>/shelf/.test(box.name)&&box.min[1]<19.28&&box.max[1]>19.28),false,
  'no generic shelf cuts across the tall-door compartment');

 for(const door of CLOSET_DOORS.filter(candidate=>candidate.unitId===entry.id)){
  for(const attachment of door.attachmentBounds??[]){
   if(!/round knob stem/.test(attachment.name))continue;
   assert.ok(attachment.max.every((value,axis)=>value-attachment.min[axis]<.1),`${attachment.name}: bounded extraction`);
  }
 }
});

test('all cupboard fronts block fast flight and remain solid after moving',()=>{
 const states=createDoorStates();
 for(const entry of CLOSET_DOORS){
  const index=DOORS.findIndex(d=>d.id===entry.id),source=center(entry);
  const p=doorWorldPoint(source,index,0),normal=doorWorldVector(vec(entry.outward),index,0);
  assert.ok(overlapsDoor(p,.03,index,0),entry.label);
  const start={x:p.x+normal.x*2,y:p.y,z:p.z+normal.z*2};
  const end={x:p.x-normal.x*2,y:p.y,z:p.z-normal.z*2};
  assert.ok(sweepDoors(start,end,.16,states),`fast flight: ${entry.label}`);
  const opened=doorWorldPoint(source,index,1);
  assert.ok(overlapsDoor(opened,.03,index,1),`opened panel: ${entry.label}`);
  if(entry.kind==='cupboard')assert.equal(overlapsDoor(p,.025,index,1),false,`original face clears: ${entry.label}`);
 }
});

test('drawer trays have individual bottoms, sides and backs around usable empty space',()=>{
 for(const entry of CLOSET_DOORS.filter(d=>d.kind==='drawer')){
  const boxes=CLOSET_DRAWER_BOXES[entry.id];
  assert.equal(boxes.length,4,entry.label);
  const index=DOORS.findIndex(d=>d.id===entry.id);
  for(const box of boxes)assert.ok(overlapsDoor(doorWorldPoint(center(box),index,1),.005,index,1),`${entry.label}: tray wall`);
  const bottom=boxes[0],left=boxes[1],right=boxes[2];
  const p=center(bottom);p.y=(bottom.max[1]+left.max[1])/2;
  assert.equal(overlapsDoor(doorWorldPoint(p,index,1),.005,index,1),false,`${entry.label}: hollow tray`);
  const tangent=Math.abs(entry.outward[0])>.5?2:0;
  assert.ok(bottom.min[tangent]>=entry.min[tangent]-.01&&bottom.max[tangent]<=entry.max[tangent]+.01,`${entry.label}: tray must fit its own front`);
 }
});

test('cupboard targeting requires its visible grip and follows its current pose',()=>{
 const entry=CLOSET_DOORS.find(d=>d.label==='Kitchen base door')!;
 const index=DOORS.findIndex(d=>d.id===entry.id),states=createDoorStates();
 assert.ok(index>=ROOM_DOOR_COUNT);
 const handle=center(entry.targetBoxes[0]);
 const from={x:handle.x+entry.outward[0]*.7,y:handle.y,z:handle.z+entry.outward[2]*.7};
 const beyond={x:handle.x-entry.outward[0]*.1,y:handle.y,z:handle.z-entry.outward[2]*.1};
 assert.equal(targetDoorOnRay(from,from,beyond,states),index,'exact handle');
 const panel=center(entry);
 const off={x:panel.x+entry.outward[0]*.7,y:panel.y,z:panel.z+entry.outward[2]*.7};
 assert.equal(targetDoorOnRay(off,off,panel,states),-1,'front center is not its edge pull');
 const far={...from,x:from.x+entry.outward[0]*3,z:from.z+entry.outward[2]*3};
 assert.equal(targetDoorOnRay(far,far,beyond,states),-1,'reach');
 states[index].fraction=1;
 const moved=doorWorldPoint(handle,index,1),movedFrom=doorWorldPoint(from,index,1),movedEnd=doorWorldPoint(beyond,index,1);
 assert.equal(targetDoorOnRay(movedFrom,movedFrom,movedEnd,states),index,'open handle follows panel');
 assert.equal(targetDoorOnRay(from,from,beyond,states),-1,'old handle location no longer active');
});

test('a large animation step cannot swing through an occupant',()=>{
 const index=DOORS.findIndex(d=>d.kind==='cupboard'),d=DOORS[index];
 const states=createDoorStates();states[index].opening=true;
 const far=center(d),tangent=Math.abs(d.max[0]-d.min[0])>Math.abs(d.max[2]-d.min[2])?'x':'z';
 const axis=tangent==='x'?0:2;
 far[tangent]=Math.abs(d.min[axis]-d.pivot[axis])>Math.abs(d.max[axis]-d.pivot[axis])?d.min[axis]+.08:d.max[axis]-.08;
 const occupant=doorWorldPoint(far,index,.52);
 advanceDoors(states,1.1,[occupant],.16);
 assert.ok(states[index].fraction<.52,'stop before occupant even over a whole animation');
 advanceDoors(states,1.1,[],.16);assert.equal(states[index].fraction,1);
});


test('server validates the recent rendered handle pose and rejects stale pose claims',()=>{
 const game=new GameSimulation(()=>0);
 const entry=CLOSET_DOORS.find(d=>d.frontNames.includes('Kitchen base door.002'))!;
 const index=DOORS.findIndex(d=>d.id===entry.id);
 game.doors[index].opening=true;
 for(let step=0;step<12;step++)game.update(.05);
 const viewedTime=.42,viewedFraction=viewedTime/1.1;
 const viewed=game.doors.map(d=>({...d}));viewed[index].fraction=viewedFraction;
 const handle=center(entry.targetBoxes[0]),outside={x:handle.x+entry.outward[0]*.8,y:handle.y,z:handle.z+entry.outward[2]*.8+.45};
 const point=doorWorldPoint(handle,index,viewedFraction);
 const pilot=game.addPlayer('pilot','Pilot');pilot.position=doorWorldPoint(outside,index,viewedFraction);
 aimAt(pilot,point,viewed);
 assert.equal(targetedDoor(pilot,viewed),index);
 assert.notEqual(targetedDoor(pilot,game.doors),index,'the rendered grip differs enough to require historical validation');
 assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch,viewTime:viewedTime}),true);
 assert.equal(game.doors[index].opening,false);
 game.time+=.3;
 assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch,viewTime:viewedTime}),false);
});

test('last used cupboard closes without aim but fallback is close-only and player-owned',()=>{
 const game=new GameSimulation(()=>0),entry=CLOSET_DOORS.find(d=>d.frontNames.includes('Kitchen base door.002'))!;
 const index=DOORS.findIndex(d=>d.id===entry.id),handle=center(entry.targetBoxes[0]);
 const pilot=game.addPlayer('pilot','Pilot');
 pilot.position={x:handle.x+entry.outward[0]*.8,y:handle.y,z:handle.z+entry.outward[2]*.8};
 aimAt(pilot,handle,game.doors);assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),true);
 game.doors[index].fraction=.5;game.time+=.3;pilot.yaw+=Math.PI;pilot.pitch=0;
 assert.equal(targetedDoor(pilot,game.doors),-1);assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),true);
 assert.equal(game.doors[index].opening,false,'look-away fallback closes the last used cupboard');
 game.time+=.3;assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),false,'closing cupboard cannot be reopened by fallback');
 game.doors[index].fraction=0;game.time+=.3;
 assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),false,'closed cupboard cannot be reopened by fallback');

 aimAt(pilot,handle,game.doors);game.time+=.3;assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),true);
 game.doors[index].fraction=.4;game.time+=.3;
 pilot.position.x+=entry.outward[0]*3;pilot.position.z+=entry.outward[2]*3;pilot.yaw+=Math.PI;
 assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:0}),false,'fallback remains range limited');
 const other=game.addPlayer('other','Other');other.position={x:handle.x+entry.outward[0]*.8,y:handle.y,z:handle.z+entry.outward[2]*.8};other.yaw=pilot.yaw;other.pitch=0;
 assert.equal(game.toggleDoor('other',{yaw:other.yaw,pitch:other.pitch}),false,'another player cannot inherit fallback ownership');
 assert.equal(game.doors[index].opening,true);
});

test('an accurately aimed cupboard takes priority over look-away fallback',()=>{
 const game=new GameSimulation(()=>0),last=CLOSET_DOORS.find(d=>d.frontNames.includes('Kitchen base door.002'))!;
 const aimed=CLOSET_DOORS.find(d=>d.frontNames.includes('Kitchen base door.001'))!;
 const lastIndex=DOORS.findIndex(d=>d.id===last.id),aimedIndex=DOORS.findIndex(d=>d.id===aimed.id);
 const lastHandle=center(last.targetBoxes[0]),aimedHandle=center(aimed.targetBoxes[0]),pilot=game.addPlayer('pilot','Pilot');
 pilot.position={x:lastHandle.x+last.outward[0]*.8,y:lastHandle.y,z:lastHandle.z+last.outward[2]*.8};
 aimAt(pilot,lastHandle,game.doors);assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),true);
 game.time+=.3;aimAt(pilot,aimedHandle,game.doors);assert.equal(targetedDoor(pilot,game.doors),aimedIndex);
 assert.equal(game.toggleDoor('pilot',{yaw:pilot.yaw,pitch:pilot.pitch}),true);
 assert.equal(game.doors[aimedIndex].opening,true);assert.equal(game.doors[lastIndex].opening,true,'aimed target wins instead of closing prior cupboard');
});

test('opened cabinet mouths have no old fixed fronts, corner walls, or desk reveal slabs',()=>{
 for(const name of ['Kitchen base door','Kitchen long upper cabinet','Laundry photo / wide overhead flap door','Living craft desk / left drawer 1 front','Living craft desk / left drawer 2 front','Living craft desk / right drawer 1 front','Living craft desk / right drawer 2 front']){
  const entry=CLOSET_DOORS.find(d=>d.label===name)!;assert.ok(entry,name);
  const axis=entry.outward[0]?0:2,p=entry.min.map((n,i)=>(n+entry.max[i])/2);
  p[1]=entry.min[1]+(entry.max[1]-entry.min[1])*.271;
  const front=entry.outward[axis]>0?entry.max[axis]:entry.min[axis],a=[...p],b=[...p];
  a[axis]=front+entry.outward[axis]*.05;b[axis]=front-entry.outward[axis]*.13;
  assert.equal(rayWorld(vec(a),vec(b)),null,name);
 }
});
