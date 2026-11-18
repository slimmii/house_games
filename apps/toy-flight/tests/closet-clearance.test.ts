import assert from 'node:assert/strict';
import test from 'node:test';
import { overlapsWorld } from '@huis/house/shared/collision';
import { CLOSET_DOORS } from '@huis/house/shared/closet-interiors';
import { DOORS, doorWorldPoint } from '@huis/house/shared/doors';
import type { Vec3 } from '../src/shared/protocol';

const HORIZONTAL=[.02,.18,.34,.5,.66,.82,.98];
const VERTICAL=[.02,.26,.5,.74,.98];
const POSES=Array.from({length:40},(_,index)=>(index+1)/40);
const PROBE_RADIUS=.003;
const lerp=(a:number,b:number,fraction:number)=>a+(b-a)*fraction;

test('every closet front keeps dense outer-face samples clear of the static house throughout travel',()=>{
  let accepted=0,skipped=0;
  for(const entry of CLOSET_DOORS){
    const index=DOORS.findIndex(door=>door.id===entry.id);
    assert.notEqual(index,-1,entry.id);
    const depth:0|2=Math.abs(entry.outward[0])>.5?0:2;
    const horizontal:0|2=depth===0?2:0;
    const closedPoints:Vec3[]=[];
    for(const across of HORIZONTAL)for(const vertical of VERTICAL){
      const values=[0,0,0];
      values[depth]=entry.outward[depth]>0?entry.max[depth]:entry.min[depth];
      values[horizontal]=lerp(entry.min[horizontal],entry.max[horizontal],across);
      values[1]=lerp(entry.min[1],entry.max[1],vertical);
      closedPoints.push({x:values[0],y:values[1],z:values[2]});
    }
    // Cache the authored closed-pose classification; it is independent of the
    // forty moving poses and avoids repeating the same BVH query.
    for(const closed of closedPoints){
      if(overlapsWorld(closed,PROBE_RADIUS)){skipped+=POSES.length;continue;}
      for(const fraction of POSES){
        const moved=doorWorldPoint(closed,index,fraction);
        assert.equal(overlapsWorld(moved,PROBE_RADIUS),false,
          `${entry.id} (${entry.label}) intersects static geometry at fraction ${fraction.toFixed(3)} from ${JSON.stringify(closed)}`);
        accepted+=1;
      }
    }
  }
  assert.equal(accepted,CLOSET_DOORS.length * HORIZONTAL.length * VERTICAL.length * POSES.length,'all fronts retain the complete accepted sample set');
  assert.equal(skipped,0,'no sampled closed front point starts inside static geometry');
});
