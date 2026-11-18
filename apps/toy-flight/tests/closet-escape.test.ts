import test from 'node:test';
import assert from 'node:assert/strict';
import { closetEscape } from '../src/shared/closet-escape';
import { CLOSET_DOORS, CLOSET_DRAWER_BOXES, CLOSET_UNITS, type ClosetEntry } from '@huis/house/shared/closet-interiors';
import { DOORS, advanceDoors, createDoorStates, doorLocalPoint, doorWorldPoint, insideDrawer, overlapsDoor } from '@huis/house/shared/doors';
import { GameSimulation } from '../src/server/simulation';
import { stepFlight } from '../src/shared/flight';
import { overlapsWorld } from '@huis/house/shared/collision';
import type { DoorState } from '@huis/house/shared/doors';
import { DRONE_RADIUS, NEUTRAL_CONTROLS, type Vec3 } from '../src/shared/protocol';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const indexOf=(entry:ClosetEntry)=>DOORS.findIndex(door=>door.id===entry.id);

/** A point safely behind this front, projected into its own horizontal and vertical bay. */
function bayPoint(entry:ClosetEntry):Vec3{
 const unit=CLOSET_UNITS.find(candidate=>candidate.id===entry.unitId)!;
 const depth=entry.outward[0]?0:2,horizontal=depth===0?2:0;
 const point=unit.interior.min.map((value,axis)=>(value+unit.interior.max[axis])/2);
 for(const axis of [horizontal,1]){
  const span=unit.interior.max[axis]-unit.interior.min[axis],margin=Math.min(.18,span*.28);
  point[axis]=clamp((entry.min[axis]+entry.max[axis])/2,unit.interior.min[axis]+margin,unit.interior.max[axis]-margin);
 }
 return {x:point[0],y:point[1],z:point[2]};
}

function trayPoint(entry:ClosetEntry,index:number,fraction:number):Vec3{
 const boxes=CLOSET_DRAWER_BOXES[entry.id],bottom=boxes[0],side=boxes[1];
 const point={
  x:(bottom.min[0]+bottom.max[0])/2,
  y:bottom.max[1]+(side.max[1]-bottom.max[1])*.45,
  z:(bottom.min[2]+bottom.max[2])/2,
 };
 return doorWorldPoint(point,index,fraction);
}

/** A drone-radius-safe point in the hollow tray, away from bottom and side walls. */
function safeDrawerPoint(index:number):Vec3{
 const door=DOORS[index],boxes=CLOSET_DRAWER_BOXES[door.id];
 const depth:0|2=Math.abs(door.slide[0])>=Math.abs(door.slide[2])?0:2,horizontal:0|2=depth===0?2:0;
 const sign=Math.sign(door.slide[depth]),sides=[boxes[1],boxes[2]].sort((a,b)=>a.min[horizontal]-b.min[horizontal]);
 const values=[0,0,0];
 values[horizontal]=(sides[0].max[horizontal]+sides[1].min[horizontal])/2;
 values[1]=(boxes[0].max[1]+door.max[1])/2;
 values[depth]=sign>0?(boxes[3].max[depth]+door.min[depth])/2:(door.max[depth]+boxes[3].min[depth])/2;
 return {x:values[0],y:values[1],z:values[2]};
}

test('every storage compartment toggles closed to open to close to open as one group',()=>{
 const coveredUnits=new Set<string>();
 for(const entry of CLOSET_DOORS){
  const index=indexOf(entry),states=createDoorStates(),opened=closetEscape(bayPoint(entry),states);
  assert.ok(opened,entry.label);coveredUnits.add(entry.unitId);
  assert.equal(opened.index,index,`${entry.label}: primary front`);
  assert.equal(opened.opening,true,`${entry.label}: closed group opens`);
  assert.ok(opened.changes.some(change=>change.index===index&&change.opening),`${entry.label}: opens its own front`);
  assert.equal(opened.drawerIndex,entry.kind==='drawer'?index:-1,`${entry.label}: drawer containment`);
  const sameCompartment=opened.changes.filter(change=>change.opening&&CLOSET_DOORS.some(candidate=>
   indexOf(candidate)===change.index&&candidate.unitId===entry.unitId));
  assert.ok(sameCompartment.length<=2,`${entry.label}: must not open a whole cabinet row`);
  for(const change of opened.changes)states[change.index].opening=change.opening;
  const closed=closetEscape(bayPoint(entry),states)!;
  assert.equal(closed.opening,false,`${entry.label}: open group closes`);
  assert.deepEqual(closed.changes.map(change=>change.opening),closed.changes.map(()=>false),`${entry.label}: closes one group`);
  for(const change of closed.changes)states[change.index].opening=change.opening;
  const reopened=closetEscape(bayPoint(entry),states)!;
  assert.equal(reopened.opening,true,`${entry.label}: closing group reverses open`);
  assert.deepEqual(reopened.changes,opened.changes,`${entry.label}: deterministic reopen plan`);
 }
 assert.equal(coveredUnits.size,CLOSET_UNITS.length,'every authoritative interior unit is represented');
});

