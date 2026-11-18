"""White shallow-drum kitchen pendant reconstructed from the user's photo."""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent
MAIN=R/'Huis_Oude_Terelststraat_15.blend'
backup=R/'Huis_before_kitchen_photo_pendant.blend'
if not backup.exists():shutil.copy2(MAIN,backup)
P='Kitchen photo pendant / '
for o in list(bpy.data.objects):
    if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
bpy.context.window.scene=bpy.data.scenes['05 | KITCHEN - shaped table and bench']
bpy.context.view_layer.update()
preserved={o.name:tuple(tuple(row) for row in o.matrix_world) for o in bpy.data.objects}
col=bpy.data.collections['01 / Fittings']
table=bpy.data.objects['Kitchen organic stone tabletop']
pts=[table.matrix_world@v.co for v in table.data.vertices]
cx=(min(v.x for v in pts)+max(v.x for v in pts))/2
cy=(min(v.y for v in pts)+max(v.y for v in pts))/2
tabletop=max(v.z for v in pts);bottom=tabletop+.80;ceiling=4.85
def material(name,rgb,roughness):
    m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True
    m.diffuse_color=(*rgb,1);bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=roughness
    return m
white=material('matte warm white painted metal',(.82,.80,.75),.46)
cord=material('white textile cord',(.72,.71,.66),.86)
diffuser=material('warm opal diffuser',(.95,.91,.82),.4)
bs=diffuser.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.84,.65,1);bs.inputs['Emission Strength'].default_value=3
def lathe(name,profile,mat):
    N=96;vs=[];fs=[]
    for r,z in profile:vs.extend([(cx+r*math.cos(math.tau*i/N),cy+r*math.sin(math.tau*i/N),z) for i in range(N)])
    for j in range(len(profile)-1):
        for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    me=bpy.data.meshes.new(P+name);me.from_pydata(vs,[],fs);me.update();me.materials.append(mat)
    o=bpy.data.objects.new(P+name,me);col.objects.link(o)
    for p in me.polygons:p.use_smooth=True
    return o
# Photo: flat, broad round shade with softly rounded corners, not a cone.
lathe('shallow drum shade',[(0,bottom+.086),(.185,bottom+.086),(.196,bottom+.083),(.200,bottom+.077),(.200,bottom+.010),(.198,bottom+.004),(.194,bottom+.002),(.190,bottom+.006),(.190,bottom+.072),(0,bottom+.072)],white)
lathe('opal underside disc',[(0,bottom+.001),(.190,bottom+.001),(.195,bottom+.003),(.195,bottom+.007),(.190,bottom+.010),(0,bottom+.010)],diffuser)
lathe('top cable stem',[(0,bottom+.086),(.024,bottom+.086),(.024,bottom+.139),(.019,bottom+.143),(0,bottom+.143)],white)
lathe('strain relief',[(0,bottom+.143),(.009,bottom+.143),(.009,bottom+.161),(0,bottom+.161)],white)
lathe('slim suspension cord',[(0,bottom+.160),(.0022,bottom+.160),(.0022,ceiling-.078),(0,ceiling-.078)],cord)
lathe('ceiling canopy',[(0,ceiling-.083),(.052,ceiling-.083),(.060,ceiling-.078),(.061,ceiling-.005),(.057,ceiling),(0,ceiling)],white)
lathe('canopy cable gland',[(0,ceiling-.092),(.006,ceiling-.092),(.006,ceiling-.082),(0,ceiling-.082)],white)
data=bpy.data.lights.new(P+'warm downlight','AREA');data.energy=28;data.shape='DISK';data.size=.365;data.color=(1,.84,.67)
light=bpy.data.objects.new(P+'warm downlight',data);col.objects.link(light);light.location=(cx,cy,bottom-.005)
# Keep existing kitchen scenes intact; the physical fitting is shared by all
# first-floor views. A new review scene includes their existing soft lighting.
name='75 | KITCHEN - photo pendant above table'
old=bpy.data.scenes.get(name)
if old:bpy.data.scenes.remove(old)
source=bpy.data.scenes['05 | KITCHEN - shaped table and bench']
scene=bpy.data.scenes.new(name);scene.world=source.world
for c in source.collection.children:scene.collection.children.link(c)
for o in source.collection.objects:
    if o.type=='LIGHT':scene.collection.objects.link(o)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new(P+'review camera');cam=bpy.data.objects.new(P+'review camera',camdata);scene.collection.objects.link(cam)
cam.location=(1.45,7.22,4.10);camdata.lens=25;camdata.clip_start=.025;aim(cam,(1.85,9.54,3.85));scene.camera=cam
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(R/'kitchen_photo_pendant.png')
bpy.context.window.scene=scene;bpy.context.view_layer.update()
for n,m in preserved.items():assert tuple(tuple(row) for row in bpy.data.objects[n].matrix_world)==m,n
assert bottom>tabletop and bottom+.161<ceiling-.092
report={'center_xy':[cx,cy],'shade_diameter_m':.40,'shade_height_m':.086,'tabletop_z':tabletop,'diffuser_bottom_z':bottom,'clearance_above_table_m':.80,'ceiling_z':ceiling,'dimensions':'Estimated from user photograph','preserved_objects':len(preserved)}
(R/'kitchen_photo_pendant_verification.json').write_text(json.dumps(report,indent=2))
note=bpy.data.texts.get('Kitchen pendant - photo reference') or bpy.data.texts.new('Kitchen pendant - photo reference');note.clear();note.write(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN));bpy.ops.render.render(write_still=True)
print('VERIFIED',json.dumps(report),flush=True)
