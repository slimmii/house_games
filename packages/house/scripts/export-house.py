"""Export the canonical house as a gameplay GLB and triangle collision soup.

Run with:
  Blender -b models/Huis_Oude_Terelststraat_15.blend \
    --python packages/house/scripts/export-house.py

The loaded .blend is changed only in memory and is never saved. Blender's glTF
axis conversion maps Blender (x, z, -y) to Three.js (x, y, z); all source
objects are uniformly scaled by GAME_SCALE before the visual export.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector


GAME_SCALE = 3.0
SOURCE_SCENE = "01 | HOUSE - exterior"
ROOT_NAMES = (
    "00 | GROUND - 2021",
    "01 | FIRST - 2021 + Camber 2025",
    "02 | SECOND - archive reconstruction",
    "03 | ROOFS - removable",
    "04 | SITE and rear stair - indicative extent",
)

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "scripts"))
from ceiling_levels import CEILING_LEVELS, level_first_floor_ceiling
INTERIOR_FINISHES = json.loads((PROJECT / "scripts" / "interior-finishes.json").read_text())
# These are actual room finishes stored outside the canonical exterior scene.
# Keep this explicit so camera-only presentation backdrops remain excluded.
AUTHORED_INTERIOR_CEILINGS = (
    "Bedroom 1 / room ceiling",
    "Bedroom 2 / ceiling",
    "Bathroom photo / bathroom ceiling",
    "Small bedroom / ceiling",
)
# The presentation ceilings share the roof's underside plane. Give the finish
# 3 mm of clearance in the game export to avoid coincident depth surfaces.
CEILING_FINISH_CLEARANCE = 0.003
UPPER_LANDING_FINISH_BOTTOM = 5.298
UPPER_LANDING_CAP_OBJECTS = (
    "Stair photo / white plaster lintel above door",
    *(f"first / source masonry {index:03d}" for index in range(38, 70)),
)
FIRST_LANDING_FINISH_BOTTOM = 2.398
FIRST_LANDING_CAP_OBJECTS = tuple(f"ground / source masonry {index:03d}" for index in range(36, 84))
INTERIOR_CEILINGS = tuple(finish["name"] for finish in INTERIOR_FINISHES) + AUTHORED_INTERIOR_CEILINGS
DOOR_DETAIL_PATTERNS = [re.compile(pattern, re.IGNORECASE) for pattern in
                        json.loads((PROJECT / "scripts" / "door-details.json").read_text())]
SOURCE = Path(bpy.data.filepath).resolve()
MODEL_DIR = PROJECT / "public" / "models"
GLB_PATH = MODEL_DIR / "house.glb"
MANIFEST_PATH = MODEL_DIR / "house-manifest.json"
COLLISION_PATH = PROJECT / "src" / "shared" / "house-collision.json"
CLOSET_MANIFEST_PATH = PROJECT / "src" / "shared" / "closets-manifest.json"
CLOSET_COLLISION_EXCLUSIONS = frozenset(
    json.loads(CLOSET_MANIFEST_PATH.read_text()).get("collisionExcludedSourceNames", ())
)

LAUNDRY_COLLISION_EXCLUSIONS = frozenset(json.loads((PROJECT / "src" / "shared" / "laundry-source-names.json").read_text()))


def collection_names(obj: bpy.types.Object) -> tuple[str, ...]:
    return tuple(collection.name for collection in obj.users_collection)


def is_door_leaf(obj: bpy.types.Object) -> bool:
    """Remove architectural moving leaves while retaining frames and furniture doors."""
    name = obj.name.lower()
    if any(pattern.search(obj.name) for pattern in DOOR_DETAIL_PATTERNS):
        return True
    exact_fragments = (
        "ground straight doorway / bedroom door leaf",
        "ground room doors / laundry / white flush door leaf",
        "ground bathroom photo / bathroom entry flush leaf",
        "stair photo / plain flush ivory door leaf",
        "stair photo / dark door reveal",
        "rear photo / black laundry door leaf",
        "upper reference door / bathroom / flush pale oak leaf",
        "upper reference door / bedroom 1 / flush pale oak leaf",
        "upper reference door / bedroom 2 / flush pale oak leaf",
        "upper reference door / bedroom 3 / flush pale oak leaf",
        "upper reference door / storage / flush pale oak leaf",
    )
    if any(fragment in name for fragment in exact_fragments):
        return True
    if name == "garage / bicycle room door" or name.startswith("garage door joint"):
        return True
    if name == "street photo / garage recessed backing" or name.startswith("street photo / garage horizontal section"):
        return True
    # The photographed entrance leaf is assembled from rails, panes and stiles.
    if name.startswith("entrance photo / door "):
        return True
    # Remove the moving portions of the rear veranda sliders, retain outer frame/sill.
    if name.startswith("rear photo / veranda two panel sliding doors"):
        return not any(word in name for word in ("outer jamb", "outer rail", "stone sill"))
    return False


def is_helper(obj: bpy.types.Object) -> bool:
    if obj.name in INTERIOR_CEILINGS:
        return False
    name = obj.name.lower()
    collections = tuple(value.lower() for value in collection_names(obj))
    if obj.hide_render:
        return True
    helper_tokens = ("labels", "reference only", "dimensions", "review studio", "interior ceiling", "ceiling for review")
    if collections and all(any(token in collection for token in helper_tokens) for collection in collections):
        return True
    if any(token in name for token in (
        "plan label", "dimension line", "dimension text", "measurement",
        "camera", "review ceiling", "interior ceiling",
    )):
        return True
    return False


def is_near_house(obj: bpy.types.Object) -> bool:
    """Keep the house and immediate front/rear/side exterior, drop distant context."""
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    min_x, max_x = min(point.x for point in points), max(point.x for point in points)
    min_y, max_y = min(point.y for point in points), max(point.y for point in points)
    return max_x >= -1.0 and min_x <= 8.5 and max_y >= -1.0 and min_y <= 13.5


def is_visual(obj: bpy.types.Object) -> bool:
    # Render the authored scene, including small hardware, seams and planting.
    # Only presentation helpers and the intentionally open room doors are omitted.
    return obj.type in {"MESH", "CURVE"} and not is_helper(obj) and not is_door_leaf(obj)


def is_collision(obj: bpy.types.Object) -> bool:
    if obj.name in INTERIOR_CEILINGS:
        return True
    # Movable storage pieces and authored solid carcasses are rebuilt as
    # dynamic closed-pose boxes and hollow shells by the closet runtime. Skip
    # their exact source objects here so opening them cannot leave ghost
    # triangles behind. Names come from the Blender-derived inventory; avoid
    # spatial deletion because built-ins often touch walls and worktops.
    if obj.name in CLOSET_COLLISION_EXCLUSIONS or obj.name in LAUNDRY_COLLISION_EXCLUSIONS:
        return False
    if obj.type not in {"MESH", "CURVE"} or is_helper(obj) or is_door_leaf(obj) or not is_near_house(obj):
        return False
    # Every visible physical part is landable, regardless of its collection,
    # size, or tessellation. Keep authored triangles rather than object-wide
    # boxes, which would seal chair legroom, shelves, and curved openings.
    # Printed overlays have no separate physical thickness.
    return "decal" not in obj.name.lower() and "mat print" not in obj.name.lower()


def canonical_objects(scene: bpy.types.Scene) -> list[bpy.types.Object]:
    objects: set[bpy.types.Object] = set()
    for name in ROOT_NAMES:
        collection = bpy.data.collections.get(name)
        if collection is None:
            raise RuntimeError(f"Missing canonical collection: {name}")
        objects.update(collection.all_objects)
    objects.update(interior_finishes(scene))
    for name in AUTHORED_INTERIOR_CEILINGS:
        ceiling = bpy.data.objects.get(name)
        if ceiling is None:
            raise RuntimeError(f"Missing authored interior ceiling: {name}")
        if name not in scene.objects:
            scene.collection.objects.link(ceiling)
        ceiling.matrix_world = Matrix.Translation((0, 0, -CEILING_FINISH_CLEARANCE)) @ ceiling.matrix_world
        objects.add(ceiling)
    return sorted((obj for obj in objects if obj.name not in CEILING_LEVELS["removedPanels"]), key=lambda item: item.name)


def interior_finishes(scene: bpy.types.Scene) -> list[bpy.types.Object]:
    """Close measured ceiling joins in the export only; never save the source file.

    The source walls stop at the authored finish height, below the structural
    slab. These simple solids join those surfaces and also provide collision.
    Explicit vertices avoid stale transforms on objects from presentation scenes.
    """
    result = []
    for finish in INTERIOR_FINISHES:
        x0, y0, z0 = finish["min"]
        x1, y1, z1 = finish["max"]
        mesh = bpy.data.meshes.new(finish["name"] + " / closed solid")
        mesh.from_pydata([
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
        ], [], [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
        mesh.materials.append(bpy.data.materials["Warm white plaster"])
        ceiling = bpy.data.objects.get(finish["name"])
        if ceiling is None:
            ceiling = bpy.data.objects.new(finish["name"], mesh)
        else:
            ceiling.data = mesh
            ceiling.modifiers.clear()
        ceiling.matrix_world = Matrix.Identity(4)
        if ceiling.name not in scene.objects:
            scene.collection.objects.link(ceiling)
        result.append(ceiling)
    return result


def separate_landing_caps(objects: list[bpy.types.Object]) -> dict[str, list[str]]:
    """Put hidden plaster wall caps below both timber floors in export memory.

    Ground-floor masonry ends at source Z 2.410 m and first-floor masonry and the
    stair-door lintel end at Z 5.310 m, exactly on the respective timber finishes.
    Their upward caps therefore shimmer through the timber from grazing cameras.
    Sink only those concealed top rings to each finish underside. Vertical faces
    remain closed and the authored .blend is never saved.
    """
    by_name = {obj.name: obj for obj in objects}
    repaired = {"first": [], "upper": []}
    repairs = (
        ("first", FIRST_LANDING_CAP_OBJECTS, 2.410, FIRST_LANDING_FINISH_BOTTOM),
        ("upper", UPPER_LANDING_CAP_OBJECTS, 5.310, UPPER_LANDING_FINISH_BOTTOM),
    )
    for landing, names, source_top, export_top in repairs:
        for name in names:
            obj = by_name.get(name)
            if obj is None:
                raise RuntimeError(f"Missing {landing} landing cap object: {name}")
            if obj.type != "MESH":
                raise RuntimeError(f"{landing.title()} landing cap object is not a mesh: {name}")
            obj.data = obj.data.copy()
            inverse = obj.matrix_world.inverted()
            changed = 0
            for vertex in obj.data.vertices:
                world = obj.matrix_world @ vertex.co
                if abs(world.z - source_top) <= 0.001:
                    world.z = export_top
                    vertex.co = inverse @ world
                    changed += 1
            if changed:
                obj.data.update()
                repaired[landing].append(name)
    if "ground / source masonry 036" not in repaired["first"]:
        raise RuntimeError("First landing wall cap was not repaired")
    if "Stair photo / white plaster lintel above door" not in repaired["upper"]:
        raise RuntimeError("Upper landing lintel top ring was not repaired")
    return repaired


def collision_positions(objects: list[bpy.types.Object]) -> tuple[list[float], int]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    positions: list[float] = []
    used = 0
    inventory = []
    for obj in objects:
        if not is_collision(obj):
            continue
        evaluated = obj.evaluated_get(depsgraph)
        try:
            mesh = evaluated.to_mesh(preserve_all_data_layers=False, depsgraph=depsgraph)
        except RuntimeError as error:
            raise RuntimeError(f"Could not export solid collision: {obj.name}") from error
        if mesh is None:
            raise RuntimeError(f"Missing collision mesh: {obj.name}")
        mesh.calc_loop_triangles()
        if not mesh.loop_triangles:
            raise RuntimeError(f"Empty collision mesh: {obj.name}")
        matrix = obj.matrix_world
        triangles = mesh.loop_triangles
        first_triangle = len(positions) // 9
        for triangle in triangles:
            for index in triangle.vertices:
                vertex = matrix @ mesh.vertices[index].co
                positions.extend((
                    round(vertex.x * GAME_SCALE, 5),
                    round(vertex.z * GAME_SCALE, 5),
                    round(-vertex.y * GAME_SCALE, 5),
                ))
        inventory.append({"name": obj.name, "firstTriangle": first_triangle,
                          "triangleCount": len(positions) // 9 - first_triangle})
        used += 1
        evaluated.to_mesh_clear()
    audit_path = PROJECT / "src" / "shared" / "house-collision-inventory.json"
    audit_path.write_text(json.dumps({
        "objects": inventory,
        "excluded": [{"name": obj.name, "reason":
            "runtime laundry" if obj.name in LAUNDRY_COLLISION_EXCLUSIONS else
            "runtime cabinet" if obj.name in CLOSET_COLLISION_EXCLUSIONS else
            "runtime door" if is_door_leaf(obj) else
            "outside playable surroundings" if not is_near_house(obj) else
            "printed overlay"}
            for obj in objects if is_visual(obj) and not is_collision(obj)],
    }, indent=2) + "\n")
    return positions, used


def indexed_collision(positions: list[float]) -> dict:
    """Share identical vertices without changing any collision surfaces."""
    vertices, indices, lookup = [], [], {}
    for offset in range(0, len(positions), 3):
        vertex = tuple(positions[offset:offset + 3])
        index = lookup.get(vertex)
        if index is None:
            index = len(vertices) // 3
            lookup[vertex] = index
            vertices.extend(vertex)
        indices.append(index)
    return {"positions": vertices, "indices": indices}


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    COLLISION_PATH.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes.get(SOURCE_SCENE)
    if scene is None:
        raise RuntimeError(f"Missing canonical scene: {SOURCE_SCENE}")
    bpy.context.window.scene = scene
    objects = canonical_objects(scene)
    level_first_floor_ceiling(objects)
    bpy.context.view_layer.update()
    landing_cap_repairs = separate_landing_caps(objects)
    visual = [obj for obj in objects if is_visual(obj)]

    print(f"Canonical objects: {len(objects)}; visual: {len(visual)}", flush=True)
    if "--bake-only" in sys.argv:
        sys.path.insert(0, str(PROJECT / "scripts"))
        from bake_material_colors import bake_material_colors, unbaked_procedural_materials
        visual, baked_materials = bake_material_colors(scene, visual)
        unbaked = unbaked_procedural_materials(visual)
        report = {
            "bakedProceduralMaterialCount": len(baked_materials),
            "bakedProceduralMaterials": baked_materials,
            "unbakedLinkedBaseColorMaterials": unbaked,
        }
        report_path = PROJECT / "test-results" / "procedural-bake-report.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        if unbaked:
            raise RuntimeError(f"Procedural Base Color remains unbaked: {unbaked}")
        print(f"Bake-only validation wrote {report_path}", flush=True)
        return

    collision_modifiers = []
    for obj in objects:
        for modifier in obj.modifiers:
            if modifier.type in {"BEVEL", "SUBSURF"}:
                collision_modifiers.append((modifier, modifier.show_viewport, modifier.show_render))
                modifier.show_viewport = False
                modifier.show_render = False
    bpy.context.view_layer.update()
    positions, collision_objects = collision_positions(objects)
    # Collision stays lightweight. Restore every original modifier for rendering.
    for modifier, viewport, render in collision_modifiers:
        modifier.show_viewport = viewport
        modifier.show_render = render
    bpy.context.view_layer.update()
    COLLISION_PATH.write_text(json.dumps(indexed_collision(positions), separators=(",", ":")))
    collision_triangles = len(positions) // 9
    print(f"Collision: {collision_objects} objects, {collision_triangles} triangles", flush=True)
    if "--collision-only" in sys.argv:
        if MANIFEST_PATH.exists():
            manifest = json.loads(MANIFEST_PATH.read_text())
            manifest["sourceSha256"] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
            manifest["collisionObjectCount"] = collision_objects
            manifest["collisionTriangleCount"] = collision_triangles
            manifest["collisionSha256"] = hashlib.sha256(COLLISION_PATH.read_bytes()).hexdigest()
            manifest["upperLandingCapClearance"] = {
                "sourceTopMeters": 5.31,
                "exportTopMeters": UPPER_LANDING_FINISH_BOTTOM,
                "objects": landing_cap_repairs["upper"],
            }
            manifest["firstLandingCapClearance"] = {
                "sourceTopMeters": 2.41,
                "exportTopMeters": FIRST_LANDING_FINISH_BOTTOM,
                "objects": landing_cap_repairs["first"],
            }
            MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
        # Collision-only exports do not change either visual GLB. Keep the
        # verified GPU package's collision provenance in sync without requiring
        # texture recompression; a stale visual source still fails verification.
        gpu_manifest_path = MODEL_DIR / "house-gpu-manifest.json"
        if gpu_manifest_path.exists() and GLB_PATH.exists():
            gpu_manifest = json.loads(gpu_manifest_path.read_text())
            if gpu_manifest.get("sourceSha256") == hashlib.sha256(GLB_PATH.read_bytes()).hexdigest():
                gpu_manifest["collisionSha256"] = hashlib.sha256(COLLISION_PATH.read_bytes()).hexdigest()
                gpu_manifest_path.write_text(json.dumps(gpu_manifest, indent=2) + "\n")
        print(f"Wrote {COLLISION_PATH} ({COLLISION_PATH.stat().st_size / 1_000_000:.1f} MB)", flush=True)
        return

    # The lamp's lathed cap contains duplicate pole vertices. Welding those
    # coincident vertices prevents its original bevel from producing NaNs in glTF.
    # Keep the shape and bevel; do not disable visual modifiers as a workaround.
    repaired_meshes = []
    for obj in visual:
        if obj.name.startswith("Dining ceiling lamp / round ceiling canopy"):
            obj.data = obj.data.copy()
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=1e-7)
            bmesh.ops.dissolve_degenerate(mesh, edges=list(mesh.edges), dist=1e-8)
            mesh.to_mesh(obj.data)
            mesh.free()
            obj.data.update()
            repaired_meshes.append(obj.name)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in visual:
        if obj.name not in repaired_meshes:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        if any(not math.isfinite(value) for vertex in mesh.vertices for value in vertex.co):
            raise RuntimeError(f"Non-finite visual geometry: {obj.name}")
        evaluated.to_mesh_clear()

    # Modify only the in-memory scene; the original .blend is never saved.
    sys.path.insert(0, str(PROJECT / "scripts"))
    from bake_material_colors import bake_material_colors, unbaked_procedural_materials
    visual, baked_materials = bake_material_colors(scene, visual)
    unbaked_materials = unbaked_procedural_materials(visual)
    if unbaked_materials:
        raise RuntimeError(f"Procedural Base Color remains unbaked: {unbaked_materials}")
    bpy.ops.object.select_all(action="DESELECT")
    scale = Matrix.Scale(GAME_SCALE, 4)
    original_matrices = {obj: obj.matrix_world.copy() for obj in visual}
    for obj in visual:
        obj.parent = None
        obj.matrix_world = scale @ original_matrices[obj]
        obj.hide_set(False)
        obj.select_set(True)
    scene.view_layers[0].objects.active = visual[0] if visual else None

    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        use_active_scene=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_attributes=False,
        export_draco_mesh_compression_enable=False,
    )

    manifest = {
        "source": str(SOURCE),
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "sourceScene": SOURCE_SCENE,
        "sourceCollections": list(ROOT_NAMES),
        "restoredInteriorCeilings": list(INTERIOR_CEILINGS),
        "interiorFinishRepairs": INTERIOR_FINISHES,
        "firstFloorCeilingLevel": CEILING_LEVELS,
        "upperCeilingClearanceMeters": CEILING_FINISH_CLEARANCE,
        "upperLandingCapClearance": {
            "sourceTopMeters": 5.31,
            "exportTopMeters": UPPER_LANDING_FINISH_BOTTOM,
            "objects": landing_cap_repairs["upper"],
        },
        "firstLandingCapClearance": {
            "sourceTopMeters": 2.41,
            "exportTopMeters": FIRST_LANDING_FINISH_BOTTOM,
            "objects": landing_cap_repairs["first"],
        },
        "coordinateTransform": "(x, z, -y) * 3",
        "uniformScale": GAME_SCALE,
        "sourceFloorElevationsMeters": [0.0, 2.41, 5.31],
        "gameFloorElevations": [0.0, 7.23, 15.93],
        "canonicalObjectCount": len(objects),
        "visualObjectCount": len(visual),
        "collisionObjectCount": collision_objects,
        "collisionTriangleCount": collision_triangles,
        "collisionSha256": hashlib.sha256(COLLISION_PATH.read_bytes()).hexdigest(),
        "disabledBevelOrSubdivisionModifiers": 0,
        "collisionOnlySimplifiedModifiers": len(collision_modifiers),
        "visualDetail": "Authored modifiers, small parts, planting and original textures retained",
        "repairedDuplicatePoleVertices": repaired_meshes,
        "bakedProceduralMaterialCount": len(baked_materials),
        "bakedProceduralMaterials": baked_materials,
        "unbakedLinkedBaseColorMaterials": unbaked_materials,
        "removedDoorLeaves": [obj.name for obj in objects if is_door_leaf(obj)],
        "omissions": ["labels/helpers/review ceilings", "cameras/lights", "operable room door leaves and attached hardware"],
        "houseBounds": {"min": [0.0, -0.6, -32.8803], "max": [22.14245, 27.84, 0.0]},
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {GLB_PATH} ({GLB_PATH.stat().st_size / 1_000_000:.1f} MB)", flush=True)
    print(f"Wrote {COLLISION_PATH} ({COLLISION_PATH.stat().st_size / 1_000_000:.1f} MB)", flush=True)
    print(f"Wrote {MANIFEST_PATH}", flush=True)


if __name__ == "__main__":
    main()
