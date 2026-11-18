import * as THREE from 'three';
import { installProbeShader } from './probeLighting';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ClosetEntry, ClosetUnit } from '../shared/closet-interiors';
import { closetShelfHeights } from '../shared/closet-interiors';

const plastic = new THREE.MeshStandardMaterial({color:'#f4faff',roughness:.24,emissive:'#c7e5f6',emissiveIntensity:.14});
const trim = new THREE.MeshStandardMaterial({color:'#d1dce0',roughness:.32,metalness:.25});
const seal = new THREE.MeshStandardMaterial({color:'#9aa5a8',roughness:.85});
const clear = new THREE.MeshStandardMaterial({color:'#b8d9e2',roughness:.2,transparent:true,opacity:.38,depthWrite:false});
const dark = new THREE.MeshStandardMaterial({color:'#52656e',roughness:.7});
const led = new THREE.MeshStandardMaterial({color:'#f3fbff',emissive:'#d9f1ff',emissiveIntensity:2});
function box(parent:THREE.Object3D,name:string,size:number[],at:number[],material:THREE.Material=plastic,radius=.025) {
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(size[0],size[1],size[2],2,Math.min(radius,...size.map(n=>n/3))),material);
  mesh.name=`fridge ${name}`;mesh.position.fromArray(at);parent.add(mesh);return mesh;
}
function foodMaterial(color:string){return new THREE.MeshStandardMaterial({color,roughness:.4});}
const blue=foodMaterial('#3179b4'),green=foodMaterial('#619c42'),red=foodMaterial('#c94e35'),orange=foodMaterial('#edaa36'),cream=foodMaterial('#fff2cc');
for(const material of [plastic,trim,seal,clear,dark,led,blue,green,red,orange,cream]) installProbeShader(material);
function cylinder(parent:THREE.Object3D,name:string,x:number,y:number,z:number,r:number,h:number,material:THREE.Material,top=r){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,r,h,20),material);mesh.name=`fridge ${name}`;mesh.position.set(x,y+h/2,z);parent.add(mesh);return mesh;
}
function bottle(parent:THREE.Object3D,x:number,y:number,z:number,material:THREE.Material){
  cylinder(parent,'bottle',x,y,z,.105,.37,material,.095);
  cylinder(parent,'bottle shoulder',x,y+.37,z,.095,.08,material,.047);
  cylinder(parent,'bottle cap',x,y+.45,z,.05,.065,blue);
  cylinder(parent,'bottle label',x,y+.1,z,.107,.14,plastic,.103);
}
function bin(parent:THREE.Object3D,name:string,w:number,h:number,d:number,x:number,y:number,z:number){
  box(parent,`${name} floor`,[w,.035,d],[x,y,z]);
  box(parent,`${name} front`,[w,h,.035],[x,y+h/2,z+d/2],clear);
  for(const side of [-1,1]) box(parent,`${name} side`,[.035,h,d],[x+side*w/2,y+h/2,z],clear);
  box(parent,`${name} lip`,[w,.045,.065],[x,y+h,z+d/2],plastic);
}

