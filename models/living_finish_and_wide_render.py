import bpy,sys,math,shutil
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R))
import photo_props_utils as h
main=R/'Huis_Oude_Terelststraat_15.blend'
backup=R/'Huis_before_tv_feet_and_ceiling_trim.blend'
if not backup.exists():shutil.copy2(main,backup)
bpy.context.window.scene=bpy.data.scenes['01 | HOUSE - exterior'];bpy.context.view_layer.update()
for name in ['TV foot','TV foot.001']:
 o=bpy.data.objects.get(name)
 if o:bpy.data.objects.remove(o,do_unlink=True)
h.COL=bpy.data.collections['01 / Camber'];h.P='Camber ceiling finish / '
for o in list(bpy.data.objects):
 if o.name.startswith('Camber drawing / 61 mm top finishing strip'):
  pts=[o.matrix_world@Vector(v) for v in o.bound_box]
  lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
  h.box('white fascia '+o.name.split('strip')[-1],((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(hi[2]+5.07)/2),(hi[0]-lo[0],hi[1]-lo[1],5.07-hi[2]),o.data.materials[0],.0004)
  print('TRIM',lo,hi,'to',5.07,flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(main))
source=bpy.data.scenes['04 | LIVING - Camber perspective'];s=bpy.data.scenes.new('83 | LIVING - stairs and windows')
for c in source.collection.children:s.collection.children.link(c)
for name in ['00 / Stair','01 / Stair','02 / Stair','01 / Walls front']:
 s.collection.children.link(bpy.data.collections[name])
studio=bpy.data.collections.new('Living wide / presentation');s.collection.children.link(studio);h.COL=studio;h.P='Living wide / '
s.world=bpy.data.worlds.new('Living wide daylight');s.world.use_nodes=True
s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.72,.80,1,1)
s.world.node_tree.nodes.get('Background').inputs[1].default_value=.4
white=h.mat('ceiling white','F0EFEB',.9)
h.box('living ceiling',(4.975,4.46,5.09),(3.95,8.32,.04),white,0)
h.box('office ceiling',(1.665,1.72,5.09),(2.67,2.84,.04),white,0)
h.box('rear ceiling',(1.665,6.95,5.09),(2.67,3.38,.04),white,0)
def area(name,loc,target,power,size,col):
 d=bpy.data.lights.new(h.P+name,'AREA');d.energy=power;d.size=size;d.color=col
 o=bpy.data.objects.new(h.P+name,d);studio.objects.link(o);o.location=loc;h.aim(o,target)
area('front daylight',(4,-.4,4.3),(4.3,4.8,3),750,4.5,(.84,.91,1))
area('soft bounce',(4,5,4.85),(4,2,3),150,3,(1,.92,.82))
area('veranda daylight',(5,10.3,4.4),(4,5.3,3),350,3,(.9,.96,1))
area('cabinet LED',(6.65,6.35,4.175),(6.86,6.35,3.25),12,2.8,(1,.68,.36))
d=bpy.data.lights.new(h.P+'sun','SUN');d.energy=1.3;d.angle=math.radians(8)
o=bpy.data.objects.new(h.P+'sun',d);studio.objects.link(o);o.location=(1,-6,8);h.aim(o,(5,5,2.4))
d=bpy.data.cameras.new(h.P+'camera');cam=bpy.data.objects.new(h.P+'camera',d);studio.objects.link(cam);s.camera=cam;d.clip_start=.025
s.render.engine='BLENDER_EEVEE';s.render.resolution_x=1100;s.render.resolution_y=760;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.render.image_settings.file_format='PNG'
bpy.context.window.scene=s
for i,loc,target,lens in [(1,(6.25,8.0,4.12),(3.4,2.1,3.65),22),(2,(5.9,5.65,4.12),(3.25,1.4,3.55),20)]:
 cam.location=loc;h.aim(cam,target);d.lens=lens;s.render.filepath=str(R/f'living_wide_preview_{i}.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'Livingroom_wide_render_studio.blend'))
