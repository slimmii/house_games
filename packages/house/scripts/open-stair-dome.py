"""Cut the stair-dome opening through the ceiling surround and the flat roof.

Both surfaces ran closed under the transparent dome, so the dome showed a
taupe disc instead of sky. The hole follows the curb's inner opening at
ceiling level. Skips objects that already have the hole, so it can run twice.

Blender -b models/Huis_Oude_Terelststraat_15.blend \
  --python packages/house/scripts/open-stair-dome.py -- [--dry-run] [--output other.blend]
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

CURB = "Stair dome / white circular curb with splayed interior"
GLAZING = "Stair dome / transparent shallow domed glazing"
TARGETS = ["Stair dome / taupe ceiling surround", "Main flat roof"]
CANONICAL = "Huis_Oude_Terelststraat_15.blend"
dry_run = "--dry-run" in sys.argv
output = Path(sys.argv[sys.argv.index("--output") + 1]).resolve() if "--output" in sys.argv else None

glazing = bpy.data.objects[GLAZING]
corners = [glazing.matrix_world @ Vector(c) for c in glazing.bound_box]
centre = Vector(((min(c.x for c in corners) + max(c.x for c in corners)) / 2,
                 (min(c.y for c in corners) + max(c.y for c in corners)) / 2, 0))

# Inner radius of the curb at its lowest ring: the opening seen from the ceiling.
curb = bpy.data.objects[CURB]
curb_world = [curb.matrix_world @ v.co for v in curb.data.vertices]
bottom = min(p.z for p in curb_world)
low_ring = [p for p in curb_world if p.z < bottom + 0.02]
radius = min(math.hypot(p.x - centre.x, p.y - centre.y) for p in low_ring)
print(f"dome centre ({centre.x:.3f}, {centre.y:.3f}) m, opening radius {radius:.3f} m at z {bottom:.3f}", flush=True)


def blocks_opening(obj):
    """True when the object's own mesh closes the opening (tested in world space)."""
    matrix = obj.matrix_world
    tree = BVHTree.FromPolygons([matrix @ v.co for v in obj.data.vertices],
                                [tuple(poly.vertices) for poly in obj.data.polygons])
    hit, *_ = tree.ray_cast(Vector((centre.x, centre.y, bottom - 0.5)), Vector((0, 0, 1)), 3.0)
    return hit is not None


cutter = None
for name in TARGETS:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"Missing {name}")
    if not blocks_opening(obj):
        print(f"{name!r} already open", flush=True)
        continue
    print(f"cut {name!r}", flush=True)
    if dry_run:
        continue
    if cutter is None:
        mesh = bpy.data.meshes.new("Stair dome cutter")
        import bmesh
        shape = bmesh.new()
        bmesh.ops.create_cone(shape, cap_ends=True, segments=64, radius1=radius, radius2=radius, depth=4.0)
        shape.to_mesh(mesh)
        shape.free()
        cutter = bpy.data.objects.new("Stair dome / temporary cutter", mesh)
        cutter.location = (centre.x, centre.y, bottom + 1.0)
        obj.users_collection[0].objects.link(cutter)
        bpy.context.view_layer.update()
        cutter.name = "Stair dome / temporary cutter"
    modifier = obj.modifiers.new("dome opening", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    # Apply via the evaluated mesh: works in background mode without a UI context.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    depsgraph.update()
    evaluated = obj.evaluated_get(depsgraph)
    new_mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
    old_mesh = obj.data
    obj.modifiers.remove(modifier)
    obj.data = new_mesh
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    if blocks_opening(obj):
        raise RuntimeError(f"{name} still blocks the dome after cutting")

if cutter is not None:
    bpy.data.objects.remove(cutter, do_unlink=True)
if dry_run:
    sys.exit(0)
source = Path(bpy.data.filepath)
target = output or source
if target.name == CANONICAL and "--save-canonical" not in sys.argv:
    raise RuntimeError("Pass --save-canonical to overwrite the canonical model, or --output for a working copy.")
bpy.ops.wm.save_as_mainfile(filepath=str(target), copy=output is not None)
print(f"saved {target}", flush=True)