test('extended drawer trays resolve in their transformed pose, including nested wardrobe drawers',()=>{
 for(const entry of CLOSET_DOORS.filter(candidate=>candidate.kind==='drawer')){
  const index=indexOf(entry),states=createDoorStates(),fraction=.7;
  states[index]={fraction,opening:false};
  const result=closetEscape(trayPoint(entry,index,fraction),states);
  assert.ok(result,`${entry.label}: extended tray`);
  assert.equal(result.drawerIndex,index,`${entry.label}: transformed drawer`);
  assert.ok(result.changes.some(change=>change.index===index&&change.opening),`${entry.label}: reverse closing tray`);
  for(const change of result.changes)states[change.index].opening=change.opening;
  const closing=closetEscape(trayPoint(entry,index,fraction),states)!;
  assert.equal(closing.opening,false,`${entry.label}: opening tray reverses closed`);
  assert.ok(closing.changes.some(change=>change.index===index&&!change.opening));
 }
 const nested=CLOSET_DOORS.filter(entry=>entry.frontNames.some(name=>name.includes('wardrobe closed inner drawer front')));
 const outer=CLOSET_DOORS.filter(entry=>entry.unitId==='bedroom2-wardrobe'&&entry.kind==='sliding');
 assert.equal(outer.length,2);
 for(const entry of nested){
  const result=closetEscape(bayPoint(entry),createDoorStates())!;
  assert.ok(result.changes.some(change=>change.opening&&outer.some(leaf=>indexOf(leaf)===change.index)),`${entry.label}: opens enclosing sliding leaf`);
 }
 for(const entry of [nested[0],nested.at(-1)!]){
  const states=createDoorStates(),resultClosed=closetEscape(bayPoint(entry),states)!;
  const openedLeaf=resultClosed.changes.find(change=>change.opening&&outer.some(leaf=>indexOf(leaf)===change.index))!.index;
  const otherLeaf=indexOf(outer.find(leaf=>indexOf(leaf)!==openedLeaf)!);
  states[otherLeaf]={fraction:1,opening:true};
  const stacked=closetEscape(bayPoint(entry),states)!;
  assert.ok(stacked.changes.some(change=>change.index===openedLeaf&&change.opening),'correct gap leaf opens');
  assert.ok(stacked.changes.some(change=>change.index===otherLeaf&&!change.opening),'opposite stacked leaf clears the gap');
 }
});

test('server inside toggle has priority over missing, invalid, and stale aim in both directions',()=>{
 const entry=CLOSET_DOORS.find(candidate=>candidate.frontNames.some(name=>name.includes('white armoire closed door')))!;
 const index=indexOf(entry),position=bayPoint(entry);
 const setup=(state?:DoorState)=>{
  const game=new GameSimulation(()=>0),pilot=game.addPlayer('pilot','Pilot');pilot.position=position;
  if(state)game.doors[index]=state;
  assert.equal(game.lastInteractedDoor('pilot'),-1);
  return game;
 };
 const missing=setup();assert.equal(missing.toggleDoor('pilot'),true);assert.equal(missing.doors[index].opening,true);
 missing.doors[index].fraction=1;missing.time+=.3;
 assert.equal(missing.toggleDoor('pilot',{yaw:NaN,pitch:0}),true,'inside escape precedes aim validation');
 assert.equal(missing.doors[index].opening,false,'inside G closes an open exit');
 missing.time+=.3;
 assert.equal(missing.toggleDoor('pilot'),true);assert.equal(missing.doors[index].opening,true,'inside G reopens a closing exit');

 const closing=setup({fraction:.55,opening:false});
 assert.equal(closing.toggleDoor('pilot',{yaw:NaN,pitch:0}),true);assert.equal(closing.doors[index].opening,true,'closing reverses toward escape');
 const opening=setup({fraction:.55,opening:true});
 assert.equal(opening.toggleDoor('pilot'),true);assert.equal(opening.doors[index].opening,false,'opening reverses toward closed');
 const stale=setup();stale.time=10;
 assert.equal(stale.toggleDoor('pilot',{yaw:0,pitch:0,viewTime:0}),true,'stale rendered aim cannot trap an inside player');
 assert.equal(stale.doors[index].opening,true);
});

