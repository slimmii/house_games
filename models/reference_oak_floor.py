"""Apply photo-referenced oak to the continuous first-floor timber surface.

Material/UV-only change: no geometry or collision changes. World-space UVs keep
planks aligned across the kitchen, living room and fitted stair landing.
"""
import bpy
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEXTURE = ROOT / 'textures/reference_oak_floor.png'
MATERIAL = 'Reference floor / warm greige oak wide staggered planks'
UV_NAME = 'ReferenceOakWorldUV'
TARGETS = {
    '1 / floor finish': 'Light timber living-room floor',
    'Kitchen floor finish - continuous with living': 'Light timber living-room floor',
    'Reference spiral / 0 landing timber finish': 'Reference spiral / landing matches floor 1 timber coordinates',
    'Reference spiral / section floor 1': 'Reference spiral / landing matches floor 1 timber coordinates',
}
# Eight planks across the image. Dimensions estimated from photo references.
TILE_WIDTH = 2.24
TILE_LENGTH = 2.0
# Linear material tint keeps the neutral oak from washing out in bright light.
ALBEDO_FACTOR = 0.55
image = bpy.data.images.load(str(TEXTURE), check_existing=True)
image.name = 'Reference floor / warm oak albedo'
image.colorspace_settings.name = 'sRGB'
image.pack()
mat = bpy.data.materials.get(MATERIAL) or bpy.data.materials.new(MATERIAL)
mat.use_nodes = True
mat.diffuse_color = (.36, .28, .21, 1)
nodes = mat.node_tree.nodes
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
shader = nodes.new('ShaderNodeBsdfPrincipled')
shader.inputs['Roughness'].default_value = .64
shader.inputs['Specular IOR Level'].default_value = .25
tex = nodes.new('ShaderNodeTexImage')
tex.image = image
tex.extension = 'REPEAT'
tex.interpolation = 'Linear'
uv = nodes.new('ShaderNodeUVMap')
uv.uv_map = UV_NAME
mat.node_tree.links.new(uv.outputs['UV'], tex.inputs['Vector'])
multiply = nodes.new('ShaderNodeMixRGB')
multiply.blend_type = 'MULTIPLY'
multiply.inputs[0].default_value = 1.0
multiply.inputs[2].default_value = (ALBEDO_FACTOR, ALBEDO_FACTOR, ALBEDO_FACTOR, 1)
mat.node_tree.links.new(tex.outputs['Color'], multiply.inputs[1])
mat.node_tree.links.new(multiply.outputs['Color'], shader.inputs['Base Color'])
mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
uv.location = (-550, 0)
tex.location = (-320, 0)
shader.location = (0, 0)
output.location = (320, 0)
report = {'material': MATERIAL, 'texture': str(TEXTURE), 'uvName': UV_NAME,
          'baseColorFactor': ALBEDO_FACTOR, 'tileSizeMeters': [TILE_WIDTH, TILE_LENGTH], 'plankWidthMeters': TILE_WIDTH/8,
          'longDirection': 'house Y (parallel to craft desk wall)',
          'dimensionsStatus': 'Estimated from reference photos', 'objects': []}
for name, old_material in TARGETS.items():
    obj = bpy.data.objects[name]
    slots = [i for i,m in enumerate(obj.data.materials) if m and m.name in (old_material, MATERIAL)]
    assert slots, f'Missing expected timber material on {name}'
    # Own the UV data so a shared source mesh cannot alter a different room.
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    for i in slots:
        obj.data.materials[i] = mat
    layer = obj.data.uv_layers.get(UV_NAME) or obj.data.uv_layers.new(name=UV_NAME)
    for poly in obj.data.polygons:
        for index in poly.loop_indices:
            point = obj.matrix_world @ obj.data.vertices[obj.data.loops[index].vertex_index].co
            layer.data[index].uv = ((point.x-.30)/TILE_WIDTH, (point.y-.30)/TILE_LENGTH)
    report['objects'].append({'name': name, 'slots': slots, 'vertices': len(obj.data.vertices), 'polygons': len(obj.data.polygons)})
(ROOT / 'reference_oak_floor_verification.json').write_text(json.dumps(report, indent=2)+'\n')
review = bpy.data.scenes['LIVING | reference craft desk']
review.render.filepath = str(ROOT / 'living_reference_oak_floor.png')
if '--save' in sys.argv:
    source = Path(bpy.data.filepath)
    backup = ROOT / 'Huis_before_reference_oak_floor_20261001.blend'
    if not backup.exists():
        shutil.copy2(source, backup)
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
if '--render' in sys.argv:
    bpy.ops.render.render(write_still=True, scene=review.name)
print('REFERENCE_OAK_FLOOR', json.dumps(report), flush=True)
