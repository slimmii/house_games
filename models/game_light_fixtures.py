"""Lamps added for the game, as real objects in the canonical house.

Builds the lamps listed in game_light_fixtures.json (next to this script) as
meshes plus SPOT lights tagged `game_light`, next to the earlier reference
fixtures. Pass --with-drafts to also include the proposals still in
packages/house/src/client/house-light-drafts.json. Game positions are 3× metres with Y up; Blender is metres with Z up.
Rerunnable: existing "Game lighting /" objects are replaced. Run on the
canonical house with --save (a one-time backup is written first).

Blender -b models/Huis_Oude_Terelststraat_15.blend --python models/game_light_fixtures.py -- [--save]
"""
import json
import math
import shutil
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent
LAMPS = ROOT / 'game_light_fixtures.json'
DRAFTS = ROOT.parent / 'packages' / 'house' / 'src' / 'client' / 'house-light-drafts.json'
PREFIX = 'Game lighting / '
SCALE = 3.0
scene = bpy.data.scenes['01 | HOUSE - exterior']
bpy.context.window.scene = scene
source = ROOT / 'Huis_Oude_Terelststraat_15.blend'
backup = ROOT / 'Huis_before_game_light_fixtures_20261006.blend'
if '--save' in sys.argv and not backup.exists():
    shutil.copy2(source, backup)

for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX):
        bpy.data.objects.remove(obj, do_unlink=True)

LEVELS = [('ground', '00 | GROUND - 2021', 0.0), ('first', '01 | FIRST - 2021 + Camber 2025', 2.41),
          ('upper', '02 | SECOND - archive reconstruction', 5.31)]
cols = {}
for level, parent, _ in LEVELS:
    name = f'Reference lighting / {level} fixtures'
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if name not in bpy.data.collections[parent].children:
        bpy.data.collections[parent].children.link(col)
    cols[level] = col


def level_for(z):
    return max((level for level, _, floor in LEVELS if z >= floor - 0.05), key=lambda l: dict((a, c) for a, _, c in LEVELS)[l])


def to_blender(v):
    """Game (x, y, z) → Blender (x, -z, y) in metres."""
    return Vector((v[0] / SCALE, -v[2] / SCALE, v[1] / SCALE))


def dir_to_blender(v):
    return Vector((v[0], -v[2], v[1])).normalized()


