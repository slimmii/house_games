import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOORS,
  advanceDoors,
  createDoorStates,
  doorComponentBoxes,
  doorComponentCount,
  doorLocalPoint,
  doorPartPose,
  doorWorldPoint,
  intersectBox,
  sweepDoors,
} from '../src/shared/doors';
import {CLOSET_DOORS,CLOSET_UNITS,getClosetStructuralBoxes} from '../src/shared/closet-interiors';
import type {SolidBox} from '../src/shared/door-types';

const near=(actual:number,expected:number,epsilon=1e-8) => assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);
const indexOf=(id:string) => {
  const index=DOORS.findIndex(door=>door.id===id);
  assert.notEqual(index,-1,id);
  return index;
};

test('garage sections roll continuously inward onto the ceiling track',()=>{
  const index=DOORS.findIndex(door=>door.label==='Garage'),door=DOORS[index];
  assert.equal(door.motion?.type,'sectional');
  assert.equal(doorComponentCount(index),12);
  const firstClosed=doorPartPose(index,0,0),lastClosed=doorPartPose(index,0,11);
  near(firstClosed.position[1],door.min[1]+(door.max[1]-door.min[1])/24);
  assert.ok(lastClosed.position[1]>firstClosed.position[1]);
  const firstOpen=doorPartPose(index,1,0),lastOpen=doorPartPose(index,1,11);
  near(firstOpen.rotationX,-Math.PI/2);
  near(lastOpen.rotationX,-Math.PI/2);
  near(firstOpen.position[1],door.max[1]+.75);
  assert.ok(lastOpen.position[2]<firstOpen.position[2]-5,'top section stores deepest inside the garage');
  assert.ok(firstOpen.position[2]<door.min[2]-.7,'bottom section clears the vertical opening');

  const turning=Array.from({length:12},(_,partIndex)=>doorPartPose(index,.5,partIndex));
  assert.ok(turning.some(pose=>pose.rotationX<-.05&&pose.rotationX>-Math.PI/2+.05),'sections articulate around the curved rail');
  assert.ok(turning.some(pose=>Math.abs(pose.rotationX)<1e-8),'lower sections remain vertical until reaching the curve');
});

test('every sectional part roundtrips points and reports its own collision slice',()=>{
  const index=DOORS.findIndex(door=>door.label==='Garage'),door=DOORS[index];
  for(let partIndex=0;partIndex<doorComponentCount(index);partIndex++) {
    const boxes=doorComponentBoxes(index,partIndex,'collision');
    assert.equal(boxes.length,1);
    assert.ok(boxes[0].min[1]>door.min[1]||partIndex===0);
    const point={
      x:(boxes[0].min[0]+boxes[0].max[0])/2,
      y:(boxes[0].min[1]+boxes[0].max[1])/2,
      z:(boxes[0].min[2]+boxes[0].max[2])/2,
    };
    for(const fraction of [0,.23,.51,.87,1]) {
      const world=doorWorldPoint(point,index,fraction,partIndex);
      const local=doorLocalPoint(world,index,fraction,partIndex);
      near(local.x,point.x);near(local.y,point.y);near(local.z,point.z);
    }
  }
  const states=createDoorStates();
  const partIndex=4,box=doorComponentBoxes(index,partIndex,'collision')[0];
  const y=(box.min[1]+box.max[1])/2,x=(box.min[0]+box.max[0])/2;
  const hit=sweepDoors({x,y,z:door.max[2]+1},{x,y,z:door.min[2]-1},0,states);
  assert.equal(hit?.doorIndex,index);
  assert.equal(hit?.partIndex,partIndex);
});

