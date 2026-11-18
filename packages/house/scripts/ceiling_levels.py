"""Apply the continuous first-floor ceiling in export memory, never in the .blend."""
import json
from pathlib import Path
from mathutils import Matrix

CEILING_LEVELS = json.loads((Path(__file__).parent / "ceiling-levels.json").read_text())


def level_first_floor_ceiling(objects):
    source = CEILING_LEVELS["sourceHeight"]
    target = CEILING_LEVELS["finishHeight"]
    for obj in objects:
        if obj.name in CEILING_LEVELS["slabs"]:
            obj.data = obj.data.copy()
            inverse = obj.matrix_world.inverted()
            for vertex in obj.data.vertices:
                world = obj.matrix_world @ vertex.co
                if abs(world.z - source) < 0.00002:
                    world.z = target
                    vertex.co = inverse @ world
            obj.data.update()
    # Read the authored mounting height so repeated preparation is idempotent.
    for trim in objects:
        if not trim.name.startswith(CEILING_LEVELS["fixturePrefix"]) or not trim.name.endswith(" trim"):
            continue
        offset = target - float(trim.get("ceiling_z", source))
        prefix = trim.name.removesuffix(" trim") + " "
        for obj in objects:
            if obj.name.startswith(prefix):
                obj.matrix_world = Matrix.Translation((0, 0, offset)) @ obj.matrix_world
        trim["ceiling_z"] = target
