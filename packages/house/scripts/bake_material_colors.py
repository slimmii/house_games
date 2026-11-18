"""Bake authored procedural Base Color graphs into glTF-compatible textures.

glTF can carry flat Principled factors and image textures, but it cannot encode
Blender Noise, Brick, Color Ramp, or Mix graphs. This module evaluates those
graphs in Cycles and replaces only their Base Color input with an sRGB image.
The source .blend is never saved; all mesh and material changes are in-memory.
"""
from __future__ import annotations

import math
from collections import defaultdict
import json
from pathlib import Path

import bmesh
import bpy


GENERATED_ATTRIBUTE = "game_source_generated"
OBJECT_ATTRIBUTE = "game_source_object"
SOURCE_UV = "game_source_uv"
BAKE_UV = "game_color_bake_uv"


def principled_node(material):
    if material is None or not material.use_nodes or material.node_tree is None:
        return None
    return next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)


_OVERRIDES_PATH = Path(__file__).resolve().parent / "export-material-overrides.json"
# Image-based materials whose graph the glTF exporter already handles (texture
# through a UV Map node). Baking them would discard their world-aligned UVs.
DIRECT_EXPORT_MATERIALS = frozenset(json.loads(_OVERRIDES_PATH.read_text()).get("directExport", ()))


def material_needs_color_bake(material) -> bool:
    """True for linked Base Color graphs that glTF cannot represent directly."""
    principled = principled_node(material)
    if principled is None:
        return False
    if material.name in DIRECT_EXPORT_MATERIALS:
        return False
    base = principled.inputs.get("Base Color")
    if base is None or not base.is_linked:
        return False
    return any(link.from_node.type != "TEX_IMAGE" for link in base.links)


def unbaked_procedural_materials(objects) -> list[str]:
    return sorted({
        slot.material.name
        for obj in objects
        for slot in obj.material_slots
        if material_needs_color_bake(slot.material)
    })


def _add_source_coordinates(mesh) -> None:
    """Store coordinates before material-face splitting or object joining."""
    if not mesh.vertices:
        return
    xs = [vertex.co.x for vertex in mesh.vertices]
    ys = [vertex.co.y for vertex in mesh.vertices]
    zs = [vertex.co.z for vertex in mesh.vertices]
    minimum = (min(xs), min(ys), min(zs))
    extent = (
        max(max(xs) - minimum[0], 1e-9),
        max(max(ys) - minimum[1], 1e-9),
        max(max(zs) - minimum[2], 1e-9),
    )
    generated = mesh.attributes.new(GENERATED_ATTRIBUTE, "FLOAT_VECTOR", "POINT")
    object_co = mesh.attributes.new(OBJECT_ATTRIBUTE, "FLOAT_VECTOR", "POINT")
    for index, vertex in enumerate(mesh.vertices):
        object_co.data[index].vector = vertex.co
        generated.data[index].vector = (
            (vertex.co.x - minimum[0]) / extent[0],
            (vertex.co.y - minimum[1]) / extent[1],
            (vertex.co.z - minimum[2]) / extent[2],
        )

    original_uv = mesh.uv_layers.active
    source_uv = mesh.uv_layers.get(SOURCE_UV) or mesh.uv_layers.new(name=SOURCE_UV)
    if original_uv is not None and original_uv != source_uv:
        for index in range(min(len(original_uv.data), len(source_uv.data))):
            source_uv.data[index].uv = original_uv.data[index].uv


def _split_mesh(mesh, material_index: int):
    part = mesh.copy()
    editable = bmesh.new()
    editable.from_mesh(part)
    bmesh.ops.delete(
        editable,
        geom=[face for face in editable.faces if face.material_index != material_index],
        context="FACES",
    )
    loose = [vertex for vertex in editable.verts if not vertex.link_faces]
    if loose:
        bmesh.ops.delete(editable, geom=loose, context="VERTS")
    editable.to_mesh(part)
    editable.free()
    part.update()
    return part


