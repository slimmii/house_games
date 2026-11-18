"""Audit authored storage parts and emit exact game-space bounds.

Run with Blender so this script can inspect evaluated source geometry::

    Blender --background --factory-startup \
      models/Huis_Oude_Terelststraat_15.blend \
      --python packages/house/scripts/closet-inventory.py -- \
      --output /tmp/closet-source-inventory.json

The source .blend is read only. This utility deliberately emits a broad audit;
the curated gameplay manifest is generated from these records, rather than from
the optimized house GLB, because procedural material baking joins many authored
objects into material-wide meshes.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector


GAME_SCALE = 3.0
ROOT_NAMES = (
    "00 | GROUND - 2021",
    "01 | FIRST - 2021 + Camber 2025",
    "02 | SECOND - archive reconstruction",
    "03 | ROOFS - removable",
    "04 | SITE and rear stair - indicative extent",
)

CANDIDATE = re.compile(
    r"(?:cabinet|cupboard|closet|wardrobe|armoire|drawer|door|handle|pull|"
    r"vanity|storage|carcass|pedestal|nightstand|bedside|dresser|kallax|"
    r"bookcase|sideboard|shelf|bin|tub|front|refrigerator)",
    re.IGNORECASE,
)


def game_point(point: Vector) -> list[float]:
    """Convert Blender world coordinates to Three.js gameplay coordinates."""
    return [
        round(point.x * GAME_SCALE, 6),
        round(point.z * GAME_SCALE, 6),
        round(-point.y * GAME_SCALE, 6),
    ]


def evaluated_bounds(obj: bpy.types.Object, depsgraph) -> dict[str, list[float]]:
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        # Curves created from world-coordinate splines can retain a stale default
        # bound_box. Evaluated vertices are authoritative for exact handle hits.
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()
    if not points:
        points = [evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box]
    game = [game_point(point) for point in points]
    return {
        "min": [min(point[axis] for point in game) for axis in range(3)],
        "max": [max(point[axis] for point in game) for axis in range(3)],
    }


def canonical_objects() -> list[bpy.types.Object]:
    objects: set[bpy.types.Object] = set()
    for name in ROOT_NAMES:
        collection = bpy.data.collections.get(name)
        if collection is None:
            raise RuntimeError(f"Missing canonical collection: {name}")
        objects.update(collection.all_objects)
    return sorted(objects, key=lambda item: item.name)


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--all",
        action="store_true",
        help="Include every canonical object instead of likely storage candidates.",
    )
    return parser.parse_args(raw)


def main() -> None:
    args = parse_args()
    scene = bpy.data.scenes["01 | HOUSE - exterior"]
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    rows = []
    for obj in canonical_objects():
        collections = sorted(collection.name for collection in obj.users_collection)
        search_text = " | ".join((obj.name, *collections))
        if not args.all and not CANDIDATE.search(search_text):
            continue
        if obj.type not in {"MESH", "CURVE"}:
            continue
        rows.append(
            {
                "name": obj.name,
                "type": obj.type,
                "parent": obj.parent.name if obj.parent else None,
                "collections": collections,
                "materials": [
                    slot.material.name
                    for slot in obj.material_slots
                    if slot.material is not None
                ],
                "bounds": evaluated_bounds(obj, depsgraph),
                "sourceLocation": [round(value, 6) for value in obj.matrix_world.translation],
                "sourceDimensions": [round(value, 6) if math.isfinite(value) else None for value in obj.dimensions],
                "hiddenRender": bool(obj.hide_render),
            }
        )
    payload = {
        "source": str(Path(bpy.data.filepath).resolve()),
        "coordinateTransform": "(x, z, -y) * 3",
        "gameScale": GAME_SCALE,
        "candidateCount": len(rows),
        "objects": rows,
    }
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {args.output} with {len(rows)} candidate objects", flush=True)


if __name__ == "__main__":
    main()
