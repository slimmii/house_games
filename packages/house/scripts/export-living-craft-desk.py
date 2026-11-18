"""Export only the finished living craft desk for incremental game integration.

The canonical .blend is modified only in memory and is never saved.
"""
from pathlib import Path
import bpy
from mathutils import Matrix

COLLECTION = "01 / Furniture / living craft desk"
PREFIX = "Living craft desk / "
GAME_SCALE = 3.0
PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "test-results" / "living-craft-desk.glb"

collection = bpy.data.collections.get(COLLECTION)
if collection is None:
    raise RuntimeError(f"Missing collection: {COLLECTION}")
objects = sorted((obj for obj in collection.all_objects if obj.type in {"MESH", "CURVE"}), key=lambda obj: obj.name)
if len(objects) != 163 or any(not obj.name.startswith(PREFIX) for obj in objects):
    raise RuntimeError(f"Unexpected desk collection contents: {len(objects)} objects")

scene = bpy.data.scenes["01 | HOUSE - exterior"]
bpy.context.window.scene = scene
bpy.ops.object.select_all(action="DESELECT")
scale = Matrix.Scale(GAME_SCALE, 4)
for obj in objects:
    obj.parent = None
    obj.matrix_world = scale @ obj.matrix_world
    obj.hide_set(False)
    obj.select_set(True)
scene.view_layers[0].objects.active = objects[0]
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT), export_format="GLB", use_selection=True,
    use_active_scene=True, export_apply=True, export_cameras=False,
    export_lights=False, export_extras=False, export_materials="EXPORT",
    export_image_format="AUTO", export_attributes=False,
    export_draco_mesh_compression_enable=False,
)
print(f"Wrote {OUTPUT} with {len(objects)} desk objects", flush=True)
