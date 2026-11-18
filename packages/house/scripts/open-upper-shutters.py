"""Open every roller shutter on the second (upper) floor.

Removes the shutter slats and the dark panels that stand in for a closed
shutter, and lifts the bottom rail up under its box. Boxes, guides and the
glazing stay. Operates on a working copy so the canonical file stays untouched:

Blender -b models/Huis_Oude_Terelststraat_15.blend \
  --python packages/house/scripts/open-upper-shutters.py -- [--dry-run] [--output other.blend]

Without --output the input file itself is saved (refused for the canonical file).
"""
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REMOVE = [
    r"^Rear photo / upper front left white roller shutter slat",
    r"^Rear photo / upper front left dark backing",
    r"^Street photo / white roller shutter slat",
    r"^Street photo / upper right shutter dark backing",
    r"^Rear photo / upper rear bedroom white roller shutter slat",
    r"^Rear photo / upper rear bedroom dark backing",
    r"^Bedroom 2 / roller shutter horizontal slat",
    # Small bedroom: striped (zebra) roller blind behind the glass.
    r"^Small bedroom / blind opaque band",
    r"^Small bedroom / blind sheer band",
    r"^Small bedroom / blind bottom rail",
]
# Bottom rails ride up with the curtain: (object, box it tucks under).
RAILS = [("Street photo / shutter bottom rail", "Street photo / shutter dark projecting top casing")]
CANONICAL = "Huis_Oude_Terelststraat_15.blend"

dry_run = "--dry-run" in sys.argv
output = Path(sys.argv[sys.argv.index("--output") + 1]).resolve() if "--output" in sys.argv else None
patterns = [re.compile(p) for p in REMOVE]

doomed = [obj for obj in bpy.data.objects if any(p.search(obj.name) for p in patterns)]
counts = {}
for obj in doomed:
    key = re.sub(r"[ .]\d+$", "", obj.name)
    counts[key] = counts.get(key, 0) + 1
for key, count in sorted(counts.items()):
    print(f"remove {count:3d} × {key}", flush=True)
if not doomed:
    print("Nothing left to remove; shutters and blinds are already open.", flush=True)

for rail_name, box_name in RAILS:
    rail, box = bpy.data.objects.get(rail_name), bpy.data.objects.get(box_name)
    if rail is None or box is None:
        raise RuntimeError(f"Missing {rail_name} or {box_name}")
    rail_top = max((rail.matrix_world @ Vector(c)).z for c in rail.bound_box)
    box_bottom = min((box.matrix_world @ Vector(c)).z for c in box.bound_box)
    lift = box_bottom - rail_top - 0.002
    if lift < 0.01:
        print(f"{rail_name!r} already sits under its box", flush=True)
        continue
    print(f"lift {rail_name!r} by {lift:.3f} m", flush=True)
    if not dry_run:
        rail.location.z += lift

if dry_run:
    sys.exit(0)
for obj in doomed:
    bpy.data.objects.remove(obj, do_unlink=True)

source = Path(bpy.data.filepath)
target = output or source
if target.name == CANONICAL and "--save-canonical" not in sys.argv:
    raise RuntimeError("Pass --save-canonical to overwrite the canonical model, or --output for a working copy.")
bpy.ops.wm.save_as_mainfile(filepath=str(target), copy=output is not None)
print(f"saved {target}", flush=True)
