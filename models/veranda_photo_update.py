import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parent
BLEND = ROOT / "Huis_Oude_Terelststraat_15.blend"
RENDER = ROOT / "veranda_cabinet_child_kitchen.png"
VERIFY = ROOT / "veranda_photo_update_verification.json"
NOTES = ROOT / "VERANDA_PHOTO_UPDATE_NOTES.txt"

F1 = 2.41
W = 7.381
D = 10.960
PREFIX = "Veranda photo - "


def material(name, color, roughness=0.48, metallic=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def box(name, center, size, mat, bevel=0.006):
    bpy.ops.mesh.primitive_cube_add(location=center)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Soft furniture edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    FURN.objects.link(obj)
    return obj


def cylinder(name, center, radius, depth, mat, rotation=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=center, rotation=rotation
    )
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.materials.append(mat)
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    FURN.objects.link(obj)
    return obj


def rod(name, start, end, radius, mat):
    a, b = Vector(start), Vector(end)
    vec = b - a
    obj = cylinder(name, (a + b) / 2, radius, vec.length, mat)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = vec.to_track_quat("Z", "Y")
    return obj


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


# Remove only this photo update if it is rerun. The earlier shelf and low table
# in the living/veranda transition are separate furniture and must remain.
old_prefixes = (
    PREFIX,
)
for obj in list(bpy.data.objects):
    if obj.name.startswith(old_prefixes) or obj.name.startswith("Veranda photo update "):
        bpy.data.objects.remove(obj, do_unlink=True)

FURN = bpy.data.collections["01 / Furniture"]

white = material("Veranda photo white laminate", (0.87, 0.865, 0.84), 0.42)
oak = material("Veranda photo pale birch ply", (0.58, 0.40, 0.23), 0.45)
oak_edge = material("Veranda photo plywood edge", (0.72, 0.55, 0.34), 0.50)
grey = material("Veranda photo warm grey", (0.34, 0.36, 0.36), 0.38)
dark = material("Veranda photo cooktop black", (0.025, 0.03, 0.035), 0.25)
steel = material("Veranda photo brushed steel", (0.42, 0.45, 0.46), 0.28, 0.55)
glass = material("Veranda photo oven glass", (0.08, 0.105, 0.12), 0.18, 0.10)
pink = material("Veranda photo storage pink", (0.76, 0.34, 0.43), 0.46)
blue = material("Veranda photo storage blue", (0.20, 0.48, 0.62), 0.46)
clear = material("Veranda photo translucent tub", (0.57, 0.66, 0.68), 0.32)
green = material("Veranda photo game green", (0.23, 0.50, 0.25), 0.52)
orange = material("Veranda photo game orange", (0.80, 0.34, 0.10), 0.52)


# 4 x 5 open storage cabinet, raised on wooden feet and placed against the
# solid right-hand wall.
cab_x0, cab_x1 = 6.705, 7.095
cab_y0, cab_y1 = 9.20, 10.67
cab_z0, cab_z1 = F1 + 0.14, F1 + 1.96
t = 0.038
for xx in (cab_x0 + 0.075, cab_x1 - 0.075):
    for yy in (cab_y0 + 0.075, cab_y1 - 0.075):
        cylinder("cabinet wooden foot", (xx, yy, F1 + 0.07), 0.030, 0.14, oak_edge)
box("cabinet back shadow", (cab_x1 - 0.010, (cab_y0 + cab_y1) / 2, (cab_z0 + cab_z1) / 2),
    (0.018, cab_y1 - cab_y0, cab_z1 - cab_z0), white, 0.002)
for yy in (cab_y0 + t / 2, cab_y1 - t / 2):
    box("cabinet outer side", ((cab_x0 + cab_x1) / 2, yy, (cab_z0 + cab_z1) / 2),
        (cab_x1 - cab_x0, t, cab_z1 - cab_z0), white)
for zz in (cab_z0 + t / 2, cab_z1 - t / 2):
    box("cabinet outer shelf", ((cab_x0 + cab_x1) / 2, (cab_y0 + cab_y1) / 2, zz),
        (cab_x1 - cab_x0, cab_y1 - cab_y0 - 2 * t, t), white)
cell_w = (cab_y1 - cab_y0 - 2 * t) / 4
cell_h = (cab_z1 - cab_z0 - 2 * t) / 5
for i in range(1, 4):
    yy = cab_y0 + t + i * cell_w
    box("cabinet vertical divider", ((cab_x0 + cab_x1) / 2, yy, (cab_z0 + cab_z1) / 2),
        (cab_x1 - cab_x0, 0.022, cab_z1 - cab_z0 - 2 * t), white, 0.003)
for i in range(1, 5):
    zz = cab_z0 + t + i * cell_h
    box("cabinet horizontal shelf", ((cab_x0 + cab_x1) / 2, (cab_y0 + cab_y1) / 2, zz),
        (cab_x1 - cab_x0, cab_y1 - cab_y0 - 2 * t, 0.022), white, 0.003)

# Restrained shelf contents based on the photos: tubs and board-game boxes.
content_specs = [
    (0, 0, pink, 0.24, 0.28), (1, 0, clear, 0.25, 0.26),
    (2, 0, blue, 0.25, 0.25), (3, 0, orange, 0.25, 0.24),
    (0, 1, blue, 0.25, 0.22), (2, 1, pink, 0.24, 0.25),
    (1, 2, clear, 0.25, 0.22), (3, 2, green, 0.25, 0.20),
    (0, 3, pink, 0.24, 0.23), (2, 3, clear, 0.25, 0.22),
]
for col, row, mat, width, height in content_specs:
    yc = cab_y0 + t + (col + 0.5) * cell_w
    zbase = cab_z0 + t + row * cell_h + 0.017
    box("cabinet storage tub", (cab_x0 + 0.115, yc, zbase + height / 2),
        (0.215, width, height), mat, 0.012)
for col, row, mat in [(0, 4, green), (1, 4, orange), (2, 4, blue), (3, 4, pink), (3, 1, pink)]:
    yc = cab_y0 + t + (col + 0.5) * cell_w
    zbase = cab_z0 + t + row * cell_h + 0.018
    for j in range(3):
        box("cabinet board game", (cab_x0 + 0.11, yc, zbase + 0.026 + j * 0.052),
            (0.21, cell_w * 0.72, 0.045), mat, 0.004)


# Child-sized birch/white play kitchen. It is first built in a convenient
# local orientation, then rotated onto the left wall opposite the cabinet.
kit_x0, kit_x1 = 4.42, 5.18
kit_y0, kit_y1 = 10.49, 10.89
base_z0, counter_z = F1 + 0.075, F1 + 0.615
top_z = F1 + 1.135

# Feet and base carcass.
for xx in (kit_x0 + 0.045, kit_x1 - 0.045):
    for yy in (kit_y0 + 0.04, kit_y1 - 0.04):
        box("kitchen foot", (xx, yy, F1 + 0.04), (0.065, 0.065, 0.08), grey, 0.010)
box("kitchen base carcass", ((kit_x0 + kit_x1) / 2, (kit_y0 + kit_y1) / 2, (base_z0 + counter_z) / 2),
    (kit_x1 - kit_x0, kit_y1 - kit_y0, counter_z - base_z0), oak, 0.008)
box("kitchen counter", ((kit_x0 + kit_x1) / 2, (kit_y0 + kit_y1) / 2, counter_z + 0.022),
    (kit_x1 - kit_x0 + 0.035, kit_y1 - kit_y0 + 0.025, 0.044), oak_edge, 0.008)

# Lower white doors, oven window, handles and centre gap.
door_w = (kit_x1 - kit_x0 - 0.055) / 2
for side in range(2):
    xc = kit_x0 + 0.018 + door_w / 2 + side * (door_w + 0.019)
    box("kitchen lower white door", (xc, kit_y0 - 0.012, F1 + 0.345),
        (door_w, 0.028, 0.455), white, 0.009)
    rod("kitchen lower handle", (xc - 0.10, kit_y0 - 0.033, F1 + 0.525),
        (xc + 0.10, kit_y0 - 0.033, F1 + 0.525), 0.012, grey)
box("kitchen oven window", (kit_x0 + 0.018 + door_w / 2, kit_y0 - 0.029, F1 + 0.33),
    (door_w * 0.66, 0.009, 0.18), glass, 0.012)

# Cooktop and sink on the counter.
box("kitchen cooktop", (kit_x0 + 0.21, kit_y0 + 0.17, counter_z + 0.051),
    (0.31, 0.245, 0.018), dark, 0.018)
for xx in (kit_x0 + 0.14, kit_x0 + 0.28):
    cylinder("kitchen hob ring", (xx, kit_y0 + 0.17, counter_z + 0.062), 0.052, 0.007, grey)
box("kitchen sink basin", (kit_x1 - 0.20, kit_y0 + 0.18, counter_z + 0.045),
    (0.30, 0.245, 0.035), grey, 0.035)
box("kitchen sink inner", (kit_x1 - 0.20, kit_y0 + 0.17, counter_z + 0.065),
    (0.245, 0.19, 0.010), dark, 0.030)
rod("kitchen faucet stem", (kit_x1 - 0.08, kit_y1 - 0.10, counter_z + 0.06),
    (kit_x1 - 0.08, kit_y1 - 0.10, counter_z + 0.25), 0.014, steel)
rod("kitchen faucet spout", (kit_x1 - 0.08, kit_y1 - 0.10, counter_z + 0.25),
    (kit_x1 - 0.18, kit_y1 - 0.10, counter_z + 0.25), 0.014, steel)

# Upper open frame and toy microwave.
for xx in (kit_x0 + 0.025, kit_x1 - 0.025):
    box("kitchen upper side", (xx, kit_y1 - 0.035, (counter_z + top_z) / 2),
        (0.045, 0.33, top_z - counter_z), oak_edge, 0.006)
box("kitchen upper top", ((kit_x0 + kit_x1) / 2, kit_y1 - 0.035, top_z - 0.02),
    (kit_x1 - kit_x0, 0.33, 0.04), oak_edge, 0.006)
box("kitchen upper shelf", ((kit_x0 + kit_x1) / 2, kit_y1 - 0.035, F1 + 0.86),
    (kit_x1 - kit_x0 - 0.04, 0.33, 0.035), oak_edge, 0.006)
box("kitchen microwave body", ((kit_x0 + kit_x1) / 2, kit_y0 + 0.27, F1 + 0.975),
    (0.47, 0.24, 0.22), white, 0.012)
box("kitchen microwave window", ((kit_x0 + kit_x1) / 2 - 0.035, kit_y0 + 0.142, F1 + 0.975),
    (0.32, 0.010, 0.145), glass, 0.018)
rod("kitchen microwave handle", (kit_x1 - 0.19, kit_y0 + 0.128, F1 + 0.91),
    (kit_x1 - 0.19, kit_y0 + 0.128, F1 + 1.04), 0.012, grey)

# Move the complete kitchen to the wall opposite the cabinet. The +90 degree
# rotation turns its front from -Y to +X. Its back sits against the left wall,
# immediately beside the kitchen/veranda window shown in the reference photo.
source_center = Vector(((kit_x0 + kit_x1) / 2, (kit_y0 + kit_y1) / 2, 0.0))
kitchen_center = Vector((3.33, 10.40, 0.0))
kitchen_transform = (
    Matrix.Translation(kitchen_center)
    @ Matrix.Rotation(math.pi / 2, 4, "Z")
    @ Matrix.Translation(-source_center)
)
for obj in list(FURN.objects):
    if obj.name.startswith(PREFIX + "kitchen "):
        obj.matrix_world = kitchen_transform @ obj.matrix_world


# A dedicated verification scene, leaving the existing presentation scenes intact.
scene_name = "69 | VERANDA - kast en kinderkeuken"
if scene_name in bpy.data.scenes:
    old_scene = bpy.data.scenes[scene_name]
    bpy.data.scenes.remove(old_scene)
source = bpy.data.scenes["07 | LIVING + VERANDA - open room"]
scene = bpy.data.scenes.new(scene_name)
scene.world = source.world
for collection in source.collection.children:
    scene.collection.children.link(collection)
scene.view_settings.look = source.view_settings.look
scene.view_settings.exposure = source.view_settings.exposure

bpy.ops.object.camera_add(location=(5.04, 7.15, F1 + 1.70))
camera = bpy.context.object
camera.name = "Veranda photo update camera"
camera.data.lens = 22
camera.data.sensor_width = 36
look_at(camera, (5.03, 10.20, F1 + 1.00))
for old in list(camera.users_collection):
    old.objects.unlink(camera)
scene.collection.objects.link(camera)
scene.camera = camera

bpy.ops.object.light_add(type="AREA", location=(4.35, 8.70, F1 + 2.05))
light = bpy.context.object
light.name = "Veranda photo update softbox"
light.data.energy = 420
light.data.shape = "RECTANGLE"
light.data.size = 2.2
light.data.size_y = 1.3
look_at(light, (5.6, 10.1, F1 + 0.75))
for old in list(light.users_collection):
    old.objects.unlink(light)
scene.collection.objects.link(light)

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(RENDER)
scene.render.film_transparent = False

notes = (
    "VERANDA — foto-update 28 september 2026. De brede open vakkenkast staat tegen de "
    "massieve rechterwand zonder raam, haaks op de tuinbeglazing. De kast telt vier "
    "vakken in de breedte en vijf in de hoogte en staat verhoogd op houten pootjes. Het houten/witte "
    "kinderkeukentje staat aan de overkant, tegen de linkerzijwand met het raam. De bestaande smalle kast en lage "
    "tafel in de overgang tussen living en veranda blijven behouden en zijn samen 5 cm naar links geschoven om "
    "de scheidingspijler vrij te houden. Kast, bakken, speldozen en kinderkeuken "
    "zijn vereenvoudigde fotoreconstructies; afmetingen en exacte afstanden zijn visuele "
    "schattingen. Scene 69; bron veranda_photo_update.py.\n"
)
NOTES.write_text(notes)
text = bpy.data.texts.get("VERANDA - photo update notes") or bpy.data.texts.new("VERANDA - photo update notes")
text.clear()
text.write(notes)

verification = {
    "scene": scene_name,
    "cabinet": {
        "wall": "solid right-hand wall without window",
        "dimensions_m": [round(cab_x1 - cab_x0, 3), round(cab_y1 - cab_y0, 3), round(cab_z1 - cab_z0, 3)],
        "bounds_xyz_m": [[cab_x0, cab_x1], [cab_y0, cab_y1], [cab_z0, cab_z1]],
        "grid": "4 columns x 5 rows, raised on four wooden feet",
    },
    "child_kitchen": {
        "wall": "left wall with kitchen/veranda window, opposite the cabinet",
        "dimensions_m": [round(kit_y1 - kit_y0, 3), round(kit_x1 - kit_x0, 3), round(top_z - F1, 3)],
        "bounds_xyz_m": [[3.00, 3.58], [10.00, 10.80], [F1, top_z]],
    },
    "source": "three user photos; all furniture dimensions estimated",
}
VERIFY.write_text(json.dumps(verification, indent=2))

bpy.context.window.scene = scene
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.render.render(write_still=True)
print(json.dumps(verification, indent=2))