def material(name, hex_rgb, rough=.5, metal=0, emission=0):
    m = bpy.data.materials.get(PREFIX + name) or bpy.data.materials.new(PREFIX + name)
    m.use_nodes = True
    c = [int(hex_rgb[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c]
    m.diffuse_color = (*c, 1)
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*c, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Emission Color'].default_value = (*c, 1) if emission else (0, 0, 0, 1)
    bs.inputs['Emission Strength'].default_value = emission
    return m


dark = material('dark metal', '2B2D30', .4, .6)
white = material('white paint', 'F1EFEA', .55)
steel = material('brushed steel', 'B9BCBF', .35, .85)
frosted = material('frosted glass', 'F6F4EF', .6, 0, 1.6)
# Same lens as the reference spots: reuse it so packaging does not fold the
# reference material into a new one (the audit tracks material names).
lens = bpy.data.materials.get('Reference lighting / warm white LED lens') or material('warm LED lens', 'FFF0D6', .3, 0, 1.6)


def finish(me, name, mat, col, smooth=False):
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me)
    bm.free()
    me.update()
    obj = bpy.data.objects.new(PREFIX + name, me)
    col.objects.link(obj)
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = smooth
    obj['game_fixture'] = True
    return obj


def cylinder(name, centre, radius, depth, mat, col, axis=Vector((0, 0, 1)), radius2=None, segments=32, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=segments, radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth)
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bm.transform(Matrix.Translation(centre) @ rot)
    me = bpy.data.meshes.new(PREFIX + name)
    bm.to_mesh(me)
    bm.free()
    return finish(me, name, mat, col, smooth=True)


def box(name, centre, size, mat, col, basis=Matrix.Identity(4)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.transform(Matrix.Translation(centre) @ basis @ Matrix.Diagonal((*size, 1)))
    me = bpy.data.meshes.new(PREFIX + name)
    bm.to_mesh(me)
    bm.free()
    return finish(me, name, mat, col)


def tube(name, points, radius, mat, col, segments=10):
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(points):
        tangent = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        helper = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((1, 0, 0))
        u = tangent.cross(helper).normalized()
        w = tangent.cross(u)
        rings.append([bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * radius)
                      for a in (k * math.tau / segments for k in range(segments))])
    for a, b in zip(rings, rings[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(PREFIX + name)
    bm.to_mesh(me)
    bm.free()
    return finish(me, name, mat, col, smooth=True)


lights = []


def light(name, position, direction, col, candela, distance, angle, penumbra):
    data = bpy.data.lights.new(PREFIX + name, 'SPOT')
    data.energy = candela / 1.15
    data.color = (1, .88, .69)
    data.spot_size = min(math.pi, 2 * angle)
    data.spot_blend = penumbra
    data.shadow_soft_size = .035
    obj = bpy.data.objects.new(PREFIX + name, data)
    col.objects.link(obj)
    obj.location = position
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    obj['game_light'] = True
    obj['game_range_m'] = distance / SCALE
    obj['game_candela'] = candela
    lights.append(obj)


drafts = json.loads(LAMPS.read_text())['lamps']
if '--with-drafts' in sys.argv:
    drafts += json.loads(DRAFTS.read_text())['drafts']
if not drafts:
    raise RuntimeError('No lamps defined; refusing to strip the model')
built = []
for draft in drafts:
    name = draft['name'].replace('Draft / ', '')
    if any(name == b for b in built):
        raise RuntimeError(f'Duplicate lamp {name}')
    p = to_blender(draft['position'])
    col = cols[level_for(p.z)]
    heads = draft.get('heads') or [{'offset': [0, 0, 0], 'direction': draft['direction']}]
    kind = draft['fixture']
    if kind == 'recessed-spot':
        n, r_out, r_in = 40, .05, .037
        vs = []
        for dz, r in [(-.006, r_out), (.002, r_out), (-.006, r_in), (.002, r_in)]:
            vs.extend((p.x + r * math.cos(i * math.tau / n), p.y + r * math.sin(i * math.tau / n), p.z + dz) for i in range(n))
        fs = []
        for a, b in [(0, 1), (0, 2), (1, 3), (2, 3)]:
            fs.extend((a * n + i, a * n + (i + 1) % n, b * n + (i + 1) % n, b * n + i) for i in range(n))
        me = bpy.data.meshes.new(PREFIX + name + ' trim')
        me.from_pydata(vs, [], fs)
        finish(me, name + ' trim', white, col)
        cylinder(name + ' reflector', p + Vector((0, 0, -.002)), .0368, .002, dark, col)
        cylinder(name + ' lens', p + Vector((0, 0, -.0035)), .028, .0015, lens, col)
    elif kind == 'spiral-spots':
        cylinder(name + ' canopy', p + Vector((0, 0, -.008)), .057, .017, dark, col)
        cylinder(name + ' stem', p + Vector((0, 0, -.05)), .007, .073, dark, col, segments=8)
        pts = []
        for i in range(65):
            t = i / 64
            a = math.pi / 2 + t * math.pi * 2.15
            r = (.12 + t * .5) / SCALE
            # Game -z → Blender +y: the arm curls the same way as in the preview.
            pts.append(p + Vector((math.cos(a) * r, -math.sin(a) * r, -.26 / SCALE)))
        tube(name + ' arm', pts, .022 / SCALE, dark, col)
        for i, head in enumerate(heads, 1):
            at = p + Vector((head['offset'][0], -head['offset'][2], head['offset'][1])) / SCALE
            d = dir_to_blender(head['direction'])
            cylinder(f'{name} head {i}', at, .075 / SCALE, .2 / SCALE, dark, col, axis=d, radius2=.06 / SCALE, segments=20)
            cylinder(f'{name} head {i} lens', at + d * (.101 / SCALE), .068 / SCALE, .003, lens, col, axis=d, segments=20)
            cylinder(f'{name} head {i} bracket', at + Vector((0, 0, .1 / SCALE)), .012 / SCALE, .18 / SCALE, dark, col, segments=6)
    elif kind == 'wall-washer':
        normal = dir_to_blender(draft['mountNormal'])
        basis = Vector((0, 0, 1)).rotation_difference(normal).to_matrix().to_4x4()
        # Box axes: x along the wall, y up, z out of the wall.
        basis = normal.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        size = (.75 / SCALE, .45 / SCALE, .2 / SCALE)
        box(name + ' body', p + normal * (.1 / SCALE), size, white, col, basis)
        for label, sign in (('top slit', 1), ('bottom slit', -1)):
            box(f'{name} {label}', p + normal * (.1 / SCALE) + Vector((0, 0, sign * .226 / SCALE)), (.7 / SCALE, .004 / SCALE, .16 / SCALE), lens, col, basis)
    elif kind == 'torch-sconce':
        normal = dir_to_blender(draft['mountNormal'])
        cylinder(name + ' wall cup', p + normal * (.06 / SCALE), .2 / SCALE, .12 / SCALE, steel, col, axis=normal, radius2=.17 / SCALE, segments=28)
        cylinder(name + ' arm', p + normal * (.27 / SCALE), .035 / SCALE, .3 / SCALE, steel, col, axis=normal, segments=10)
        lean = (Vector((0, 0, 1)) + normal * .12).normalized()
        axis = p + normal * (.45 / SCALE)
        cylinder(name + ' steel cone', axis + Vector((0, 0, -.15 / SCALE)), .12 / SCALE, .9 / SCALE, steel, col, axis=-lean, radius2=0.0, segments=24)
        cylinder(name + ' frosted cone', axis + lean * (.62 / SCALE), .11 / SCALE, .75 / SCALE, frosted, col, axis=lean, radius2=.22 / SCALE, segments=28, cap=False)
    else:
        raise RuntimeError(f'Unknown fixture kind {kind}')
    for i, head in enumerate(heads, 1):
        at = p + Vector((head['offset'][0], -head['offset'][2], head['offset'][1])) / SCALE
        label = f'{name} light' if len(heads) == 1 else f'{name} head {i} light'
        light(label, at, dir_to_blender(head['direction']), col, draft['intensity'], draft['distance'], draft['angle'], draft['penumbra'])
    built.append(name)

bpy.context.view_layer.update()
for sc in bpy.data.scenes:
    if sc == scene:
        continue
    for level, col in cols.items():
        anchor = {'ground': 'Ground bathroom photo / square shower tray', 'first': 'Kitchen base carcass',
                  'upper': 'Upper correction / rounded north stair surround'}[level]
        if anchor in sc.objects and col.name not in sc.collection.children:
            sc.collection.children.link(col)
meshes = sum(o.type == 'MESH' and o.name.startswith(PREFIX) for o in scene.objects)
report = {'fixtures': built, 'meshCount': meshes, 'lightCount': len(lights)}
(ROOT / 'game_light_fixtures_verification.json').write_text(json.dumps(report, indent=2))
if '--save' in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
print('GAME_LIGHTS', json.dumps(report), flush=True)
