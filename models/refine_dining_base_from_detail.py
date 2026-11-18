"""Refine table steel cross frame and square tapered chair legs from detail photo."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent;P='Dining photo / ';F=2.41
col=bpy.data.collections['01 / Furniture'];t=bpy.data.objects['T / Dining table - estimated 260 x 100'];cx,cy=t.location.xy;top=t.location.z+t.dimensions.z/2
for o in list(bpy.data.objects):
 if o.name.startswith(P) and any(k in o.name for k in ['spider','central steel hub','table floor protector','splayed wooden leg','cross frame','connector','fixing bolt','top mounting','square tapered']):bpy.data.objects.remove(o,do_unlink=True)
dark=bpy.data.materials[P+'satin black metal'];wood=bpy.data.materials[P+'natural oak legs']
parent=bpy.data.objects.new(P+'cross frame - four broad rectangular beams',None);col.objects.link(parent);parent.location=(cx,cy,F)
def mesh(name,vs,fs,m,p=parent,bev=.0015):
 me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.materials.append(m);me.update();o=bpy.data.objects.new(P+name,me);col.objects.link(o);o.parent=p
 if bev:
  b=o.modifiers.new('Subtle edge radius','BEVEL');b.width=bev;b.segments=3;o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o
def box(name,loc,size,m=dark,p=parent,bev=.002):
 vs=[(loc[0]+x*size[0]/2,loc[1]+y*size[1]/2,loc[2]+z*size[2]/2) for z in (-1,1) for y in (-1,1) for x in (-1,1)]
 return mesh(name,vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],m,p,bev)
faces=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
for sx in (-1,1):
 for sy in (-1,1):
  a=Vector((sx*.34,sy*.71,.012));b=Vector((-sx*.31,-sy*.70,top-F-.033));d=b-a;h=Vector((d.x,d.y,0)).normalized();side=Vector((-h.y,h.x,0));extent=.112/(2*abs(d.normalized().z))
  vs=[tuple(c+h*u*extent+side*v*.030) for c in (a,b) for v in (-1,1) for u in (-1,1)]
  ob=mesh('cross frame straight steel beam',vs,faces,dark);ob['section_estimated_m']=[.112,.060]
  box('top mounting plate',(b.x,b.y,top-F-.033),(.20,.18,.008))
# Bolted connection plates at the central crossing.
for sy in (-1,1):
 box('connector plate',(0,sy*.082,.386),(.088,.009,.228),bev=.008)
 for z in (.308,.464):
  n=24;vs=[(.009*math.cos(i*math.tau/n),sy*(.091+dep),z+.009*math.sin(i*math.tau/n)) for dep in (0,.005) for i in range(n)]
  fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  mesh('fixing bolt head',vs,fs,dark,bev=.0007)
# Reference shows slightly tapered square timber sections, not cylindrical rods.
for cr in [o for o in bpy.data.objects if o.type=='EMPTY' and o.name.startswith(P+'chair ')]:
 for sx in (-1,1):
  for sy in (-1,1):
   a=Vector((sx*.22,sy*.205,.012));b=Vector((sx*.14,sy*.145,.43))
   vs=[tuple(c+Vector((dx*w/2,dy*w/2,0))) for c,w in ((a,.026),(b,.044)) for dy in (-1,1) for dx in (-1,1)]
   mesh(cr.name.removeprefix(P)+' square tapered oak leg',vs,faces,wood,cr,.002)
parent['reference']='User underside detail: four broad rectangular black beams meeting in central crossing, connector plates and paired bolts'
report={'steel_section_estimated_m':[.112,.060],'base_footprint_estimated_m':[.79,1.66],'shape':'four full diagonal rectangular beams crossing centrally, clipped flat at floor and tabletop','chairs_legs':'square tapered oak sections'}
(R/'dining_base_detail_verification.json').write_text(json.dumps(report,indent=2))
s=bpy.data.scenes['83 | EETTAFEL - tafel en kuipstoelen naar foto'];bpy.context.window.scene=s;bpy.context.view_layer.update()
# Clip only the overhead camera above the tabletop, keeping the lamp intact in all other views.
bpy.data.scenes['84 | EETTAFEL - gebogen bladvorm'].camera.data.clip_start=3.6
keyscene=bpy.data.scenes['85 | LIVING - keyboard en bakjesrek achter zetel']
keyscene.camera.location=(4.45,5.6,4.04);keyscene.camera.rotation_euler=(Vector((4.4,3.3,2.96))-keyscene.camera.location).to_track_quat('-Z','Y').to_euler();keyscene.camera.data.lens=33;keyscene.camera.data.clip_start=1.05
name='86 | EETTAFEL - detail zwart kruisonderstel'
old=bpy.data.scenes.get(name)
if old:bpy.data.scenes.remove(old)
detail=s.copy();detail.name=name;detail.use_fake_user=True;detail.camera=s.camera.copy();detail.camera.data=s.camera.data.copy();detail.collection.objects.link(detail.camera)
detail.camera.location=(4.63,6.83,2.85);detail.camera.rotation_euler=(Vector((5.77,6.30,2.80))-detail.camera.location).to_track_quat('-Z','Y').to_euler();detail.camera.data.lens=29
detail.render.resolution_x=1300;detail.render.resolution_y=1050;detail.render.filepath=str(R/'dining_cross_frame_detail.png')
bpy.ops.wm.save_as_mainfile(filepath=str(R/'Huis_Oude_Terelststraat_15.blend'))
for scname in ['83 | EETTAFEL - tafel en kuipstoelen naar foto','84 | EETTAFEL - gebogen bladvorm','85 | LIVING - keyboard en bakjesrek achter zetel','86 | EETTAFEL - detail zwart kruisonderstel']:
 sc=bpy.data.scenes[scname];bpy.context.window.scene=sc;bpy.ops.render.render(write_still=True,scene=sc.name)
print('DETAIL REFINEMENT SAVED',flush=True)