test('tracked sliders unseat before parallel travel while authored wardrobe lanes remain straight',()=>{
  const mirror=indexOf('closet_125'),other=indexOf('closet_126');
  const veranda=DOORS.findIndex(door=>door.label==='Veranda slider');
  for(const index of [mirror,other,veranda]) assert.equal(DOORS[index].motion?.type,'tracked-slide');
  const mirrorStart=doorPartPose(mirror,0),mirrorUnseated=doorPartPose(mirror,.12),mirrorLater=doorPartPose(mirror,.5);
  near(mirrorStart.position[2]-DOORS[mirror].pivot[2],.04);
  near(doorPartPose(other,0).position[2]-DOORS[other].pivot[2],.16);
  near(mirrorUnseated.position[2],mirrorStart.position[2]);
  assert.ok(Math.abs(mirrorLater.position[0]-mirrorStart.position[0])>.1);
  assert.ok(doorPartPose(other,.75).position[2]-doorPartPose(mirror,.25).position[2]>.1,
    'mirrors remain on distinct bypass rails at independent fractions');
  const verandaStart=doorPartPose(veranda,0),verandaUnseated=doorPartPose(veranda,.12),verandaOpen=doorPartPose(veranda,1);
  near(verandaUnseated.position[0],verandaStart.position[0]);
  near(verandaUnseated.position[2]-verandaStart.position[2],-.18);
  near(verandaOpen.position[2]-verandaStart.position[2],-.18);
  assert.ok(verandaOpen.position[0]-verandaStart.position[0]>5);

  const wardrobe=indexOf('closet_123');
  assert.equal(DOORS[wardrobe].motion,undefined);
  near(doorPartPose(wardrobe,.5).position[2],DOORS[wardrobe].pivot[2]);
});

test('the laundry overhead flap lifts about its top rail and overlay hinges clear the niche cheeks',()=>{
  const flap=indexOf('closet_056'),door=DOORS[flap];
  assert.equal(door.motion?.type,'flap');
  near(door.pivot[0],2.99);near(door.pivot[1],door.max[1]);
  const closed={x:(door.min[0]+door.max[0])/2,y:door.min[1],z:(door.min[2]+door.max[2])/2};
  const opened=doorWorldPoint(closed,flap,1);
  assert.ok(opened.x>door.max[0]+.5,'bottom edge lifts outward instead of swinging sideways');
  assert.ok(opened.y>door.min[1]);
  near(doorPartPose(flap,1).rotationZ,Math.PI/2);
  const local=doorLocalPoint(opened,flap,1);near(local.x,closed.x);near(local.y,closed.y);near(local.z,closed.z);
  near(DOORS[indexOf('closet_057')].pivot[0],2.99);
  near(DOORS[indexOf('closet_058')].pivot[0],2.99);
});

test('the garage motor uses its slower deterministic duration and eases at endpoints',()=>{
  const index=DOORS.findIndex(door=>door.label==='Garage'),states=createDoorStates();
  states[index].opening=true;
  advanceDoors(states,.7,[],.16);
  near(states[index].fraction,.25);
  const quarter=doorPartPose(index,states[index].fraction,0);
  const linearQuarter=DOORS[index].min[1]+(DOORS[index].max[1]-DOORS[index].min[1])/24
    +(DOORS[index].max[1]-DOORS[index].min[1]+Math.PI*.75/2)*.25;
  assert.ok(quarter.position[1]<linearQuarter,'motor accelerates smoothly from rest');
  advanceDoors(states,2.1,[],.16);
  near(states[index].fraction,1);
});

test('curving garage sections pause in both directions and reverse without a pose jump',()=>{
  const index=DOORS.findIndex(door=>door.label==='Garage'),states=createDoorStates(),partIndex=0;
  const box=doorComponentBoxes(index,partIndex,'collision')[0];
  const closedCenter={x:(box.min[0]+box.max[0])/2,y:(box.min[1]+box.max[1])/2,z:(box.min[2]+box.max[2])/2};
  const obstructionFraction=.8;
  const blocker=doorWorldPoint(closedCenter,index,obstructionFraction,partIndex);
  states[index].opening=true;
  advanceDoors(states,2.8,[blocker],.16);
  assert.ok(states[index].fraction>0&&states[index].fraction<obstructionFraction,'opening pauses before the curved section reaches the pilot');
  blocker.x=0;blocker.y=20;blocker.z=0;
  advanceDoors(states,2.8,[blocker],.16);
  near(states[index].fraction,1);

  Object.assign(blocker,doorWorldPoint(closedCenter,index,obstructionFraction,partIndex));
  states[index].opening=false;
  advanceDoors(states,2.8,[blocker],.16);
  assert.ok(states[index].fraction>obstructionFraction&&states[index].fraction<1,'closing pauses before the overhead section reaches the pilot');
  const paused=states[index].fraction,before=doorPartPose(index,paused,partIndex);
  blocker.x=0;blocker.y=20;blocker.z=0;states[index].opening=true;
  advanceDoors(states,.05,[blocker],.16);
  assert.ok(states[index].fraction>paused);
  const after=doorPartPose(index,states[index].fraction,partIndex);
  assert.ok(Math.hypot(...after.position.map((value,axis)=>value-before.position[axis]))<.25,'reverse continues from the paused rail pose');
});

