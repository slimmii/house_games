"""Export only the four source objects carrying the photographed oak floor.

The source .blend is read-only for this operation and is never saved.
"""
from pathlib import Path
import bpy
from mathutils import Matrix

NAMES = (
    "1 / floor finish",
    "Kitchen floor finish - continuous with living",
    "Reference spiral / 0 landing timber finish",
    "Reference spiral / section floor 1",
)
PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "test-results" / "reference-oak-floor.glb"
objects = []
for name in NAMES:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError(f"Missing floor mesh: {name}")
    objects.append(obj)
scene = bpy.data.scenes["01 | HOUSE - exterior"]
bpy.context.window.scene = scene
bpy.ops.object.select_all(action="DESELECT")
scale = Matrix.Scale(3.0, 4)
for obj in objects:
    if obj.name not in scene.objects:
        scene.collection.objects.link(obj)
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
print(f"Wrote {OUTPUT} with {len(objects)} oak-floor objects", flush=True)
