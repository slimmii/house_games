"""Raise ground-floor partition walls that stop below the first-floor slab.

The archive section drew the ground-floor lining walls at 2.15 m while the slab
underside sits at 2.22 m, so a toy drone could look over them. Every vertical
wall panel in the ground collection whose top lies at 2.15 m is extended to the
slab underside. Run with `-- --dry-run` to list the objects without saving; a
real run first writes a backup next to the canonical file. Safe to rerun: it
changes nothing once the walls are raised.

Blender -b models/Huis_Oude_Terelststraat_15.blend --python packages/house/scripts/raise-ground-partitions.py -- [--dry-run] [--output other.blend]

With `--output`, the raised model is written to that file and the canonical
file stays untouched, so the result can be reviewed before replacing it.
"""
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

GROUND_COLLECTION = "00 | GROUND - 2021"
OLD_TOP = 2.15
NEW_TOP = 2.22
TOLERANCE = 0.008
MIN_HEIGHT = 0.1
MIN_WIDTH = 0.5
EXCLUDED = ("spindle", "baluster", "handrail", "rail", "post", "cabinet", "mirror")
dry_run = "--dry-run" in sys.argv
output = Path(sys.argv[sys.argv.index("--output") + 1]).resolve() if "--output" in sys.argv else None

collection = bpy.data.collections.get(GROUND_COLLECTION)
if collection is None:
    raise RuntimeError(f"Missing collection {GROUND_COLLECTION}")

changed = []
for obj in collection.all_objects:
    if obj.type != "MESH" or obj.hide_render:
        continue
    matrix = obj.matrix_world
    world_z = [(matrix @ v.co).z for v in obj.data.vertices]
    if not world_z:
        continue
    top, bottom = max(world_z), min(world_z)
    if abs(top - OLD_TOP) > TOLERANCE or top - bottom < MIN_HEIGHT:
        continue
    corners = [matrix @ Vector(corner) for corner in obj.bound_box]
    width = max(max(c.x for c in corners) - min(c.x for c in corners), max(c.y for c in corners) - min(c.y for c in corners))
    if width < MIN_WIDTH or any(token in obj.name.lower() for token in EXCLUDED):
        continue
    inverse = matrix.inverted()
    moved = 0
    for vertex, z in zip(obj.data.vertices, world_z):
        if z < top - 0.005:
            continue
        world = matrix @ vertex.co
        world.z = NEW_TOP
        vertex.co = inverse @ world
        moved += 1
    changed.append((obj.name, round(bottom, 3), round(top, 3), moved))

# The bedroom/dressing partition stops 4 cm short of the west lining wall and
# 6 cm short of the east party wall. Stretch its end faces onto those walls.
END_GAPS = (
    # (objects, current end x in metres, wall face x in metres)
    (("Bedroom partition", "Bedroom partition.001"), 2.99, 2.95),
    (("Bedroom partition.004", "Ground circulation correction / dressing right pier"), 6.94, 7.00),
)
for names, old_x, new_x in END_GAPS:
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"Missing partition piece {name}")
        matrix = obj.matrix_world
        inverse = matrix.inverted()
        moved = 0
        for vertex in obj.data.vertices:
            world = matrix @ vertex.co
            if abs(world.x - old_x) > 0.01:
                continue
            world.x = new_x
            vertex.co = inverse @ world
            moved += 1
        if not moved:
            # Already extended on an earlier run: the end face now sits at new_x.
            if any(abs((matrix @ vertex.co).x - new_x) < 0.01 for vertex in obj.data.vertices):
                continue
            raise RuntimeError(f"{name} has no end face at x={old_x}")
        changed.append((f"{name} end {old_x}->{new_x}", None, None, moved))

for name, bottom, top, moved in changed:
    print(f"raise {name!r}: {bottom} .. {top} -> {NEW_TOP} ({moved} vertices)" if bottom is not None
          else f"extend {name!r} ({moved} vertices)", flush=True)
print(f"{len(changed)} objects {'would be' if dry_run else ''} raised to {NEW_TOP} m", flush=True)

if dry_run:
    sys.exit(0)
source = Path(bpy.data.filepath)
if output is not None:
    bpy.ops.wm.save_as_mainfile(filepath=str(output), copy=True)
    print(f"saved raised copy to {output}; canonical file untouched", flush=True)
    sys.exit(0)
backup = source.with_name("Huis_before_ground_partition_height.blend")
if not backup.exists():
    shutil.copy2(source, backup)
    print(f"backup written to {backup}", flush=True)
bpy.ops.wm.save_mainfile(filepath=str(source))
print(f"saved {source}", flush=True)