function pointBoxDistance(point:{x:number;y:number;z:number},box:SolidBox):number {
  const values=[point.x,point.y,point.z];
  return Math.hypot(...values.map((value,axis)=>value-Math.max(box.min[axis],Math.min(box.max[axis],value))));
}

test('blind-corner shelf relief and natural travel stops keep moving fronts clear',()=>{
  const pairs:[string,string][]=[
    ['closet_000','kitchen-sink'],
    ['closet_007','kitchen-return-upper-1'],
    ['closet_060','laundry-rear-base'],
  ];
  for(const [id,unitId] of pairs) {
    const index=indexOf(id),door=DOORS[index],boxes=getClosetStructuralBoxes(unitId);
    const tangentAxis:0|2=(door.max[0]-door.min[0])>(door.max[2]-door.min[2])?0:2;
    const depthAxis:0|2=tangentAxis===0?2:0;
    for(const fraction of [.25,.5,.75,1]) for(const along of [0,.25,.5,.75,1]) for(const vertical of [.25,.5,.75]) {
      const coordinates=[0,0,0];
      coordinates[tangentAxis]=door.min[tangentAxis]+(door.max[tangentAxis]-door.min[tangentAxis])*along;
      coordinates[depthAxis]=(door.min[depthAxis]+door.max[depthAxis])*.5;
      coordinates[1]=door.min[1]+(door.max[1]-door.min[1])*vertical;
      const world=doorWorldPoint({x:coordinates[0],y:coordinates[1],z:coordinates[2]},index,fraction);
      assert.ok(boxes.every(box=>pointBoxDistance(world,box)>=.018-1e-8),`${id} clips ${unitId} at ${fraction}`);
    }
  }
  near(DOORS[indexOf('closet_005')].angle,85*Math.PI/180);
  assert.deepEqual(DOORS[indexOf('closet_019')].slide,[-1,0,0]);
  assert.deepEqual(DOORS[indexOf('closet_020')].slide,[-.9,0,0]);

  for(const unitId of ['kitchen-sink','kitchen-return-upper-1','laundry-rear-base']) {
    const unit=CLOSET_UNITS.find(candidate=>candidate.id===unitId)!;
    const entry=CLOSET_DOORS.find(candidate=>candidate.unitId===unitId)!;
    const boxes=getClosetStructuralBoxes(unitId),axis:0|2=Math.abs(entry.outward[0])>=Math.abs(entry.outward[2])?2:0;
    const depth:0|2=axis===0?2:0,inset=unit.openSideShelfInset!,sweep=unit.cornerSweepY!;
    for(const across of [.2,.5,.8]) for(const into of [.2,.5,.8]) {
      const values=[0,0,0];
      values[axis]=unit.interior.min[axis]+inset*across;
      values[depth]=unit.interior.min[depth]+(unit.interior.max[depth]-unit.interior.min[depth])*into;
      const bottomStart={x:values[0],y:sweep[0]-.005,z:values[2]},bottomEnd={...bottomStart,y:sweep[0]-.08};
      const topStart={x:values[0],y:sweep[1]+.005,z:values[2]},topEnd={...topStart,y:sweep[1]+.08};
      assert.ok(boxes.some(box=>intersectBox(bottomStart,bottomEnd,box,0,true)),`${unitId}: stepped floor remains solid`);
      assert.ok(boxes.some(box=>intersectBox(topStart,topEnd,box,0,true)),`${unitId}: stepped top remains solid`);
    }
  }
});

test('every generated carcass stops behind the inner closed-front face',()=>{
  for(const unit of CLOSET_UNITS) {
    if(unit.authoredStructureBounds?.length) continue;
    const entries=CLOSET_DOORS.filter(entry=>entry.unitId===unit.id);
    if(!entries.length) continue;
    const entry=entries[0],axis:0|2=Math.abs(entry.outward[0])>=Math.abs(entry.outward[2])?0:2;
    const sign=Math.sign(entry.outward[axis]);
    const boxes=getClosetStructuralBoxes(unit.id);
    if(sign>0) {
      const inner=Math.min(...entries.map(candidate=>candidate.min[axis]));
      assert.ok(boxes.every(box=>box.max[axis]<=inner-.01+1e-8),unit.id);
    } else {
      const inner=Math.max(...entries.map(candidate=>candidate.max[axis]));
      assert.ok(boxes.every(box=>box.min[axis]>=inner+.01-1e-8),unit.id);
    }
  }
});