def _replace_texture_coordinates(material) -> None:
    """Keep Generated/Object/UV evaluation identical after joining bake parts."""
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    generated = nodes.new("ShaderNodeAttribute")
    generated.name = "Game source Generated coordinates"
    generated.attribute_name = GENERATED_ATTRIBUTE
    object_co = nodes.new("ShaderNodeAttribute")
    object_co.name = "Game source Object coordinates"
    object_co.attribute_name = OBJECT_ATTRIBUTE
    source_uv = nodes.new("ShaderNodeUVMap")
    source_uv.name = "Game source UV coordinates"
    source_uv.uv_map = SOURCE_UV

    # Blender procedural textures use Generated coordinates when Vector is
    # unlinked. Make that implicit input explicit before parts are joined.
    procedural_texture_types = {
        "TEX_BRICK", "TEX_CHECKER", "TEX_GRADIENT", "TEX_MAGIC",
        "TEX_MUSGRAVE", "TEX_NOISE", "TEX_VORONOI", "TEX_WAVE",
        "TEX_WHITE_NOISE",
    }
    for node in list(nodes):
        vector = node.inputs.get("Vector")
        if node.type in procedural_texture_types and vector is not None and not vector.is_linked:
            links.new(generated.outputs["Vector"], vector)

    for node in list(nodes):
        if node.type != "TEX_COORD":
            continue
        replacements = {
            "Generated": generated.outputs["Vector"],
            "UV": source_uv.outputs["UV"],
        }
        if getattr(node, "object", None) is None:
            replacements["Object"] = object_co.outputs["Vector"]
        for output_name, replacement in replacements.items():
            output = node.outputs.get(output_name)
            if output is None:
                continue
            for link in list(output.links):
                links.new(replacement, link.to_socket)


def _resolution(material_name: str, face_count: int, part_count: int) -> int:
    name = material_name.lower()
    if "camber" in name and ("oak" in name or "casella" in name):
        return 4096
    if face_count >= 12000 or part_count >= 80:
        return 2048
    return 1024


