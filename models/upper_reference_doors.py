"""Restyle every second-floor internal door from the user's pale-oak reference photo."""
import bpy
import math
from mathutils import Vector
from pathlib import Path


def update_upper_reference_doors():
    floor_z = 5.31
    joinery = bpy.data.collections['02 / Joinery']

    # Replace all earlier upper-floor door leaves and the two detailed cloned doors.
    for obj in list(joinery.objects):
        if obj.name.startswith(('Upper bedroom door', 'Bedroom 3 door',
                                'Upper correction / storage', 'Upper correction / bathroom',
                                'Upper reference door /')):
            bpy.data.objects.remove(obj, do_unlink=True)

    def material(name, color, roughness=.5, metallic=0.0):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Base Color'].default_value = color
        shader.inputs['Roughness'].default_value = roughness
        shader.inputs['Metallic'].default_value = metallic
        links.new(shader.outputs['BSDF'], out.inputs['Surface'])
        mat.diffuse_color = color
        return mat

    # The material is reconstructed from the supplied photograph, then packed into
    # the .blend.  Separate orientations reproduce horizontal leaf/head grain and
    # vertical grain on the upright casing, as visible in the reference.
    texture_path = Path(__file__).with_name('upper_door_pale_oak_texture.png')
    image = bpy.data.images.get('Upper door - photo oak texture')
    if image is None:
        image = bpy.data.images.load(str(texture_path), check_existing=True)
        image.name = 'Upper door - photo oak texture'
    if not image.packed_file:
        image.pack()

    def oak_material(name, vertical=False):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        coord = nodes.new('ShaderNodeTexCoord')
        separate = nodes.new('ShaderNodeSeparateXYZ')
        combine = nodes.new('ShaderNodeCombineXYZ')
        tex = nodes.new('ShaderNodeTexImage')
        gray = nodes.new('ShaderNodeRGBToBW')
        bump = nodes.new('ShaderNodeBump')
        tex.image = image
        tex.extension = 'REPEAT'
        tex.interpolation = 'Linear'
        shader.inputs['Roughness'].default_value = .54
        bump.inputs['Strength'].default_value = .16
        bump.inputs['Distance'].default_value = .0012
        links.new(coord.outputs['Generated'], separate.inputs['Vector'])
        if vertical:
            links.new(separate.outputs['Z'], combine.inputs['X'])
            links.new(separate.outputs['X'], combine.inputs['Y'])
        else:
            links.new(separate.outputs['X'], combine.inputs['X'])
            links.new(separate.outputs['Z'], combine.inputs['Y'])
        links.new(combine.outputs['Vector'], tex.inputs['Vector'])
        links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        links.new(tex.outputs['Color'], gray.inputs['Color'])
        links.new(gray.outputs['Val'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], shader.inputs['Normal'])
        links.new(shader.outputs['BSDF'], out.inputs['Surface'])
        mat.diffuse_color = (.68, .66, .62, 1)
        return mat

    oak_horizontal = oak_material('Upper doors - photo oak horizontal')
    oak_vertical = oak_material('Upper doors - photo oak vertical', True)

    nickel = material('Upper doors - satin nickel hardware', (.43, .46, .48, 1), .24, .88)
    reveal = material('Upper doors - fine charcoal reveal', (.035, .032, .028, 1), .55)
    key_dark = material('Upper doors - dark key escutcheon', (.055, .048, .041, 1), .37, .25)

    def make_door(label, center, width, angle, wall_depth):
        ca, sa = math.cos(angle), math.sin(angle)

        def point(u, v, z):
            return Vector((center[0] + ca*u - sa*v, center[1] + sa*u + ca*v, z))

        def box(part, u, v, z, w, d, h, mat=oak_horizontal, bevel=.0025):
            bpy.ops.mesh.primitive_cube_add(size=1, location=point(u, v, z))
            obj = bpy.context.object
            obj.name = f'Upper reference door / {label} / {part}'
            obj.dimensions = (w, d, h)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            obj.rotation_euler.z = angle
            for col in list(obj.users_collection):
                col.objects.unlink(obj)
            joinery.objects.link(obj)
            obj.data.materials.append(mat)
            if bevel:
                mod = obj.modifiers.new('Soft furniture edge', 'BEVEL')
                mod.width = bevel
                mod.segments = 3
            return obj

        def rod(part, a, b, radius, mat=nickel, vertices=32):
            a, b = point(*a), point(*b)
            bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
                                                depth=(b-a).length, location=(a+b)/2)
            obj = bpy.context.object
            obj.name = f'Upper reference door / {label} / {part}'
            obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
            for col in list(obj.users_collection):
                col.objects.unlink(obj)
            joinery.objects.link(obj)
            obj.data.materials.append(mat)
            edge = obj.modifiers.new('Machined edge', 'BEVEL')
            edge.width = .0013
            edge.segments = 2
            return obj

        # Narrow shadow gaps around the leaf, frame and flush furniture-like casings.
        leaf_width = width-.10
        for u in (-leaf_width/2-.010, leaf_width/2+.010):
            box('dark reveal jamb', u, 0, floor_z+1.015, .018, .048, 2.025, reveal, .001)
        box('dark reveal head', 0, 0, floor_z+2.025, leaf_width+.038, .048, .018, reveal, .001)
        for u in (-width/2+.023, width/2-.023):
            box('frame jamb', u, 0, floor_z+1.023, .046, wall_depth+.018, 2.046, oak_vertical)
        box('frame head', 0, 0, floor_z+2.047, width, wall_depth+.018, .046, oak_horizontal)
        for side in (-1, 1):
            v = side*(wall_depth/2+.014)
            for u in (-width/2-.014, width/2+.014):
                box('flat casing upright', u, v, floor_z+1.04, .074, .023, 2.08, oak_vertical)
            box('flat casing head', 0, v, floor_z+2.094, width+.102, .023, .074, oak_horizontal)

        leaf_depth = .042
        leaf = box('flush pale oak leaf', 0, 0, floor_z+1.015,
                   leaf_width, leaf_depth, 2.01, oak_horizontal, .003)
        leaf['reference'] = 'User photo: pale grey horizontal oak, flush leaf, matching flat casing and satin nickel lever.'
        leaf['floor'] = 'highest / second floor'
        leaf['finish'] = 'photo-derived pale greige oak texture packed into the .blend'

        # Reference arrangement: hinges right, handle and key escutcheon left.
        hinge_u = -leaf_width/2+.018
        for z in (.25, 1.02, 1.79):
            rod('right hinge', (hinge_u, -.047, floor_z+z-.035),
                (hinge_u, -.047, floor_z+z+.035), .0085)
        handle_u = leaf_width/2-.145
        for side in (-1, 1):
            v = side*(leaf_depth/2+.007)
            rod('round handle rose', (handle_u, v, floor_z+1.015),
                (handle_u, v+side*.011, floor_z+1.015), .028)
            rod('handle spindle', (handle_u, v, floor_z+1.015),
                (handle_u, v+side*.055, floor_z+1.015), .009)
            rod('straight satin lever', (handle_u, v+side*.055, floor_z+1.015),
                (handle_u+.125, v+side*.055, floor_z+1.015), .009)
            rod('dark round key escutcheon', (handle_u, v, floor_z+.855),
                (handle_u, v+side*.009, floor_z+.855), .021, key_dark)
            box('key slot', handle_u, v+side*.010, floor_z+.855,
                .004, .002, .014, reveal, .0005)

    doors = [
        ('Bedroom 1', (2.84, 3.79), .78, math.pi/2, .14),
        ('Bedroom 2', (2.84, 5.51), .78, math.pi/2, .14),
        ('Bedroom 3', (2.25, 3.29), .80, 0, .10),
        ('Storage', (1.855, 5.81), .76, math.pi/2, .11),
        ('Bathroom', (2.27, 6.49), .80, 0, .10),
    ]
    for args in doors:
        make_door(*args)

    # A dedicated inspection scene focuses on one complete door at eye level.
    scene_name = '20 | UPPER DOORS - pale oak reference'
    legacy = bpy.data.scenes.get('17 | UPPER DOORS - pale oak reference')
    if legacy:
        bpy.data.scenes.remove(legacy)
    old = bpy.data.scenes.get(scene_name)
    if old:
        bpy.data.scenes.remove(old)
    source = bpy.data.scenes.get('12 | UPPER FLOOR - corrected complete layout') or bpy.context.scene
    scene = source.copy()
    scene.name = scene_name
    scene.use_fake_user = True
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 1350
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world.color = (.055, .055, .055)

    cam_data = bpy.data.cameras.new('Upper pale oak door camera')
    cam = bpy.data.objects.new('Upper pale oak door camera', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (1.42, 3.79, floor_z+1.38)
    target = Vector((2.84, 3.79, floor_z+1.10))
    cam.rotation_euler = (target-Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 42
    scene.camera = cam

    light_data = bpy.data.lights.new('Upper door softbox', 'AREA')
    light_data.energy = 500
    light_data.shape = 'RECTANGLE'
    light_data.size = 1.25
    light_data.size_y = 1.8
    light = bpy.data.objects.new('Upper door softbox', light_data)
    scene.collection.objects.link(light)
    light.location = (1.65, 3.1, floor_z+2.25)
    light.rotation_euler = (target-Vector(light.location)).to_track_quat('-Z', 'Y').to_euler()

    scene['reference'] = 'User-provided door showroom photograph, September 2026.'
    scene['scope'] = 'All five internal doors on the highest floor.'
    print('UPPER REFERENCE DOORS:', len(doors), 'doors rebuilt', flush=True)
    return scene


if __name__ == '__main__':
    scene = update_upper_reference_doors()
    output = bpy.path.abspath('//upper_doors_pale_oak_reference.png')
    scene.render.filepath = output
    bpy.context.window.scene = scene
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    print('SAVED:', bpy.data.filepath, flush=True)
    print('RENDERED:', output, flush=True)
