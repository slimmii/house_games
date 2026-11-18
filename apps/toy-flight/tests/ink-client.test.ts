import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InkEffects } from '../src/client/inkEffects';
import { INK_TRAIL_BLOBS, ProjectileBatch } from '../src/client/projectileBatch';
import { INK_PROJECTILE_CAP } from '../src/shared/ink';
import type { PaintMark, ProjectileState } from '../src/shared/protocol';

test('ten seconds of unlimited client fire keeps projectile and burst pools bounded',()=>{
  const scene=new THREE.Scene(),projectiles=new ProjectileBatch(scene),effects=new InkEffects(scene);
  const colors=['#f27654','#58bdb0','#b096e7'];
  const active:ProjectileState[]=Array.from({length:INK_PROJECTILE_CAP},(_,index)=>({
    id:index+1,owner:`pilot-${index%3}`,color:colors[index%3],
    position:{x:index*.01,y:2+(index%4)*.03,z:-5},
    velocity:{x:(index%3)-1,y:.2,z:90},bornAt:0,
  }));
  const marks:PaintMark[]=[];
  effects.reconcile(marks);
  const started=performance.now();
  for(let frame=0;frame<600;frame++){
    for(const projectile of active){
      projectile.position.z+=projectile.velocity.z/60;
      if(projectile.position.z>5)projectile.position.z=-5;
    }
    projectiles.reconcile(active);
    if(frame%8===0){
      const id=marks.length+1;
      marks.push({id,position:{x:.867,y:18+(id%12)*.12,z:-8+(id%9)*.16},normal:{x:1,y:0,z:0},color:colors[id%3],size:.22});
      effects.reconcile(marks,colors[0]);
    }
    effects.update(1/60);
  }
  const elapsed=performance.now()-started;
  const meshes=scene.children.filter(child=>child.name.startsWith('ink-projectiles-')) as THREE.InstancedMesh[];
  assert.equal(meshes.length,3,'one reusable projectile pool per active player color');
  assert.equal(meshes.reduce((sum,mesh)=>sum+mesh.count,0),INK_PROJECTILE_CAP*(INK_TRAIL_BLOBS+1));
  assert.equal(scene.children.filter(child=>child.name==='ink-impact-bursts').length,1,'one bounded burst points object');
  assert.ok(elapsed<1500,`600 client updates took ${elapsed.toFixed(1)}ms`);
  console.log(`10s client ink simulation: ${elapsed.toFixed(1)}ms for 600 updates`);
  projectiles.dispose();effects.dispose();
  assert.equal(scene.children.length,0);
});
