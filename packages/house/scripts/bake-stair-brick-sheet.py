"""Bake the original stair brick color into one continuous metric sheet.

Export source UV corners for an exact UV repair of the current game mesh.
No source geometry, materials, or Blender file is saved/changed on disk.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
PROJECT=Path(__file__).resolve().parents[1]
NAME='Stair brick - metre-scale curved and planar mapping'
source=bpy.data.materials[NAME]
scene=bpy.data.scenes['01 | HOUSE - exterior'];bpy.context.window.scene=scene;bpy.context.view_layer.update()
corners=[]
for o in scene.objects:
 if o.type!='MESH' or not o.data.uv_layers.get('StairBrickMetres'):continue
 for p in o.data.polygons:
  if p.material_index>=len(o.data.materials) or o.data.materials[p.material_index]!=source:continue
  normal=(o.matrix_world.to_3x3().inverted().transposed()@p.normal).normalized()
  points=[o.matrix_world@o.data.vertices[o.data.loops[i].vertex_index].co for i in p.loop_indices]
  zmin=min(p.z for p in points);zmax=max(p.z for p in points)
  for li,point in zip(p.loop_indices,points):corners.append({'position':list(point),'normal':list(normal),'uv':list(o.data.uv_layers['StairBrickMetres'].data[li].uv),'minZ':zmin,'maxZ':zmax})
assert corners
bounds=[min(p['uv'][0] for p in corners),max(p['uv'][0] for p in corners),min(p['uv'][1] for p in corners),max(p['uv'][1] for p in corners)]
u0=math.floor(bounds[0]*10)/10-.02;u1=math.ceil(bounds[1]*10)/10+.02
v0=math.floor(bounds[2]*10)/10-.02;v1=math.ceil(bounds[3]*10)/10+.02
out=PROJECT/'test-results/fixtures';out.mkdir(exist_ok=True)
(out/'stair-brick-corners.json').write_text(json.dumps({'bounds':[u0,u1,v0,v1],'corners':corners}))
work=bpy.data.scenes.new('Metric stair color bake');bpy.context.window.scene=work
me=bpy.data.meshes.new('Metric brick sheet');me.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0)],[],[(0,1,2,3)]);me.update()
o=bpy.data.objects.new('Metric brick sheet',me);work.collection.objects.link(o)
uv=me.uv_layers.new(name='StairBrickMetres')
for i,p in enumerate([(u0,v0),(u1,v0),(u1,v1),(u0,v1)]):uv.data[i].uv=p
bakeUV=me.uv_layers.new(name='SheetUV');me.uv_layers.active=bakeUV;bakeUV.active_render=True
for i,p in enumerate([(0,0),(1,0),(1,1),(0,1)]):bakeUV.data[i].uv=p
mat=source.copy();mat.name='Stair metric color sheet bake';me.materials.append(mat)
nodes=mat.node_tree.nodes;links=mat.node_tree.links
base=next(n for n in nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].links[0].from_socket
emission=nodes.new('ShaderNodeEmission');links.new(base,emission.inputs['Color'])
output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');links.new(emission.outputs[0],output.inputs['Surface'])
image=bpy.data.images.new('Stair brick continuous metric albedo',width=4096,height=4096,alpha=False)
image.colorspace_settings.name='sRGB'
target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
bpy.context.view_layer.objects.active=o;o.select_set(True)
work.render.engine='CYCLES';work.cycles.device='CPU';work.cycles.samples=1;work.render.threads_mode='FIXED';work.render.threads=8
bpy.ops.object.bake(type='EMIT',margin=0,use_clear=True)
image.filepath_raw=str(PROJECT/'public/models/stair-brick-continuous.png');image.file_format='PNG';image.save()
print('STAIR_SHEET',json.dumps({'corners':len(corners),'bounds':[u0,u1,v0,v1],'image':[4096,4096]}),flush=True)
