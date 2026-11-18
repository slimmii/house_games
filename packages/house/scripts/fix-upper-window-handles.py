"""Put the upper-floor window handles on their frames.

The handles floated in the glass beside the frame (and, in Bedroom 1, in front
of it). Each handle group is moved so it is centred on its frame stile and its
back touches the frame's room-side face. Positions are absolute, so running
the script again changes nothing. Coordinates are Blender metres.

Blender -b models/Huis_Oude_Terelststraat_15.blend \
  --python packages/house/scripts/fix-upper-window-handles.py -- [--dry-run] [--output other.blend]
"""
import sys
from pathlib import Path

import bpy
from mathutils import Vector

# (objects moved together, stile centre x, frame room-side face y, room lies towards +y or -y)
HANDLES = [
    (("Bedroom 2 / window handle backplate", "Bedroom 2 / window lever"), 3.835, 8.8267, -1),
    (("Bedroom 2 / window handle backplate.001", "Bedroom 2 / window lever.001"), 5.785, 8.8267, -1),
    (("Bedroom 1 / white window handle",), 3.845, 0.27, +1),
    (("Bedroom 1 / white window handle.001",), 5.905, 0.27, +1),
]
CANONICAL = "Huis_Oude_Terelststraat_15.blend"
dry_run = "--dry-run" in sys.argv
output = Path(sys.argv[sys.argv.index("--output") + 1]).resolve() if "--output" in sys.argv else None


def world_corners(objects):
    return [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]


for names, stile_x, face_y, room_side in HANDLES:
    objects = [bpy.data.objects.get(name) for name in names]
    if any(obj is None for obj in objects):
        raise RuntimeError(f"Missing handle part in {names}")
    corners = world_corners(objects)
    centre_x = (min(c.x for c in corners) + max(c.x for c in corners)) / 2
    back_y = min(c.y for c in corners) if room_side > 0 else max(c.y for c in corners)
    move = Vector((stile_x - centre_x, face_y - back_y, 0))
    print(f"{names[0]!r}: move x {move.x * 100:+.1f} cm, y {move.y * 100:+.1f} cm", flush=True)
    if dry_run or move.length < 1e-5:
        continue
    for obj in objects:
        # Parent-relative location: convert the world offset through the parent.
        if obj.parent is not None:
            offset = obj.parent.matrix_world.inverted().to_3x3() @ move
        else:
            offset = move
        obj.location += offset

if dry_run:
    sys.exit(0)
source = Path(bpy.data.filepath)
target = output or source
if target.name == CANONICAL and "--save-canonical" not in sys.argv:
    raise RuntimeError("Pass --save-canonical to overwrite the canonical model, or --output for a working copy.")
bpy.ops.wm.save_as_mainfile(filepath=str(target), copy=output is not None)
print(f"saved {target}", flush=True)
