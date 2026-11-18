"""Botanical Green accent paint on the living-room wall behind the TV."""
import bpy, json, shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
URL = 'https://colora.be/nl/kleuren/we-m187-botanical-green'
HEX = '445940'
P = 'Living TV paint / '
COLLECTION = '01 / Living TV accent paint'


def update_living_botanical_green():
    # The Camber elevation coordinate runs from the veranda towards the street.
    # The TV zone is S=5.395..8.297 m, i.e. world Y=.3006..3.2026 m.
    wall_x = 6.951
    y0, y1 = .3006, .3006 + (8.297 - 5.395)
    z0, z1 = 2.411, 5.069

    for ob in list(bpy.data.objects):
        if ob.name.startswith(P):
            bpy.data.objects.remove(ob, do_unlink=True)
    old = bpy.data.collections.get(COLLECTION)
    if old:
        bpy.data.collections.remove(old)
    col = bpy.data.collections.new(COLLECTION)
    bpy.data.collections['01 | FIRST - 2021 + Camber 2025'].children.link(col)
    exploded = bpy.data.collections.get('EXPLODED source 1 - cutaway')
    if exploded:
        exploded.children.link(col)
    # Most interior views link the floor's subcollections directly rather than
    # linking the first-floor root, so explicitly include the finish there too.
    for scene in bpy.data.scenes:
        if '01 / Walls right' in scene.collection.children and col.name not in scene.collection.children:
            scene.collection.children.link(col)

    def linear(s):
        return s / 12.92 if s <= .04045 else ((s + .055) / 1.055) ** 2.4

    rgba = tuple(linear(int(HEX[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)
    mat_name = 'Living TV wall - Colora WE M187 Botanical Green'
    mat = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    mat.diffuse_color = rgba
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = rgba
    bs.inputs['Roughness'].default_value = .86
    mat['manufacturer'] = 'BOSS paints / Colora'
    mat['color_code'] = 'WE M187'
    mat['color_name'] = 'Botanical Green'
    mat['published_srgb_hex'] = '#' + HEX
    mat['source_url'] = URL

    # A separate face preserves the shared structural wall material elsewhere.
    # It sits 1.5 mm in front of the interior face to avoid z-fighting.
    x = wall_x - .0015
    verts = [(x, y0, z0), (x, y0, z1), (x, y1, z1), (x, y1, z0)]
    mesh = bpy.data.meshes.new(P + 'accent face')
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    mesh.materials.append(mat)
    mesh.update()
    wall = bpy.data.objects.new(P + 'Botanical Green wall behind TV', mesh)
    col.objects.link(wall)
    wall['finish_role'] = 'Accent wall behind the living-room TV only'
    wall['camber_elevation_s_m'] = [5.395, 8.297]
    wall['world_bounds_m'] = {'x': wall_x, 'y': [y0, y1], 'z': [z0, z1]}

    col['color'] = 'Colora WE M187 Botanical Green'
    col['published_srgb_hex'] = '#' + HEX
    col['source_url'] = URL
    col['scope'] = 'TV wall segment only; Camber cabinet and other living walls unchanged'

    scene_name = '53 | LIVING - Botanical Green TV wall'
    old_scene = bpy.data.scenes.get(scene_name)
    if old_scene:
        bpy.data.scenes.remove(old_scene)
    source = bpy.data.scenes['04 | LIVING - Camber perspective']
    scene = source.copy()
    scene.name = scene_name
    scene.use_fake_user = True
    data = bpy.data.cameras.new(P + 'preview camera')
    camera = bpy.data.objects.new(P + 'preview camera', data)
    scene.collection.objects.link(camera)
    camera.location = (3.15, 5.45, 4.12)
    target = Vector((6.82, 1.73, 3.72))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    data.lens = 30
    scene.camera = camera
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100

    report = {
        'paint': 'WE M187 Botanical Green',
        'manufacturer': 'Colora / BOSS paints',
        'source_url': URL,
        'published_srgb_hex': '#' + HEX,
        'source_field': 'props.pageProps.color.rgb in official page HTML, read 2026-09-27',
        'scope': 'Living-room wall behind TV, Camber S=5.395..8.297 m',
        'world_bounds_m': {'x': wall_x, 'y': [y0, y1], 'z': [z0, z1]},
        'camber_cabinet_materials_unchanged': True,
        'other_living_walls_unchanged': True,
    }
    (ROOT / 'living_botanical_green_verification.json').write_text(json.dumps(report, indent=2))
    notes = f'''LIVING — TV-ACCENTWAND — WE M187 Botanical Green van Colora / BOSS paints.
Bron: {URL}
De officiële pagina publiceert RGB #{HEX} in props.pageProps.color.rgb. Deze sRGB-kleur is naar lineaire Blender-waarden omgerekend en als matte verf toegepast.
De verflaag is beperkt tot het wanddeel achter de tv: vanaf de straatzijde tot aan het begin van de hoge Camber-opbouw (Camber S 5,395–8,297 m). De Camber-kast, het witte tv-meubel en de overige livingwanden behouden hun materialen. De uiteindelijke waarneming wordt mede bepaald door de scèneverlichting.
Scene 53 toont de accentwand. Bron: living_botanical_green.py. Reservekopie: Huis_before_living_botanical_green.blend.
'''
    text = bpy.data.texts.get('LIVING - Botanical Green TV wall notes') or bpy.data.texts.new('LIVING - Botanical Green TV wall notes')
    text.clear()
    text.write(notes)
    (ROOT / 'LIVING_BOTANICAL_GREEN_NOTES.txt').write_text(notes)
    print('LIVING BOTANICAL GREEN:', json.dumps(report), flush=True)
    return scene


if __name__ == '__main__':
    main = ROOT / 'Huis_Oude_Terelststraat_15.blend'
    backup = ROOT / 'Huis_before_living_botanical_green.blend'
    if not backup.exists():
        shutil.copy2(main, backup)
    scene = update_living_botanical_green()
    bpy.context.window.scene = scene
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
    scene.cycles.samples = 24
    scene.cycles.max_bounces = 6
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = 75
    scene.render.filepath = str(ROOT / 'living_botanical_green.png')
    bpy.ops.render.render(write_still=True, scene=scene.name)
    scene.cycles.samples = 32
    scene.cycles.max_bounces = 8
    scene.render.resolution_percentage = 100
    bpy.ops.wm.save_as_mainfile(filepath=str(main))
