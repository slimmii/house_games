"""Ground-floor shower room reconstructed from user photos and the plan crop.

The measured plan controls the 1.80 x 1.62 m clear room and 80 cm doorway.
Photographs control the fittings and finishes; unsupplied dimensions are estimates.
Run on the current house blend or import update_ground_bathroom_photo from build_house.py.
"""
import bpy, math, json, shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
P = 'Ground bathroom photo / '


def update_ground_bathroom_photo():
    ground = bpy.data.collections['00 | GROUND - 2021']
    fittings = bpy.data.collections['00 / Fittings']
    joinery = bpy.data.collections['00 / Joinery']

    old = bpy.data.collections.get('00 / Ground bathroom - photo reconstruction')
    if old:
        for ob in list(old.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        for scene in list(bpy.data.scenes):
            if old.name in scene.collection.children:
                scene.collection.children.unlink(old)
        for parent in list(bpy.data.collections):
            if old.name in parent.children:
                parent.children.unlink(old)
        bpy.data.collections.remove(old)
    col = bpy.data.collections.new('00 / Ground bathroom - photo reconstruction')
    ground.children.link(col)

    # Remove the original diagrammatic sanitary blocks and flat door leaf.
    exact = {
        'WC cistern.001', 'WC pedestal.001', 'WC bowl.001', 'WC seat.001',
        'Vanity.001', 'Basin.001', 'Tap.001', 'Shower tray', 'Shower glass',
        'Shower internal door', 'Bedroom internal door'
    }
    for ob in list(bpy.data.objects):
        if ob.name in exact or ob.name.startswith(P):
            bpy.data.objects.remove(ob, do_unlink=True)

    def rgb(value):
        value = value.lstrip('#')
        return tuple((int(value[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4)) + (1,)

    def mat(name, colour, rough=.55, metal=0, transmission=0):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.diffuse_color = rgb(colour)
        m.use_nodes = True
        nodes = m.node_tree.nodes; links = m.node_tree.links
        bs = nodes.get('Principled BSDF') or nodes.new('ShaderNodeBsdfPrincipled')
        output = nodes.get('Material Output') or nodes.new('ShaderNodeOutputMaterial')
        if not any(link.to_node == output and link.to_socket == output.inputs['Surface'] for link in links):
            links.new(bs.outputs['BSDF'], output.inputs['Surface'])
        bs.inputs['Base Color'].default_value = rgb(colour)
        bs.inputs['Roughness'].default_value = rough
        bs.inputs['Metallic'].default_value = metal
        bs.inputs['Transmission Weight'].default_value = transmission
        if transmission:
            bs.inputs['IOR'].default_value = 1.45
        return m

    plaster = bpy.data.materials.get('Warm white plaster') or mat('Warm white plaster', 'EEECE6', .8)
    white = bpy.data.materials.get('Camber - premium white matt W1000 ST9') or mat('Bathroom door warm white', 'F2F0EA', .42)
    ceramic = bpy.data.materials.get('Sanitary ceramic') or mat('Sanitary ceramic', 'F7F6F1', .18)
    chrome = bpy.data.materials.get('Door - brushed nickel hardware') or mat('Ground bathroom - chrome', 'C8CCCD', .19, .82)
    dark = bpy.data.materials.get('Door - dark reveal and key slot') or mat('Ground bathroom - dark reveal', '25282A', .45, .25)
    oak = mat('Ground bathroom - pale oak vanity', 'B99770', .48)
    tile = mat('Ground bathroom - warm beige large wall tile', 'D1C5B5', .72)
    floor = mat('Ground bathroom - pale wood-look floor tile', 'BDAA91', .66)
    frosted = mat('Ground bathroom - frosted shower glass', 'DDE6E3', .24, 0, .55)
    mirror = mat('Ground bathroom - mirror', 'C9D0CF', .055, .9)
    shadow = mat('Ground bathroom - recess shadow', '343638', .85)

    # Subtle procedural variation makes the photographed neutral surfaces legible.
    for m, c1, c2, scale in ((oak, '8E6F50', 'C6A783', 5.5), (floor, 'A8957C', 'D2C1A7', 7.5)):
        n = m.node_tree.nodes; l = m.node_tree.links; bs = n.get('Principled BSDF')
        for node in list(n):
            if node != bs and node.type != 'OUTPUT_MATERIAL':
                n.remove(node)
        tex = n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = scale
        tex.inputs['Detail'].default_value = 2.2; tex.inputs['Roughness'].default_value = .62
        ramp = n.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = rgb(c1); ramp.color_ramp.elements[1].color = rgb(c2)
        l.new(tex.outputs['Fac'], ramp.inputs[0]); l.new(ramp.outputs['Color'], bs.inputs['Base Color'])

    def move(ob, collection=col):
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        collection.objects.link(ob)
        return ob

    def box(name, x0, x1, y0, y1, z0, z1, material=white, bevel=0, collection=col):
        bpy.ops.mesh.primitive_cube_add(size=1, location=((x0+x1)/2, (y0+y1)/2, (z0+z1)/2))
        ob = bpy.context.object; ob.name = P + name; ob.dimensions = (x1-x0, y1-y0, z1-z0)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        move(ob, collection); ob.data.materials.append(material)
        if bevel:
            mod = ob.modifiers.new('Soft manufactured edge', 'BEVEL'); mod.width = bevel; mod.segments = 3
        return ob

    def cyl(name, loc, radius, depth, material=chrome, axis='Z', vertices=32, collection=col):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
        ob = bpy.context.object; ob.name = P + name
        if axis == 'X': ob.rotation_euler.y = math.pi/2
        if axis == 'Y': ob.rotation_euler.x = math.pi/2
        move(ob, collection); ob.data.materials.append(material)
        return ob

    def rod(name, a, b, radius=.008, material=chrome, collection=col):
        a, b = Vector(a), Vector(b)
        ob = cyl(name, (a+b)/2, radius, (b-a).length, material, 'Z', 24, collection)
        ob.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
        return ob

    def parent_keep(ob, parent):
        matrix = ob.matrix_world.copy(); ob.parent = parent; ob.matrix_world = matrix

    # Room finish follows the plan: internal clear size approximately 1.80 x 1.62 m.
    box('continuous wood-look tile floor', 3.00, 5.05, 3.94, 5.75, .001, .014, floor, .002)
    # Large beige slabs on the wet walls. Fine grout strips align to 60 cm modules.
    box('south wet-wall tile field', 3.00, 5.05, 3.942, 3.954, .015, 2.15, tile)
    box('west WC and shower tile field', 2.992, 3.004, 3.94, 5.75, .015, 2.15, tile)
    for x in (3.60, 4.20, 4.80):
        box('south tile vertical grout', x-.002, x+.002, 3.936, 3.958, .02, 2.145, plaster)
    for z in (.72, 1.42):
        box('south tile horizontal grout', 3.01, 5.04, 3.936, 3.958, z-.002, z+.002, plaster)
        box('west tile horizontal grout', 2.988, 3.008, 3.95, 5.74, z-.002, z+.002, plaster)

    # 90 x 90 cm corner shower in the south-west, as dimensioned on the plan.
    box('square shower tray', 3.055, 3.955, 3.985, 4.885, .016, .066, ceramic, .012)
    box('shower tray inner floor', 3.085, 3.925, 4.015, 4.855, .066, .078, ceramic, .025)
    cyl('shower drain', (3.785, 4.135, .081), .047, .006, chrome)
    # Two framed translucent enclosure sides with a sliding front door.
    for y0, y1, label in ((4.00, 4.42, 'fixed side'), (4.43, 4.86, 'sliding side door')):
        box('frosted shower ' + label, 3.948, 3.960, y0, y1, .075, 2.06, frosted, .002)
        for y in (y0, y1): box('shower side aluminium stile', 3.943, 3.965, y-.009, y+.009, .07, 2.075, chrome, .002)
    for z in (.075, 2.055): box('shower side aluminium track', 3.943, 3.965, 3.995, 4.87, z-.011, z+.011, chrome, .002)
    box('frosted shower front fixed panel', 3.065, 3.49, 4.878, 4.890, .075, 2.06, frosted, .002)
    box('frosted shower front sliding door', 3.50, 3.945, 4.872, 4.884, .075, 2.06, frosted, .002)
    for x in (3.06, 3.49, 3.50, 3.95): box('shower front aluminium stile', x-.009, x+.009, 4.868, 4.894, .07, 2.075, chrome, .002)
    for z in (.075, 2.055): box('shower front aluminium track', 3.055, 3.955, 4.868, 4.894, z-.011, z+.011, chrome, .002)
    rod('sliding shower handle', (3.59, 4.856, .79), (3.59, 4.856, 1.10), .011, chrome)
    # Rain head, hand shower, exposed thermostatic valve and flexible hose.
    rod('rain shower riser', (3.47, 3.985, .86), (3.47, 3.985, 1.93), .012)
    rod('rain shower arm', (3.47, 3.985, 1.91), (3.47, 4.18, 2.02), .014)
    cyl('round rain shower head', (3.47, 4.22, 2.005), .145, .026, chrome, 'Y', 48)
    box('thermostatic shower bar', 3.30, 3.64, 3.985, 4.035, .78, .86, chrome, .018)
    cyl('shower control left', (3.305, 4.018, .82), .044, .07, chrome, 'X')
    cyl('shower control right', (3.635, 4.018, .82), .044, .07, chrome, 'X')
    rod('hand shower rail', (3.72, 3.995, .95), (3.72, 3.995, 1.56), .009)
    rod('hand shower grip', (3.72, 4.025, 1.32), (3.76, 4.09, 1.51), .019)
    hose = [(3.63+.075*math.sin(i*math.pi/22), 4.02+.08*math.sin(i*math.pi/22), .79+.48*i/22) for i in range(23)]
    rod('shower hose upper', hose[-1], (3.76, 4.09, 1.48), .006)
    for i in range(len(hose)-1): rod('shower hose segment', hose[i], hose[i+1], .006)

    # Wall-hung WC on the west wall, with dual flush plate and accessories.
    box('concealed WC service wall', 3.002, 3.115, 4.93, 5.61, .02, 1.18, tile, .004)
    bowl = box('wall-hung toilet bowl', 3.09, 3.66, 5.05, 5.45, .31, .51, ceramic, .10)
    bowl['fixture'] = 'Wall-hung WC, dimensions estimated from photographs'
    box('toilet seat', 3.13, 3.63, 5.065, 5.435, .505, .535, white, .08)
    box('toilet back support', 3.06, 3.25, 5.095, 5.405, .34, .60, ceramic, .075)
    box('dual flush plate', 2.982, 3.006, 5.09, 5.41, .83, 1.03, white, .008)
    cyl('large flush button', (2.975, 5.20, .93), .061, .012, chrome, 'X', 32)
    cyl('small flush button', (2.974, 5.33, .93), .040, .012, chrome, 'X', 32)
    cyl('toilet brush cup', (3.30, 5.58, .17), .047, .27, dark)
    rod('toilet brush handle', (3.30, 5.58, .25), (3.30, 5.58, .52), .008, chrome)

    # Floating two-drawer oak vanity and vessel basin on the south wall.
    box('floating vanity carcass', 4.22, 4.92, 3.985, 4.45, .44, 1.03, oak, .006)
    box('vanity worktop', 4.19, 4.95, 3.97, 4.47, 1.02, 1.055, oak, .008)
    for z0, z1 in ((.46, .735), (.745, 1.015)):
        box('vanity drawer front', 4.235, 4.905, 4.452, 4.472, z0, z1, oak, .004)
        box('vanity recessed pull', 4.39, 4.75, 4.468, 4.481, z1-.032, z1-.018, shadow, .003)
    box('rectangular vessel basin', 4.30, 4.84, 4.055, 4.40, 1.055, 1.205, ceramic, .065)
    box('basin hollow', 4.36, 4.78, 4.105, 4.36, 1.175, 1.215, shadow, .055)
    rod('wall tap spout', (4.57, 3.965, 1.32), (4.57, 4.16, 1.27), .015)
    cyl('wall tap control', (4.79, 3.972, 1.34), .036, .045, chrome, 'Y')
    box('mirrored cabinet', 4.12, 5.00, 3.954, 4.08, 1.30, 2.14, white, .006)
    box('mirror left door', 4.135, 4.56, 4.073, 4.087, 1.32, 2.12, mirror, .002)
    box('mirror right door', 4.565, 4.985, 4.073, 4.087, 1.32, 2.12, mirror, .002)
    box('mirror centre seam', 4.556, 4.564, 4.068, 4.092, 1.32, 2.12, chrome)

    # White ladder towel radiator on the east wall, kept clear of the door swing.
    for y in (5.00, 5.57): cyl('radiator vertical collector', (5.025, y, 1.17), .018, 1.55, white)
    for i in range(22):
        z = .42 + i * 1.46/21
        rod('radiator horizontal rung', (5.025, 5.00, z), (5.025, 5.57, z), .013, white)
    for y in (5.08, 5.49): rod('radiator wall bracket', (5.025, y, .55), (4.96, y, .55), .010, white)

    # Real 80 cm bedroom-side opening: frame, casing, seal, moving leaf and hardware.
    # The leaf hinges at the right jamb and swings into the bedroom as drawn on plan.
    x0, x1, y, width = 3.60, 4.40, 5.75, .80
    # Keep the opening physically empty; the dark seal is limited to narrow jamb strips.
    box('door left dark seal', x0-.004, x0+.008, y-.047, y+.047, .02, 2.04, shadow, 0, joinery)
    box('door right dark seal', x1-.008, x1+.004, y-.047, y+.047, .02, 2.04, shadow, 0, joinery)
    box('door head dark seal', x0, x1, y-.047, y+.047, 2.028, 2.04, shadow, 0, joinery)
    box('door left jamb', x0-.022, x0+.028, y-.075, y+.075, .015, 2.08, white, .002, joinery)
    box('door right jamb', x1-.028, x1+.022, y-.075, y+.075, .015, 2.08, white, .002, joinery)
    box('door head', x0-.025, x1+.025, y-.075, y+.075, 2.035, 2.085, white, .002, joinery)
    for yy in (y-.088, y+.088):
        box('door casing left', x0-.055, x0+.015, yy-.011, yy+.011, .005, 2.115, white, .002, joinery)
        box('door casing right', x1-.015, x1+.055, yy-.011, yy+.011, .005, 2.115, white, .002, joinery)
        box('door casing head', x0-.055, x1+.055, yy-.011, yy+.011, 2.065, 2.135, white, .002, joinery)
    control = bpy.data.objects.new(P + 'bathroom entry door CONTROL', None); joinery.objects.link(control)
    control.location = (x1-.035, y, 0); control.empty_display_type = 'ARROWS'; control.empty_display_size = .18
    # Parent the leaf while the hinge is at zero; set the visible default only afterwards.
    control['Open angle'] = 0.0
    control.id_properties_ui('Open angle').update(min=0, max=92, description='Door opening angle in degrees; swings into bedroom')
    driver = control.driver_add('rotation_euler', 2).driver
    var = driver.variables.new(); var.name = 'opening'; var.targets[0].id = control; var.targets[0].data_path = '["Open angle"]'
    driver.expression = '-opening*pi/180'
    leaf = box('bathroom entry flush leaf', x1-width+.055, x1-.055, y-.021, y+.021, .03, 2.03, white, .006, joinery)
    leaf['opening_width_m'] = .80; leaf['source'] = 'Plan crop supplied 2026-09-28; hinge side and swing follow drawing'
    moving = [leaf]
    for z in (.24, 1.02, 1.80): moving.append(cyl('bathroom door hinge', (x1-.044, y-.033, z), .008, .065, chrome, 'Z', 24, joinery))
    for side in (-1, 1):
        yy = y + side*.034
        moving.append(cyl('bathroom door handle rose', (x0+.18, yy, 1.02), .027, .012, chrome, 'Y', 32, joinery))
        moving.append(rod('bathroom door lever', (x0+.18, yy, 1.02), (x0+.30, yy, 1.025), .009, chrome, joinery))
        moving.append(cyl('bathroom door privacy rose', (x0+.18, yy, .865), .019, .010, chrome, 'Y', 32, joinery))
    for ob in moving: parent_keep(ob, control)
    control['Open angle'] = 72.0
    bpy.context.view_layer.update()

    # Ceiling light, intentionally clear of the door and shower head.
    lamp = mat('Ground bathroom - warm lamp diffuser', 'FFF2D0', .28)
    lbs = lamp.node_tree.nodes.get('Principled BSDF'); lbs.inputs['Emission Color'].default_value = rgb('FFE0A5'); lbs.inputs['Emission Strength'].default_value = 3.0
    cyl('ceiling lamp', (4.25, 4.92, 2.13), .085, .035, lamp)

    # Three inspection scenes: photo-like entry, measured overhead and bedroom-side door.
    specs = [
        ('56 | GROUND BATHROOM - photo reconstruction', (4.05, 5.56, 1.57), (3.94, 4.32, 1.03), 18, False),
        ('57 | GROUND BATHROOM - complete overhead', (4.02, 4.84, 4.45), (4.02, 4.84, 0), 48, True),
        ('58 | GROUND BATHROOM - operable entry door', (3.22, 6.68, 1.58), (4.04, 5.48, 1.03), 27, False),
    ]
    scenes = []
    for name, location, target, lens, overhead in specs:
        sc = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
        for child in list(sc.collection.children): sc.collection.children.unlink(child)
        for ob in list(sc.collection.objects): bpy.data.objects.remove(ob, do_unlink=True)
        sc.collection.children.link(ground)
        if not overhead and '01 / Slab' in bpy.data.collections: sc.collection.children.link(bpy.data.collections['01 / Slab'])
        sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 1200; sc.render.resolution_y = 1100
        sc.render.resolution_percentage = 80; sc.render.image_settings.file_format = 'PNG'
        sc.render.film_transparent = False; sc.view_settings.look = 'AgX - Medium High Contrast'
        sc.world = bpy.data.worlds.get(name+' world') or bpy.data.worlds.new(name+' world'); sc.world.use_nodes = True
        sc.world.node_tree.nodes['Background'].inputs[0].default_value = (.78, .82, .88, 1); sc.world.node_tree.nodes['Background'].inputs[1].default_value = .28
        cam_data = bpy.data.cameras.new(name+' camera'); cam = bpy.data.objects.new(name+' camera', cam_data); sc.collection.objects.link(cam)
        cam.location = location; cam.rotation_euler = (Vector(target)-cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens; cam.data.clip_start = .02
        if overhead: cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.95
        sc.camera = cam
        for idx, (loc, energy, size) in enumerate((((4.1, 4.85, 2.05), 115, .75), ((4.65, 5.52, 1.80), 65, .55))):
            ld = bpy.data.lights.new(name+' soft light '+str(idx+1), 'AREA'); ld.energy = energy; ld.size = size
            lo = bpy.data.objects.new(ld.name, ld); sc.collection.objects.link(lo); lo.location = loc
            lo.rotation_euler = (Vector((4.0, 4.72, .92))-lo.location).to_track_quat('-Z', 'Y').to_euler()
        sc['reference_notes'] = 'Ground-floor shower room: 1.80 x 1.62 m and 80 cm door from plan; finishes and fixtures reconstructed from four user photos. Unsupplied dimensions estimated.'
        scenes.append(sc)

    col['clear_plan_size_m'] = [1.80, 1.62]
    col['door_opening_m'] = .80
    col['shower_size_m'] = [.90, .90]
    col['reference'] = 'Four user photographs and plan crop supplied 2026-09-28'
    col['dimension_status'] = 'Room, door and shower sizes from plan; detailed fixture sizes estimated from photos'
    report = {
        'room': 'ground-floor douchecel', 'clear_plan_size_m': [1.80, 1.62],
        'door_opening_m': .80, 'door_operable': True, 'default_open_angle_deg': 72,
        'shower_m': [.90, .90], 'fixtures': ['corner shower', 'wall-hung WC', 'floating vanity', 'vessel basin', 'mirror cabinet', 'towel radiator'],
        'photo_reconstructed': True, 'unsupplied_dimensions_estimated': True,
        'scenes': [s.name for s in scenes]
    }
    (ROOT/'ground_bathroom_verification.json').write_text(json.dumps(report, indent=2))
    notes = '''GROUND-FLOOR BATHROOM — PHOTO + PLAN UPDATE\n\nDe douchecel op het gelijkvloers is uitgewerkt volgens vier gebruikersfoto's en het planfragment van 28 september 2026. De vrije planmaat is circa 180 x 162 cm; de hoekdouche is 90 x 90 cm en de doorgang 80 cm volgens plan. De deur heeft een echte vrije opening, kozijn, krukken, privacybeslag, drie scharnieren en een instelbare eigenschap “Open angle”; standaard 72° open en naar de slaapkamer draaiend zoals getekend.\n\nInrichting: wit douchebakje, aluminium/frosted schuifcabine, regendouche en handdouche, hangtoilet met dubbele spoelplaat, zwevend licht eiken meubel met twee laden, opbouwkom, wandkraan, spiegelkast, witte handdoekradiator, beige grootformaat wandtegel en lichte houtlook vloertegel. Objecten blijven afzonderlijk bewerkbaar. Maten die niet op het plan staan zijn foto-inschattingen. Scenes 56–58. Bron: ground_bathroom_photo.py.\n'''
    (ROOT/'GROUND_BATHROOM_NOTES.txt').write_text(notes)
    notes_path = ROOT/'MODEL_NOTES.txt'
    if notes_path.exists():
        current = notes_path.read_text()
        marker = 'GROUND-FLOOR BATHROOM — PHOTO + PLAN UPDATE:'
        if marker not in current:
            notes_path.write_text(current.rstrip()+'\n\n'+marker+' 1.80 x 1.62 m douchecel, 90 x 90 cm corner shower and operable 80 cm bedroom-side door. Four photos and plan crop supplied 2026-09-28; unsupplied fixture dimensions estimated. Scenes 56–58; ground_bathroom_photo.py; GROUND_BATHROOM_NOTES.txt.\n')

    # Verification of the requested architectural change, not just a visual prop.
    assert bpy.data.objects.get(P+'bathroom entry door CONTROL') is not None
    assert abs(control['Open angle']-72.0) < 1e-6
    assert len([o for o in bpy.data.objects if o.name.startswith(P+'bathroom door hinge')]) == 3
    assert bpy.data.objects.get('Bedroom internal door') is None
    assert len([o for o in col.objects if 'shower' in o.name.lower()]) >= 20
    return scenes


if __name__ == '__main__':
    main = ROOT/'Huis_Oude_Terelststraat_15.blend'
    backup = ROOT/'Huis_before_ground_bathroom_photo.blend'
    if main.exists() and not backup.exists():
        shutil.copy2(main, backup)
    scenes = update_ground_bathroom_photo()
    bpy.context.window.scene = scenes[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    for sc, filename in zip(scenes, ['ground_bathroom_photo.png', 'ground_bathroom_overhead.png', 'ground_bathroom_door.png']):
        sc.render.filepath = str(ROOT/filename); bpy.context.window.scene = sc; bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    print('SAVED: detailed ground-floor bathroom with operable 80 cm door', flush=True)
