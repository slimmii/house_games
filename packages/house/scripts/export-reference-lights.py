"""Incremental export of source fixtures and lighting definitions; never saves .blend."""
import bpy,json,sys
from pathlib import Path
from mathutils import Matrix,Vector
PROJECT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PROJECT/'scripts'))
from ceiling_levels import level_first_floor_ceiling
PREFIX='Reference lighting / '
scene=bpy.data.scenes['01 | HOUSE - exterior'];bpy.context.window.scene=scene
level_first_floor_ceiling([o for o in scene.objects if o.name.startswith(PREFIX)])
bpy.context.view_layer.update()
objects=[o for o in scene.objects if o.name.startswith(PREFIX) and o.type=='MESH']
lights=[]
def game(v,scale=3):return [round(v.x*scale,6),round(v.z*scale,6),round(-v.y*scale,6)]
for o in scene.objects:
    if o.type!='LIGHT' or not o.get('game_light'):continue
    d=o.data;direction=o.matrix_world.to_quaternion()@Vector((0,0,-1))
    item={'name':o.name,'type':d.type.lower(),'position':game(o.matrix_world.translation),'direction':game(direction,1),'color':list(d.color)}
    if d.type=='AREA':
        item.update(width=d.size*3,height=d.size_y*3,intensity=o['game_area_intensity'],right=game(o.matrix_world.to_quaternion()@Vector((1,0,0)),1))
    else:item.update(intensity=o['game_candela'],distance=o['game_range_m']*3,angle=d.spot_size/2,penumbra=d.spot_blend)
    lights.append(item)
# 57 reference fixture meshes; 16 reference lights plus the lamps from game_light_fixtures.py.
GAME_LIGHTS=sum(1 for o in scene.objects if o.type=='LIGHT' and o.get('game_light') and o.name.startswith('Game lighting / '))
assert len(objects)==57 and len(lights)==16+GAME_LIGHTS,(len(objects),len(lights),GAME_LIGHTS)
(PROJECT/'src/client/house-light-fixtures.json').write_text(json.dumps(sorted(lights,key=lambda x:x['name']),indent=2)+'\n')
bpy.ops.object.select_all(action='DESELECT')
for o in objects:
    o.matrix_world=Matrix.Scale(3,4)@o.matrix_world;o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(PROJECT/'test-results/fixtures/reference-lights.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_cameras=False,export_lights=False,export_extras=False,export_materials='EXPORT',export_image_format='AUTO',export_attributes=False)
print('EXPORTED_REFERENCE_LIGHTS',len(objects),len(lights),flush=True)