test('blind L-corner containment crosses only the explicitly open joining side',()=>{
 const states=createDoorStates(),seam={x:(2.07+2.1)/2,y:13,z:-20.5};
 const right=CLOSET_DOORS.find(entry=>entry.unitId==='kitchen-return-upper-1')!,rightIndex=indexOf(right);
 const escape=closetEscape(seam,states);
 assert.ok(escape);assert.equal(escape.index,rightIndex);
 assert.deepEqual(escape.changes,[{index:rightIndex,opening:true}],'seam opens the perpendicular return front');
 const solidSeam={x:(4.29+4.32)/2,y:13,z:-20.5};
 assert.equal(closetEscape(solidSeam,states),null,'ordinary solid cabinet sides do not expand containment');
});

test('server G carries a drawer rider open, closed, and open again without separating it',()=>{
 const entry=CLOSET_DOORS.find(candidate=>candidate.id==='closet_017')!,index=indexOf(entry),door=DOORS[index];
 const game=new GameSimulation(()=>0),pilot=game.addPlayer('pilot','Pilot'),start=safeDrawerPoint(index);pilot.position={...start};
 assert.equal(game.toggleDoor('pilot'),true);
 for(let step=0;step<30&&game.doors[index].fraction<1;step++)game.update(.05);
 assert.equal(game.doors[index].fraction,1);assert.equal(insideDrawer(pilot.position,index,1),true);
 assert.ok(Math.abs(pilot.position.x-start.x-door.slide[0])<1e-9&&Math.abs(pilot.position.z-start.z-door.slide[2])<1e-9);
 assert.equal(overlapsWorld(pilot.position,DRONE_RADIUS),false);
 assert.equal(DOORS.some((_candidate,other)=>overlapsDoor(pilot.position,DRONE_RADIUS,other,game.doors[other].fraction)),false);
 assert.equal(game.toggleDoor('pilot'),true);assert.equal(game.doors[index].opening,false);
 for(let step=0;step<30&&game.doors[index].fraction>0;step++)game.update(.05);
 assert.equal(game.doors[index].fraction,0);assert.equal(insideDrawer(pilot.position,index,0),true);
 assert.ok(Math.abs(pilot.position.x-start.x)<1e-9&&Math.abs(pilot.position.z-start.z)<1e-9,'closing carries back to the authored tray');
 assert.equal(game.toggleDoor('pilot'),true);assert.equal(game.doors[index].opening,true);
 for(let step=0;step<30&&game.doors[index].fraction<1;step++)game.update(.05);
 assert.equal(game.doors[index].fraction,1);assert.equal(insideDrawer(pilot.position,index,1),true);

 const cleared=new GameSimulation(()=>0),leaver=cleared.addPlayer('leaver','Leaver'),local=safeDrawerPoint(index);leaver.position={...local};
 assert.equal(cleared.toggleDoor('leaver'),true);leaver.position={x:0,y:10,z:0};cleared.update(.05);
 leaver.position=doorWorldPoint(local,index,cleared.doors[index].fraction);const reentered={...leaver.position},before=cleared.doors[index].fraction;
 cleared.update(.05);
 assert.ok(cleared.doors[index].fraction>before,'drawer continues after the rider leaves');
 assert.deepEqual(leaver.position,reentered,'a cleared carry request cannot pull a later re-entry');
});

test('multiple inside pilots issue shared group intent without inheriting interaction history',()=>{
 const entry=CLOSET_DOORS.find(candidate=>candidate.frontNames.some(name=>name.includes('white armoire closed door')))!,index=indexOf(entry);
 const game=new GameSimulation(()=>0),first=game.addPlayer('first','First'),second=game.addPlayer('second','Second');
 first.position=bayPoint(entry);second.position=bayPoint(entry);
 assert.equal(game.toggleDoor('first'),true);assert.equal(game.doors[index].opening,true);
 assert.equal(game.toggleDoor('second'),true);assert.equal(game.doors[index].opening,false,'second pilot deliberately reverses the shared group');
 game.time+=.3;
 assert.equal(game.toggleDoor('first'),true);assert.equal(game.doors[index].opening,true,'first pilot can reverse it again');
 assert.equal(game.lastInteractedDoor('first'),index);assert.equal(game.lastInteractedDoor('second'),index);
});

