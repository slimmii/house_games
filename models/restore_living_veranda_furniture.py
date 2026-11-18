import bpy
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKUP = ROOT / "Huis_before_veranda_photo_update.blend"
BLEND = ROOT / "Huis_Oude_Terelststraat_15.blend"
RENDER = ROOT / "veranda_cabinet_child_kitchen.png"
NOTES = ROOT / "VERANDA_PHOTO_UPDATE_NOTES.txt"
VERIFY = ROOT / "veranda_photo_update_verification.json"

PREFIXES = (
    "Veranda white shelving",
    "Veranda shelving",
    "Veranda metal bin",
    "Veranda play table",
)

# Idempotent restore: replace any existing copies with the exact objects from
# the pre-update backup.
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIXES):
        bpy.data.objects.remove(obj, do_unlink=True)

with bpy.data.libraries.load(str(BACKUP), link=False) as (source, target):
    target.objects = [name for name in source.objects if name.startswith(PREFIXES)]

furniture = bpy.data.collections["01 / Furniture"]
restored = [obj for obj in target.objects if obj is not None]
for obj in restored:
    if furniture not in obj.users_collection:
        furniture.objects.link(obj)
    # The archived position intersected the retained masonry pier by about
    # 9 mm. Shift the shelf/table composition 5 cm towards the living side,
    # preserving their mutual alignment and leaving a small clear joint.
    obj.location.x -= 0.05

note_text = NOTES.read_text()
text = bpy.data.texts.get("VERANDA - photo update notes") or bpy.data.texts.new(
    "VERANDA - photo update notes"
)
text.clear()
text.write(note_text)

verification = json.loads(VERIFY.read_text()) if VERIFY.exists() else {}
verification["living_veranda_transition_furniture"] = {
    "status": "restored from pre-update backup",
    "object_count": len(restored),
    "items": "narrow white shelf with metal bins and low play table",
    "source": BACKUP.name,
    "wall_clearance_correction_m": 0.05,
}
VERIFY.write_text(json.dumps(verification, indent=2))

scene = bpy.data.scenes["69 | VERANDA - kast en kinderkeuken"]
scene.render.filepath = str(RENDER)
bpy.context.window.scene = scene
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.render.render(write_still=True)

print(
    json.dumps(
        {
            "restored_objects": len(restored),
            "scene": scene.name,
            "render": str(RENDER),
        },
        indent=2,
    )
)
