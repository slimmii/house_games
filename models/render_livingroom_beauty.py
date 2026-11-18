"""Separate presentation scene; the master house and furnishings are untouched."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R))
import photo_props_utils as h
h.P='Living beauty / '
source=bpy.data.scenes['04 | LIVING - Camber perspective']
scene=bpy.data.scenes.new('82 | LIVING - daylight beauty')
for c in source.collection.children:scene.collection.children.link(c)
studio=bpy.data.collections.new('Living beauty / render-only ceiling and lights');scene.collection.children.link(studio);h.COL=studio
scene.world=bpy.data.worlds.new('Living beauty daylight world');scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.72,.80,1,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.22
ceiling=h.mat('soft white ceiling','E6E2D8',.9)
h.box('ceiling',(4.98,4.46,5.09),(4.05,8.32,.04),ceiling,0)
def area(name,loc,target,power,size,color,shape='DISK',sy=None):
 d=bpy.data.lights.new(h.P+name,'AREA');d.energy=power;d.shape=shape;d.size=size;d.color=color
 if sy is not None:d.size_y=sy
 o=bpy.data.objects.new(h.P+name,d);studio.objects.link(o);o.location=loc;h.aim(o,target)
area('broad front-window daylight',(4.4,-.25,4.2),(4.9,4.8,3.0),650,4.6,(.84,.91,1),'RECTANGLE',2.3)
area('soft reflected room light',(3.3,4.5,4.75),(5.9,4.8,3.3),110,3.2,(1,.91,.78))
area('veranda daylight',(4.9,10.1,4.35),(4.4,5.6,3.0),280,3.0,(.91,.97,1))
area('cabinet warm concealed light',(6.65,6.35,4.175),(6.86,6.35,3.25),12,2.8,(1,.68,.36),'RECTANGLE',.03)
d=bpy.data.lights.new(h.P+'low afternoon sun','SUN');d.energy=1.4;d.angle=math.radians(8);d.color=(1,.85,.66)
o=bpy.data.objects.new(h.P+'low afternoon sun',d);studio.objects.link(o);o.location=(1,-6,8);h.aim(o,(5,5,2.4))
d=bpy.data.cameras.new(h.P+'camera');cam=bpy.data.objects.new(h.P+'camera',d);studio.objects.link(cam);scene.camera=cam;d.clip_start=.035;d.lens=24
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1400;scene.render.resolution_y=950;scene.render.resolution_percentage=70
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.2
scene.render.image_settings.file_format='PNG'
bpy.context.window.scene=scene
for index,loc,target,lens in [(1,(2.15,.42,4.10),(5.3,4.1,3.52),23),(2,(3.00,6.38,4.15),(4.80,1.90,3.43),24)]:
 cam.location=loc;h.aim(cam,target);d.lens=lens
 scene.render.filepath=str(R/f'living_beauty_preview_{index}.png');bpy.ops.render.render(write_still=True)
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
 prefs.compute_device_type='METAL';prefs.get_devices();print('DEVICES',[(x.name,x.type) for x in prefs.devices],flush=True)
except Exception as e:print('DEVICES',str(e),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'Livingroom_render_studio.blend'))
