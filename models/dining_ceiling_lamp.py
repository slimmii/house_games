"""Four ring ceiling fitting based on user reference, 2026-09-29."""
import bpy, math, shutil, json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parent
MAIN=R/'Huis_Oude_Terelststraat_15.blend'
backup=R/'Huis_before_dining_ceiling_lamp.blend'
if not backup.exists():shutil.copy2(MAIN,backup)
P='Dining ceiling lamp / '
bpy.context.window.scene=bpy.data.scenes['04 | LIVING - Camber perspective']
bpy.context.view_layer.update()
preserved={o.name:tuple(tuple(r) for r in o.matrix_world) for o in bpy.data.objects if not o.name.startswith(P)}
for o in list(bpy.data.objects):
 if o.name.startswith(P):bpy.data.objects.remove(o,do_unlink=True)
col=bpy.data.collections['01 / Fittings']
table=bpy.data.objects['T / Dining table - estimated 260 x 100']
cx,cy=table.matrix_world.translation.xy
ceiling=5.07
root=bpy.data.objects.new(P+'four rings centered over dining table',None);col.objects.link(root);root.location=(cx,cy,ceiling)
root['reference']='User photograph: four staggered open rings, dark bronze frame, warm white LED, flush ceiling mount'
root['dimensions_status']='Estimated from photograph: approximately 145 x 49 x 12 cm'
def mat(name,color,metal=0):
 m=bpy.data.materials.get(P+name) or bpy.data.materials.new(P+name);m.use_nodes=True;m.diffuse_color=(*color,1)
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=.32
 return m
bronze=mat('dark brushed bronze',(.055,.044,.032),.72)
opal=mat('warm white LED diffuser',(.94,.85,.68));bs=opal.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.76,.43,1);bs.inputs['Emission Strength'].default_value=5
plaster=mat('review ceiling white',(.83,.81,.77))
def mesh(name,verts,faces,material,collection=col,parent=root):
 me=bpy.data.meshes.new(P+name);me.from_pydata(verts,[],faces);me.materials.append(material);me.update()
 ob=bpy.data.objects.new(P+name,me);collection.objects.link(ob);ob.parent=parent
 return ob
def lathe(name,x,y,profile,material):
 n=128;verts=[(x+r*math.cos(math.tau*i/n),y+r*math.sin(math.tau*i/n),z) for r,z in profile for i in range(n)]
 faces=[(j*n+i,j*n+(i+1)%n,((j+1)%len(profile))*n+(i+1)%n,((j+1)%len(profile))*n+i) for j in range(len(profile)) for i in range(n)]
 ob=mesh(name,verts,faces,material)
 for f in ob.data.polygons:f.use_smooth=True
 bevel=ob.modifiers.new('Fine softened metal edges','BEVEL');bevel.width=.001;bevel.segments=3
 ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return ob
lathe('round ceiling canopy',0,0,[(0,-.067),(.136,-.067),(.14,-.061),(.14,-.003),(.135,0),(0,0)],bronze)
# Large, small, large, small rings follow the reference's staggered chain.
rings=[(-.035,-.515,.215),(.035,-.164,.165),(-.035,.19,.22),(.035,.553,.165)]
# Center the complete fitting footprint exactly over the table.
lo=min(y-r for x,y,r in rings);hi=max(y+r for x,y,r in rings);shift=(lo+hi)/2
for i,(x,y,r) in enumerate(rings,1):
 y-=shift;z=-.114+(i%2)*.009
 lathe(f'ring {i} bronze housing',x,y,[(r,z),(r,z+.037),(r-.019,z+.037),(r-.019,z+.004),(r-.023,z),(r-.023,z-.002)],bronze)
 lathe(f'ring {i} luminous underside',x,y,[(r-.003,z-.001),(r-.003,z+.002),(r-.020,z+.002),(r-.020,z-.001)],opal)
 # Warm downward light accompanies the emissive ring surface.
 d=bpy.data.lights.new(P+f'ring {i} warm light','AREA');d.energy=12;d.color=(1,.78,.5);d.shape='DISK';d.size=2*r-.03
 o=bpy.data.objects.new(d.name,d);col.objects.link(o);o.parent=root;o.location=(x,y,z-.008)
# Discreet connecting spine tucked behind the rings and canopy.
verts=[(x,y,z) for z in (-.077,-.062) for y in (-.53,.56) for x in (-.011,.011)]
# Adjacent ring housings connect directly, preserving the open centers.
name='82 | EETTAFEL - plafondlamp met vier ringen'
old=bpy.data.scenes.get(name)
if old:bpy.data.scenes.remove(old)
source=bpy.data.scenes['04 | LIVING - Camber perspective'];sc=bpy.data.scenes.new(name);sc.world=source.world
for c in source.collection.children:sc.collection.children.link(c)
for o in source.collection.objects:
 if o.type=='LIGHT':sc.collection.objects.link(o)
# A review-only ceiling allows the flush mounting to be seen while keeping cutaways open.
review=bpy.data.collections.new(P+'interior ceiling for review');sc.collection.children.link(review)
mesh('review ceiling',[(2.95,.28,5.07),(7.10,.28,5.07),(7.10,8.60,5.07),(2.95,8.60,5.07)],[(3,2,1,0)],plaster,review,None)
cam=bpy.data.objects.new(P+'review camera',bpy.data.cameras.new(P+'review camera'));sc.collection.objects.link(cam)
cam.location=(3.35,3.5,3.65);target=Vector((5.74,6.27,4.08));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=32;sc.camera=cam
sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=True;sc.cycles.device='CPU';sc.render.threads_mode='FIXED';sc.render.threads=8
sc.render.resolution_x=1200;sc.render.resolution_y=1200;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.render.filepath=str(R/'dining_ceiling_lamp.png');sc.view_settings.view_transform='AgX'
bpy.context.window.scene=sc;bpy.context.view_layer.update()
for n,m in preserved.items():assert tuple(tuple(r) for r in bpy.data.objects[n].matrix_world)==m,n
assert abs(root.location.x-cx)<1e-5 and abs(root.location.y-cy)<1e-5
report={'table_center_xy':[cx,cy],'ceiling_height_world_m':ceiling,'ring_count':4,'fixture_length_m':hi-lo,'original_object_transforms_preserved':len(preserved),'dimensions':'Estimated from photograph','scene':name}
(R/'dining_ceiling_lamp_verification.json').write_text(json.dumps(report,indent=2))
text=bpy.data.texts.get('Dining ceiling lamp reference') or bpy.data.texts.new('Dining ceiling lamp reference');text.clear();text.write(json.dumps(report,indent=2))
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(MAIN));bpy.ops.render.render(write_still=True)
print('VERIFIED',json.dumps(report),flush=True)