test('nested wardrobe closes the inner drawer before its clear sliding leaf, then reopens',()=>{
 const drawer=DOORS.findIndex(door=>door.id==='closet_100'),states=createDoorStates(),start=safeDrawerPoint(drawer);
 const initial=closetEscape(start,states)!;
 const outer=initial.changes.find(change=>DOORS[change.index].kind==='sliding'&&change.opening)!.index;
 const game=new GameSimulation(()=>0),pilot=game.addPlayer('pilot','Pilot');pilot.position={...start};
 assert.equal(game.toggleDoor('pilot'),true);
 for(let step=0;step<100&&(game.doors[drawer].fraction<1||game.doors[outer].fraction<1);step++)game.update(.05);
 assert.equal(game.doors[drawer].fraction,1);assert.equal(game.doors[outer].fraction,1);
 assert.equal(game.toggleDoor('pilot'),true);assert.equal(game.doors[drawer].opening,false);assert.equal(game.doors[outer].opening,false);
 game.update(.05);
 assert.ok(game.doors[drawer].fraction<1,'inner drawer starts retracting');
 assert.equal(game.doors[outer].fraction,1,'outer leaf waits at the clear pose');
 for(let step=0;step<100&&(game.doors[drawer].fraction>0||game.doors[outer].fraction>0);step++)game.update(.05);
 assert.equal(game.doors[drawer].fraction,0);assert.equal(game.doors[outer].fraction,0);
 assert.equal(insideDrawer(pilot.position,drawer,0),true);assert.deepEqual(pilot.position,start);
 assert.equal(game.toggleDoor('pilot'),true);
 for(let step=0;step<100&&(game.doors[drawer].fraction<1||game.doors[outer].fraction<1);step++)game.update(.05);
 assert.equal(game.doors[drawer].fraction,1);assert.equal(game.doors[outer].fraction,1);
 assert.equal(insideDrawer(pilot.position,drawer,1),true);
});

test('a nested drawer rider pauses for another pilot and resumes atomically after the path clears',()=>{
 const drawer=DOORS.findIndex(door=>door.id==='closet_100'),start=safeDrawerPoint(drawer),states=createDoorStates();
 const escape=closetEscape(start,states)!;
 const outer=escape.changes.find(change=>DOORS[change.index].kind==='sliding'&&change.opening)!.index;
 const game=new GameSimulation(()=>0),rider=game.addPlayer('rider','Rider'),blocker=game.addPlayer('blocker','Blocker');
 game.addPlayer('observer','Observer').position={x:0,y:10,z:0};
 rider.position={...start};game.doors[outer]={fraction:1,opening:true};
 blocker.position=doorWorldPoint(start,drawer,.85);
 assert.equal(game.toggleDoor('rider'),true);
 for(let step=0;step<30;step++)game.update(.05);
 const paused=game.doors[drawer].fraction;
 assert.ok(paused>0&&paused<.85,'drawer stops before the blocking pilot');
 assert.equal(insideDrawer(rider.position,drawer,paused),true,'rider remains in the paused tray');
 blocker.position={x:0,y:10,z:0};
 for(let step=0;step<40&&game.doors[drawer].fraction<1;step++)game.update(.05);
 assert.equal(game.doors[drawer].fraction,1,'drawer resumes after the path clears');
 assert.equal(insideDrawer(rider.position,drawer,1),true);
});

test('a center wardrobe rider can shift off the sliding seam while its drawer waits, then finish',()=>{
 const entry=CLOSET_DOORS.find(candidate=>candidate.id==='closet_102')!,index=indexOf(entry),states=createDoorStates();
 const game=new GameSimulation(()=>0),pilot=game.addPlayer('pilot','Pilot');pilot.position=safeDrawerPoint(index);
 const escape=closetEscape(pilot.position,states)!;for(const change of escape.changes)states[change.index].opening=change.opening;
 const openedLeaf=escape.changes.find(change=>DOORS[change.index].kind==='sliding'&&change.opening);
 assert.equal(DOORS[openedLeaf!.index].id,'closet_124','G resolves the center tie to the right-hand exit bay');
 advanceDoors(states,1.1,[pilot.position],DRONE_RADIUS,[index]);
 assert.ok(states[index].fraction>0&&states[index].fraction<1,'outer sliding leaves initially pause the drawer');
 pilot.yaw=0;pilot.velocity={x:0,y:0,z:0};pilot.speed=0;
 const seamX=pilot.position.x;
 for(let step=0;step<10;step++)stepFlight(pilot,{...NEUTRAL_CONTROLS,strafe:-1},.05,states);
 assert.ok(pilot.position.x>seamX+.4,'pilot can move laterally into the resolved open right bay');
 assert.equal(insideDrawer(pilot.position,index,states[index].fraction),true);
 const fraction=states[index].fraction,closedPoint=doorLocalPoint(pilot.position,index,fraction);
 advanceDoors(states,1.1,[pilot.position],DRONE_RADIUS,[index]);
 assert.equal(states[index].fraction,1,'drawer finishes after the rider clears the center seam');
 const expected=doorWorldPoint(closedPoint,index,1);
 assert.ok(Math.hypot(pilot.position.x-expected.x,pilot.position.y-expected.y,pilot.position.z-expected.z)<1e-9,
  'rider follows the shared smoothed drawer pose');
 assert.equal(insideDrawer(pilot.position,index,1),true);
 assert.equal(overlapsWorld(pilot.position,DRONE_RADIUS),false);
 assert.equal(DOORS.some((_candidate,other)=>overlapsDoor(pilot.position,DRONE_RADIUS,other,states[other].fraction)),false);
});
