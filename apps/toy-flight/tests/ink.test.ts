import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSimulation } from '../src/server/simulation';
import {
  INK_FIRE_INTERVAL,
  INK_MARK_SIZE_MIN,
  INK_MARK_SIZE_RANGE,
  INK_PROJECTILE_CAP,
} from '../src/shared/ink';
import { NEUTRAL_CONTROLS } from '../src/shared/protocol';

const STEP=1/60;

test('held ink fire is unlimited, steady at eight hertz, and produces larger bounded impacts',()=>{
  const values=[0,.5,.999];let randomIndex=0;
  const game=new GameSimulation(()=>values[randomIndex++%values.length]);
  const pilot=game.addPlayer('pilot','Painter');pilot.pitch=-Math.PI/2;
  let sequence=0;
  for(let tick=0;tick<60*10;tick++){
    if(tick%3===0)game.setInput('pilot',{...NEUTRAL_CONTROLS,seq:++sequence,fire:true});
    game.update(STEP);
  }
  const ideal=10/INK_FIRE_INTERVAL;
  assert.ok(Math.abs(pilot.shots-ideal)<=1,`${pilot.shots} shots must stay at the 8 Hz cadence`);
  assert.ok(game.paints.length>=pilot.shots-1,'downward continuous fire reaches the floor without an ammo limit');
  assert.ok(game.projectiles.length<=INK_PROJECTILE_CAP);
  for(const paint of game.paints){
    assert.ok(paint.size>=INK_MARK_SIZE_MIN);
    assert.ok(paint.size<=INK_MARK_SIZE_MIN+INK_MARK_SIZE_RANGE);
  }

  const before=pilot.shots;
  for(let tick=0;tick<40;tick++){
    if(tick%3===0)game.setInput('pilot',{...NEUTRAL_CONTROLS,seq:++sequence,fire:false});
    game.update(STEP);
  }
  game.setInput('pilot',{...NEUTRAL_CONTROLS,seq:++sequence,fire:true});game.update(STEP);
  assert.equal(pilot.shots,before+1,'pressing after a pause fires once without a catch-up burst');
  game.update(STEP);
  assert.equal(pilot.shots,before+1);
});