/** Fitted appliance details in the cabinet's existing outward-facing frame. */
export function addFridgeInterior(group:THREE.Group,unit:ClosetUnit,entry:ClosetEntry,width:number,height:number,depth:number){
  const bottom=-height/2,back=-depth/2+.065,front=depth/2-.57;
  box(group,'molded back liner',[width-.1,height-.09,.085],[0,0,back]);
  for(const side of [-1,1]) {
    box(group,'molded side liner',[.065,height-.1,depth-.18],[side*(width/2-.04),0,-.055]);
    for(let y=bottom+.75;y<height/2-.5;y+=.24)
      box(group,'adjustable shelf socket',[.016,.045,.13],[side*(width/2-.083),y,back+.28],trim,.008);
  }
  const shelfYs=closetShelfHeights(unit,entry).map(y=>y-group.position.y);
  for(const y of shelfYs){
    box(group,'shelf front rim',[width-.14,.065,.075],[0,y,front],plastic);
    for(const side of [-1,1]) box(group,'shelf support rail',[.055,.065,depth-.65],[side*(width/2-.09),y-.04,-.25],trim);
  }
  // A solid freezer divider, separate upper compartment and thermostat housing.
  const top=12.585-group.position.y;
  box(group,'cooling air tower',[.53,2.55,.08],[0,top-1.53,back+.09]);
  for(let i=0;i<7;i++) box(group,'air vent',[.36,.026,.014],[0,top-.49-i*.095,back+.14],dark,.005);
  box(group,'temperature controls',[width-.23,.27,.19],[0,top-.2,back+.18]);
  const dial=cylinder(group,'thermostat dial',.48,top-.22,back+.3,.08,.045,trim);
  dial.rotation.x=Math.PI/2;
  for(let i=0;i<4;i++) box(group,'temperature indicator',[.018,.045,.012],[-.19+i*.08,top-.2,back+.281],i===2?led:dark,.003);
  for(const side of [-1,1]) box(group,'vertical interior light',[.045,top-bottom-.45,.035],[side*(width/2-.095),(top+bottom)/2,back+.32],led);
  // Emissive lining keeps the recess readable without another scene-wide light.
  const crisperY=bottom+.12;
  for(const side of [-1,1]) {
    bin(group,'crisper drawer',width*.43,.64,depth-.68,side*width*.23,crisperY,-.25);
    box(group,'crisper pull',[width*.29,.065,.085],[side*width*.23,crisperY+.51,front+.075]);
    for(let n=0;n<3;n++){
      const fruit=new THREE.Mesh(new THREE.SphereGeometry(.12,16,10),side<0?green:orange);
      fruit.name='fridge crisper produce';fruit.position.set(side*width*.23+(n-1)*.16,crisperY+.16,-.22+n%2*.13);group.add(fruit);
    }
  }
  for(const [i,y0] of shelfYs.entries()) {
    const y=y0+.025;if(i===0||Math.abs(y0+group.position.y-12.585)<.01)continue;
    if(i===1){
      box(group,'cheese container',[.45,.16,.32],[-.4,y+.08,-.15],cream);
      box(group,'container lid',[.48,.035,.35],[-.4,y+.18,-.15],trim);
      for(let n=0;n<3;n++) {cylinder(group,'yogurt pot',.04+n*.24,y,-.15,.09,.2,cream,.11);cylinder(group,'yogurt foil lid',.04+n*.24,y+.2,-.15,.115,.018,blue);}
    } else if(i===2){
      box(group,'milk carton',[.28,.48,.28],[-.45,y+.24,-.2]);
      box(group,'milk label',[.285,.18,.285],[-.45,y+.2,-.2],blue);
      box(group,'milk carton folded top',[.28,.12,.28],[-.45,y+.54,-.2],plastic);
      bottle(group,0,y,-.2,orange);bottle(group,.4,y,-.25,green);
    } else {
      for(let n=0;n<2;n++) {box(group,'food storage tub',[.56,.19,.38],[-.33+n*.67,y+.095,-.18],n?cream:green);box(group,'food tub lid',[.58,.035,.4],[-.33+n*.67,y+.205,-.18],plastic);}
    }
  }
}

/** Closed-pose world placement is attached to the same hinge as the authored front. */
export function addFridgeDoor(entry:ClosetEntry,pivot:THREE.Group,root:THREE.Group){
  if(entry.unitId!=='kitchen-fridge')return;
  const group=new THREE.Group();group.name=`fridge-door-liner:${entry.id}`;
  const w=entry.max[0]-entry.min[0],h=entry.max[1]-entry.min[1];
  group.position.set((entry.min[0]+entry.max[0])/2,(entry.min[1]+entry.max[1])/2,entry.max[2]+.015);
  // Local +Z points into the closed fridge; bins stay behind the decorative face.
  root.add(group);
  box(group,'door insulated liner',[w-.17,h-.15,.075],[0,0,.04]);
  for(const side of [-1,1])box(group,'door rubber gasket',[.035,h-.07,.045],[side*(w/2-.045),0,.014],seal);
  for(const side of [-1,1])box(group,'door rubber gasket',[w-.07,.035,.045],[0,side*(h/2-.045),.014],seal);
  if(h>3) for(const y of [-h/2+.35,-.2,h/2-.95]){
    bin(group,'door storage pocket',w-.43,.32,.32,0,y,.23);
    for(let n=0;n<2;n++)bottle(group,-.28+n*.5,y+.03,.21,n?orange:green);
  }
  root.updateWorldMatrix(true,true);pivot.attach(group);
}
