import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { matchMaker } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import { createGameServer, type HouseRoom } from '../src/server/index';
import { DOORS } from '@huis/house/shared/doors';
import { chaseCameraPose } from '../src/shared/aim';
import { CLOSET_DOORS, CLOSET_UNITS, type ClosetEntry } from '@huis/house/shared/closet-interiors';
import { applySnapshotUpdate, type Snapshot, type SnapshotUpdate } from '../src/shared/protocol';

function bayPoint(entry:ClosetEntry){
 const unit=CLOSET_UNITS.find(candidate=>candidate.id===entry.unitId)!,depth=entry.outward[0]?0:2,horizontal=depth===0?2:0;
 const point=unit.interior.min.map((value,axis)=>(value+unit.interior.max[axis])/2);
 point[horizontal]=Math.max(unit.interior.min[horizontal]+.12,Math.min(unit.interior.max[horizontal]-.12,(entry.min[horizontal]+entry.max[horizontal])/2));
 point[1]=Math.max(unit.interior.min[1]+.12,Math.min(unit.interior.max[1]-.12,(entry.min[1]+entry.max[1])/2));
 return {x:point[0],y:point[1],z:point[2]};
}

test('clients synchronize aimed open, nearby close, and trapped-player escape', {timeout:15000}, async()=>{
 const server=await createGameServer({port:0,host:'127.0.0.1'});
 const clients:Room[]=[];
 const endpoint=`http://127.0.0.1:${server.port}`;
 function observe(room:Room,interactions:number[]=[]){
  let latest:Snapshot|undefined;
  room.onMessage('snapshot',(value:SnapshotUpdate)=>{latest=applySnapshotUpdate(latest,value);});
  room.onMessage('doorInteraction',(value:number)=>{interactions.push(value);});
  room.send('ready');
  return async (predicate:(s:Snapshot)=>boolean)=>{
   const until=Date.now()+4000;
   while(Date.now()<until){if(latest&&predicate(latest))return latest;await delay(15);}
   throw Error('cupboard snapshot not received');
 };
 }
 async function waitInteractions(values:number[],count:number){
  const until=Date.now()+4000;
  while(Date.now()<until){if(values.length>=count)return;await delay(15);}
  throw Error('cupboard interaction acknowledgement not received');
 }
 try{
  const interactions:number[]=[];
  const first=await new Client(endpoint).create('house',{name:'Cupboard pilot'});clients.push(first);const a=observe(first,interactions);
  const secondInteractions:number[]=[];
  const second=await new Client(endpoint).joinById(first.roomId,{name:'Observer'});clients.push(second);const b=observe(second,secondInteractions);
  const separate=await new Client(endpoint).create('house',{name:'Other house'});clients.push(separate);const c=observe(separate);
  await a(s=>s.players.length===2);await b(s=>s.players.length===2);await c(s=>s.players.length===1);
  const room=matchMaker.getLocalRoomById(first.roomId) as HouseRoom;
  const game=room.simulation,player=game.players.get(first.sessionId)!.drone;
  const entry=CLOSET_DOORS.find(d=>d.frontNames.includes('Kitchen base door.002'))!;
  const index=DOORS.findIndex(d=>d.id===entry.id),box=entry.targetBoxes[0];
  const point={x:(box.min[0]+box.max[0])/2,y:(box.min[1]+box.max[1])/2,z:(box.min[2]+box.max[2])/2};
  // Establish the test fixture inside the server process; no teleport or object
  // selection API is exposed to clients in the application.
  player.position={x:point.x+entry.outward[0]*.8,y:point.y,z:point.z+entry.outward[2]*.8};
  player.yaw=Math.atan2(point.x-player.position.x,point.z-player.position.z);
  let lo=-1.13,hi=1.13;
  for(let n=0;n<40;n++){
   player.pitch=(lo+hi)/2;
   const {position:p,target:t}=chaseCameraPose(player,game.doors);
   const desired=Math.atan2(point.y-p.y,Math.hypot(point.x-p.x,point.z-p.z));
   const actual=Math.atan2(t.y-p.y,Math.hypot(t.x-p.x,t.z-p.z));
   if(actual<desired)lo=player.pitch;else hi=player.pitch;
  }
  first.send('toggleDoor',{yaw:player.yaw,pitch:player.pitch});
  const [openedA,openedB]=await Promise.all([a(s=>Boolean(s.doors?.[index].opening)),b(s=>Boolean(s.doors?.[index].opening))]);
  await waitInteractions(interactions,1);assert.equal(interactions[0],index);
  assert.equal(openedA.doors?.length,DOORS.length);assert.equal(openedB.doors?.[index].opening,true);
  const isolated=await c(s=>s.time>openedA.time);
  assert.equal(isolated.doors?.[index].opening,false);
  const moved=await a(s=>(s.doors?.[index].fraction??0)>.02);
  await a(s=>s.time>moved.time+.3);
  first.send('toggleDoor',{yaw:player.yaw+Math.PI,pitch:0});
  await waitInteractions(interactions,2);assert.equal(interactions[1],index);
  const [closedA,closedB]=await Promise.all([a(s=>s.doors?.[index].opening===false),b(s=>s.doors?.[index].opening===false)]);
  assert.equal(closedA.doors?.[index].opening,false);assert.equal(closedB.doors?.[index].opening,false);

  const escapeEntry=CLOSET_DOORS.find(candidate=>candidate.frontNames.some(name=>name.includes('white armoire closed door')))!,escapeIndex=DOORS.findIndex(door=>door.id===escapeEntry.id);
  game.players.get(second.sessionId)!.drone.position=bayPoint(escapeEntry);
  second.send('toggleDoor',{yaw:0,pitch:0,viewTime:-999});
  await waitInteractions(secondInteractions,1);assert.equal(secondInteractions[0],escapeIndex);
  const [escapedA,escapedB]=await Promise.all([a(s=>s.doors?.[escapeIndex].opening===true),b(s=>s.doors?.[escapeIndex].opening===true)]);
  assert.equal(escapedA.doors?.[escapeIndex].opening,true);assert.equal(escapedB.doors?.[escapeIndex].opening,true);
  await b(s=>s.time>escapedB.time+.3);
  second.send('toggleDoor',{yaw:0,pitch:0,viewTime:-999});
  await waitInteractions(secondInteractions,2);assert.equal(secondInteractions[1],escapeIndex);
  const [insideClosedA,insideClosedB]=await Promise.all([a(s=>s.doors?.[escapeIndex].opening===false),b(s=>s.doors?.[escapeIndex].opening===false)]);
  assert.equal(insideClosedA.doors?.[escapeIndex].opening,false);assert.equal(insideClosedB.doors?.[escapeIndex].opening,false);
  await b(s=>s.time>insideClosedB.time+.3);
  second.send('toggleDoor');
  await waitInteractions(secondInteractions,3);assert.equal(secondInteractions[2],escapeIndex);
  const [reopenedA,reopenedB]=await Promise.all([a(s=>s.doors?.[escapeIndex].opening===true),b(s=>s.doors?.[escapeIndex].opening===true)]);
  assert.equal(reopenedA.doors?.[escapeIndex].opening,true);assert.equal(reopenedB.doors?.[escapeIndex].opening,true);
  const stillIsolated=await c(s=>s.time>escapedA.time);assert.equal(stillIsolated.doors?.[escapeIndex].opening,false);
 }finally{
  await Promise.all(clients.map(room=>room.leave().catch(()=>undefined)));
  await server.close();
 }
});
