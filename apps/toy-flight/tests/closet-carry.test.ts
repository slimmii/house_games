import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOSET_DRAWER_BOXES } from '@huis/house/shared/closet-interiors';
import {
  DOORS,
  advanceDoors,
  createDoorStates,
  doorWorldPoint,
  insideDrawer,
  overlapsDoor,
} from '@huis/house/shared/doors';
import type { SolidBox } from '@huis/house/shared/door-types';
import type { Vec3 } from '../src/shared/protocol';

function indexOf(id: string): number {
  const index = DOORS.findIndex(door => door.id === id);
  assert.notEqual(index,-1,id);
  return index;
}

/** A point centered in the usable hollow above the tray bottom. */
function drawerPoint(index: number): Vec3 {
  const door = DOORS[index];
  const boxes = CLOSET_DRAWER_BOXES[door.id] as readonly SolidBox[];
  assert.equal(boxes.length,4,door.label);
  const depthAxis: 0|2 = Math.abs(door.slide[0]) >= Math.abs(door.slide[2]) ? 0 : 2;
  const horizontalAxis: 0|2 = depthAxis === 0 ? 2 : 0;
  const sign = Math.sign(door.slide[depthAxis]);
  const sides = [boxes[1],boxes[2]].sort((a,b) => a.min[horizontalAxis]-b.min[horizontalAxis]);
  const values = [0,0,0];
  values[horizontalAxis] = (sides[0].max[horizontalAxis]+sides[1].min[horizontalAxis])/2;
  values[1] = (boxes[0].max[1]+door.max[1])/2;
  values[depthAxis] = sign > 0
    ? (boxes[3].max[depthAxis]+door.min[depthAxis])/2
    : (door.max[depthAxis]+boxes[3].min[depthAxis])/2;
  return {x:values[0],y:values[1],z:values[2]};
}

test('an eligible drawer rider is carried through a complete safe opening',()=>{
  const index=indexOf('closet_017'),door=DOORS[index],states=createDoorStates();
  const pilot=drawerPoint(index),start={...pilot};
  assert.equal(insideDrawer(pilot,index,0),true);
  assert.equal(overlapsDoor(pilot,.16,index,0),false,'pilot starts in physical free space');
  states[index].opening=true;
  advanceDoors(states,1.1,[pilot],.16,[index]);
  assert.equal(states[index].fraction,1);
  assert.ok(Math.abs(pilot.x-start.x-door.slide[0])<1e-9);
  assert.ok(Math.abs(pilot.y-start.y-door.slide[1])<1e-9);
  assert.ok(Math.abs(pilot.z-start.z-door.slide[2])<1e-9);
  assert.equal(insideDrawer(pilot,index,1),true,'the carried pilot keeps its tray-local position');
  assert.equal(overlapsDoor(pilot,.16,index,1),false);
});

test('drawer containment follows its pose and distinguishes stacked and adjacent trays',()=>{
  const first=indexOf('closet_033'),stacked=indexOf('closet_034');
  const adjacent=indexOf('closet_102'),point=drawerPoint(first);
  assert.equal(insideDrawer(point,first,0),true);
  assert.equal(insideDrawer(point,stacked,0),false,'vertical front compartment selects one stacked drawer');
  assert.equal(insideDrawer(drawerPoint(indexOf('closet_100')),adjacent,0),false,
    'horizontal tray cavity selects one adjacent wardrobe drawer');
  const fraction=.63,moved=doorWorldPoint(point,first,fraction);
  assert.equal(insideDrawer(moved,first,fraction),true);
  assert.equal(insideDrawer(point,first,fraction),false,'a stale closed-pose point is not inside the moved tray');
});

test('a closed outer wardrobe panel stops inner drawer carry atomically until it clears',()=>{
  const drawer=indexOf('closet_100'),outer=indexOf('closet_123');
  const states=createDoorStates(),pilot=drawerPoint(drawer),start={...pilot};
  states[drawer].opening=true;
  advanceDoors(states,1.1,[pilot],.16,[drawer]);
  assert.ok(states[drawer].fraction>0&&states[drawer].fraction<1,'outer panel blocks the opening path');
  const partial=doorWorldPoint(start,drawer,states[drawer].fraction);
  assert.ok(Math.hypot(pilot.x-partial.x,pilot.y-partial.y,pilot.z-partial.z)<1e-9,
    'pilot and tray commit the same safe partial pose');
  assert.equal(insideDrawer(pilot,drawer,states[drawer].fraction),true);

  states[outer].fraction=1;
  states[outer].opening=true;
  advanceDoors(states,1.1,[pilot],.16,[drawer]);
  assert.equal(states[drawer].fraction,1,'carry resumes after the blocking assembly clears');
  assert.ok(Math.abs(pilot.z-start.z-DOORS[drawer].slide[2])<1e-9);
});

test('another occupant blocks carry without separating pilot from tray',()=>{
  const index=indexOf('closet_017'),states=createDoorStates();
  const pilot=drawerPoint(index),start={...pilot};
  const blocker={
    x:pilot.x+DOORS[index].slide[0]*.58,
    y:pilot.y,
    z:pilot.z+DOORS[index].slide[2]*.58,
  };
  states[index].opening=true;
  advanceDoors(states,1.1,[pilot,blocker],.16,[index,-1]);
  assert.ok(states[index].fraction<.58,'drawer stops before carrying one occupant into another');
  assert.ok(Math.hypot(pilot.x-blocker.x,pilot.y-blocker.y,pilot.z-blocker.z)>=.32-1e-9);
  assert.ok(Math.abs(pilot.x-start.x-DOORS[index].slide[0]*states[index].fraction)<1e-9);
  assert.equal(insideDrawer(pilot,index,states[index].fraction),true);
});

test('an outsider is never pulled and ordinary hinge behavior is unchanged',()=>{
  const drawer=indexOf('closet_017'),drawerStates=createDoorStates();
  const outsider={x:0,y:10,z:0},start={...outsider};
  assert.equal(insideDrawer(outsider,drawer,0),false);
  drawerStates[drawer].opening=true;
  advanceDoors(drawerStates,1.1,[outsider],.16,[drawer]);
  assert.equal(drawerStates[drawer].fraction,1);
  assert.deepEqual(outsider,start);

  const hinge=indexOf('closet_005'),hingeStates=createDoorStates();
  hingeStates[hinge].opening=true;
  advanceDoors(hingeStates,1.1,[outsider],.16,[hinge]);
  assert.equal(hingeStates[hinge].fraction,1);
  assert.deepEqual(outsider,start);
});

test('hinge padding permits separation but still stops an approaching panel',()=>{
  const index=indexOf('closet_005'),door=DOORS[index];
  const x=(door.min[0]+door.max[0])/2,y=door.min[1]+.35;
  const inward={x,y,z:door.max[2]+.163};
  assert.equal(overlapsDoor(inward,.16,index,0),false);
  assert.equal(overlapsDoor(inward,.195,index,0),true,'fixture begins inside only the safety padding');
  const separating=createDoorStates();
  separating[index].opening=true;
  advanceDoors(separating,.08,[inward],.16);
  assert.ok(separating[index].fraction>0,'panel may move away from a padded contact');

  const outward={x,y,z:door.min[2]-.163};
  assert.equal(overlapsDoor(outward,.16,index,0),false);
  assert.equal(overlapsDoor(outward,.195,index,0),true);
  const approaching=createDoorStates();
  approaching[index].opening=true;
  advanceDoors(approaching,.08,[outward],.16);
  assert.equal(approaching[index].fraction,0,'panel cannot enter the same padded clearance');
});