def bake_material_colors(scene, objects):
    """Return export objects and a manifest report for all procedural color bakes."""
    procedural_sources = {
        slot.material
        for obj in objects
        for slot in obj.material_slots
        if material_needs_color_bake(slot.material)
    }
    if not procedural_sources:
        return objects, []

    material_copies = {source: source.copy() for source in procedural_sources}
    for source, material in material_copies.items():
        material.name = f"{source.name} / game color bake"
        _replace_texture_coordinates(material)

    affected = [
        obj for obj in objects
        if any(slot.material in procedural_sources for slot in obj.material_slots)
    ]
    unaffected = [obj for obj in objects if obj not in affected]
    procedural_parts = defaultdict(list)
    retained_parts = []
    pending_parts = []
    depsgraph = bpy.context.evaluated_depsgraph_get()

    print(
        f"Preparing {len(procedural_sources)} procedural materials on {len(affected)} visual objects",
        flush=True,
    )
    # Evaluate every source before linking any replacement object. Linking into
    # the scene invalidates the dependency graph; interleaving both operations
    # would rebuild the 8k-object house once per replacement.
    for source_index, source_object in enumerate(affected, start=1):
        evaluated = source_object.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(
            evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
        )
        if mesh is None or not mesh.polygons:
            continue
        _add_source_coordinates(mesh)
        material_indices = sorted({polygon.material_index for polygon in mesh.polygons})
        for material_index in material_indices:
            original = mesh.materials[material_index] if material_index < len(mesh.materials) else None
            material = material_copies.get(original, original)
            # The overwhelming majority of authored objects use one material;
            # reuse their evaluated mesh instead of copying it through BMesh.
            part_mesh = mesh if len(material_indices) == 1 else _split_mesh(mesh, material_index)
            if not part_mesh.polygons:
                if part_mesh != mesh:
                    bpy.data.meshes.remove(part_mesh)
                continue
            part_mesh.materials.clear()
            if material is not None:
                part_mesh.materials.append(material)
            for polygon in part_mesh.polygons:
                polygon.material_index = 0
            pending_parts.append((
                f"{source_object.name} / material part",
                source_object.matrix_world.copy(),
                part_mesh,
                original,
                material,
            ))
        if len(material_indices) != 1:
            bpy.data.meshes.remove(mesh)
        if source_index % 250 == 0:
            print(f"Evaluated {source_index}/{len(affected)} affected objects", flush=True)

    for name, matrix, part_mesh, original, material in pending_parts:
        part = bpy.data.objects.new(name, part_mesh)
        scene.collection.objects.link(part)
        part.matrix_world = matrix
        if original in procedural_sources:
            procedural_parts[material].append(part)
        else:
            retained_parts.append(part)
    bpy.context.view_layer.update()

    baked_objects = []
    bake_records = []
    for source, material in sorted(material_copies.items(), key=lambda item: item[0].name):
        parts = procedural_parts[material]
        if not parts:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for part in parts:
            part.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
            joined = bpy.context.object
        else:
            joined = parts[0]
        joined.name = f"{source.name} / baked geometry"
        joined.data.materials.clear()
        joined.data.materials.append(material)
        for polygon in joined.data.polygons:
            polygon.material_index = 0

        bake_uv = joined.data.uv_layers.get(BAKE_UV) or joined.data.uv_layers.new(name=BAKE_UV)
        joined.data.uv_layers.active = bake_uv
        bake_uv.active_render = True
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
        bpy.ops.object.mode_set(mode="OBJECT")

        face_count = len(joined.data.polygons)
        resolution = _resolution(source.name, face_count, len(parts))
        image = bpy.data.images.new(
            f"{source.name} / baked Base Color",
            width=resolution,
            height=resolution,
            alpha=True,
        )
        image.colorspace_settings.name = "sRGB"
        image.file_format = "PNG"
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        principled = principled_node(material)
        base = principled.inputs["Base Color"]
        source_socket = base.links[0].from_socket
        output = next(
            node for node in nodes
            if node.type == "OUTPUT_MATERIAL" and node.is_active_output
        )
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = "Game baked Base Color"
        texture.image = image
        texture.interpolation = "Linear"
        bake_uv_node = nodes.new("ShaderNodeUVMap")
        bake_uv_node.name = "Game baked Base Color UV"
        bake_uv_node.uv_map = BAKE_UV
        links.new(bake_uv_node.outputs["UV"], texture.inputs["Vector"])
        nodes.active = texture
        emission = nodes.new("ShaderNodeEmission")
        emission.name = "Temporary game color bake emission"
        emission.inputs["Strength"].default_value = 1.0
        links.new(source_socket, emission.inputs["Color"])
        for link in list(output.inputs["Surface"].links):
            links.remove(link)
        links.new(emission.outputs["Emission"], output.inputs["Surface"])
        baked_objects.append(joined)
        bake_records.append({
            "source": source,
            "material": material,
            "principled": principled,
            "base": base,
            "output": output,
            "texture": texture,
            "emission": emission,
            "image": image,
            "resolution": resolution,
            "part_count": len(parts),
            "face_count": face_count,
        })

    bpy.ops.object.select_all(action="DESELECT")
    for obj in baked_objects:
        obj.select_set(True)
        obj.hide_render = False
    bpy.context.view_layer.objects.active = baked_objects[0]
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    # The source file can retain a workstation-specific fixed thread count.
    # Use all available CPU cores for this offline emission bake.
    scene.render.threads_mode = "AUTO"
    scene.render.bake.margin = 16
    print(f"Baking {len(bake_records)} exact procedural Base Color textures", flush=True)
    visibility = [(obj, obj.hide_render) for obj in scene.objects if obj not in baked_objects]
    for obj, _hidden in visibility:
        obj.hide_render = True
    try:
        bpy.ops.object.bake(type="EMIT", use_clear=True)
    finally:
        for obj, hidden in visibility:
            obj.hide_render = hidden

    report = []
    for record in bake_records:
        material = record["material"]
        links = material.node_tree.links
        nodes = material.node_tree.nodes
        output = record["output"]
        base = record["base"]
        for link in list(output.inputs["Surface"].links):
            links.remove(link)
        links.new(record["principled"].outputs["BSDF"], output.inputs["Surface"])
        for link in list(base.links):
            links.remove(link)
        # A white factor guarantees the already-evaluated texture is not tinted
        # or multiplied by the source socket default during glTF export.
        base.default_value = (1.0, 1.0, 1.0, 1.0)
        material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
        links.new(record["texture"].outputs["Color"], base)
        nodes.remove(record["emission"])
        record["image"].pack()
        report.append({
            "sourceMaterial": record["source"].name,
            "exportMaterial": material.name,
            "texture": record["image"].name,
            "resolution": record["resolution"],
            "sourceObjectParts": record["part_count"],
            "triangleCount": record["face_count"],
        })
    bpy.context.view_layer.update()
    return unaffected + retained_parts + baked_objects, report
