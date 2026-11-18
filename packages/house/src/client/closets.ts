import { addFridgeInterior, addFridgeDoor } from './fridge';
import * as THREE from 'three';
import { reinstallBakedShader } from './bakedLighting';
import { installProbeShader, reinstallProbeShader } from './probeLighting';
import {
  CLOSET_DOORS,
  CLOSET_DRAWER_BOXES,
  CLOSET_UNITS,
  closetInteriorKind,
  closetShelfHeights,
  closetUnitEntry,
  getClosetStructuralBoxes,
  type ClosetEntry,
  type ClosetUnit,
} from '../shared/closet-interiors';
import { DOORS, doorPartPose } from '../shared/doors';

interface BoundsDefinition {
  min: readonly number[];
  max: readonly number[];
}

export interface ClosetVisualState {
  fraction: number;
}

export interface ClosetPreparationDiagnostics {
  definitions: number;
  movingObjects: number;
  removedObjects: number;
  generatedShells: number;
  generatedDrawerTrays: number;
  missingFronts: string[];
  missingAttachments: string[];
  missingRemovals: string[];
}

const DEFINITIONS = CLOSET_DOORS;
const DYNAMIC_ROOT_NAME = 'operable-closets';
const PIVOT_PREFIX = 'closet-pivot:';
const INTERIOR_PREFIX = 'closet-interior:';
const PANEL_THICKNESS = 0.045;

const point = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function sourceName(object: THREE.Object3D): string {
  return typeof object.userData.name === 'string' ? object.userData.name : object.name;
}

function vector(values: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(values[0], values[1], values[2]);
}

function centerOf(bounds: BoundsDefinition): THREE.Vector3 {
  return vector(bounds.min).add(vector(bounds.max)).multiplyScalar(0.5);
}

function sizeOf(bounds: BoundsDefinition): THREE.Vector3 {
  return vector(bounds.max).sub(vector(bounds.min));
}

function addBox(
  parent: THREE.Object3D,
  name: string,
  size: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(
    Math.max(0.008, size.x), Math.max(0.008, size.y), Math.max(0.008, size.z),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function interiorMaterials(): {
  board: THREE.MeshStandardMaterial;
  drawer: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  pipe: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
} {
  const board = new THREE.MeshStandardMaterial({
    name: 'Cabinet interior / warm white melamine',
    color: '#ece9df', roughness: 0.62, metalness: 0,
  });
  const drawer = new THREE.MeshStandardMaterial({
    name: 'Drawer interior / linen grey',
    color: '#cfcabf', roughness: 0.72, metalness: 0,
  });
  const metal = new THREE.MeshStandardMaterial({
    name: 'Wardrobe interior / brushed chrome rail',
    color: '#c7c8c5', roughness: 0.28, metalness: 0.86,
  });
  const pipe = new THREE.MeshStandardMaterial({
    name: 'Sink cabinet / white waste pipe',
    color: '#e7e5dd', roughness: 0.42, metalness: 0,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: 'Cabinet interior / clear shelf glass',
    color: '#dcebea', roughness: 0.16, metalness: 0,
    transparent: true, opacity: 0.42, depthWrite: false,
  });
  for (const material of [board, drawer, metal, pipe, glass]) installProbeShader(material);
  return { board, drawer, metal, pipe, glass };
}

interface CabinetFrame {
  group: THREE.Group;
  width: number;
  height: number;
  depth: number;
  frontCenter: THREE.Vector3;
}

/**
 * Define a right-handed cabinet coordinate system: X is left-to-right, Y is
 * vertical, and positive Z points out through the closed front.
 */
function cabinetFrame(
  definition: ClosetEntry,
  unit: ClosetUnit,
  parent: THREE.Object3D,
): CabinetFrame {
  const interior: BoundsDefinition = {
    min: unit.interior.min,
    max: unit.interior.max,
  };
  const cavityCenter = centerOf(interior);
  const cavitySize = sizeOf(interior);
  const frontCenter = centerOf(definition);
  const frontSize = sizeOf(definition);
  const normalAxis = frontSize.x <= frontSize.z ? 0 : 2;
  let sign = Math.sign(frontCenter.getComponent(normalAxis) - cavityCenter.getComponent(normalAxis));
  if (!sign) sign = Math.sign(definition.slide[normalAxis]) || 1;

  const normal = normalAxis === 0
    ? new THREE.Vector3(sign, 0, 0)
    : new THREE.Vector3(0, 0, sign);
  const tangent = normalAxis === 0
    ? new THREE.Vector3(0, 0, -sign)
    : new THREE.Vector3(sign, 0, 0);
  const basis = new THREE.Matrix4().makeBasis(tangent, up, normal);
  const group = new THREE.Group();
  group.name = `${INTERIOR_PREFIX}${definition.id}`;
  group.position.copy(cavityCenter);
  group.quaternion.setFromRotationMatrix(basis);
  group.userData.closetId = definition.id;
  group.userData.closetInterior = true;
  parent.add(group);
  group.updateMatrixWorld(true);
  point.copy(frontCenter);
  group.worldToLocal(point);
  return {
    group,
    width: normalAxis === 0 ? cavitySize.z : cavitySize.x,
    height: cavitySize.y,
    depth: normalAxis === 0 ? cavitySize.x : cavitySize.z,
    frontCenter: point.clone(),
  };
}

function addFixedInterior(
  definition: ClosetEntry,
  unit: ClosetUnit,
  parent: THREE.Object3D,
  materials: ReturnType<typeof interiorMaterials>,
  generateShell: boolean,
): CabinetFrame | undefined {
  const frame = cabinetFrame(definition, unit, parent);
  const { group, width, height, depth } = frame;
  const t = Math.min(PANEL_THICKNESS, width * 0.06, height * 0.04, depth * 0.09);
  const kind = closetInteriorKind(definition, unit);

  // Render the same world boxes used by collision. The first five are left,
  // right, bottom, top, and back (minus any intentionally open L-corner
  // side); later boxes are shelves and bay partitions.
  const shelfCount = closetShelfHeights(unit, definition).length;
  const shellPanelCount = 5 - (unit.openSides?.length ?? 0);
  for (const [index, box] of (unit.authoredStructureBounds ? [] : getClosetStructuralBoxes(unit.id)).entries()) {
    if (!generateShell && index < shellPanelCount - 1) continue;
    const min = vector(box.min), max = vector(box.max);
    const isShelf = index >= shellPanelCount && index < shellPanelCount + shelfCount;
    const fridgeDivider = unit.id === 'kitchen-fridge' && Math.abs((box.min[1] + box.max[1]) / 2 - 12.585) < .001;
    const material = isShelf && !fridgeDivider && (kind === 'glass' || kind === 'cold') ? materials.glass : materials.board;
    const panel = addBox(parent, `closet structure ${unit.id} ${index + 1}`,
      max.clone().sub(min), min.add(max).multiplyScalar(0.5), material);
    panel.userData.closetUnitId = unit.id;
    panel.userData.closetStaticCollider = true;
  }

  // Complete authored cabinetry remains in the source scene and already has
  // its real finish and proportions. The frame is still returned so drawer
  // trays can attach, but no generic shelf, reveal, rail, or hanger is layered
  // over the retained boards.
  if (unit.authoredStructureBounds) return frame;

  // The authored fronts already define the opening seams. Extra dark strips
  // here coincide with their beveled edges and flicker through closed doors.

  if (kind === 'wardrobe') {
    const railY = height * 0.19;
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, Math.max(0.12, width - 3 * t), 12),
      materials.metal,
    );
    rail.name = 'wardrobe clothes rail';
    rail.position.set(0, railY, depth * 0.12);
    rail.rotation.z = Math.PI * 0.5;
    rail.castShadow = false;
    rail.receiveShadow = true;
    group.add(rail);

    // Three slim hangers make the rail read as a clothes compartment while
    // keeping the empty cabinet useful for flight and visual inspection.
    for (let index = -1; index <= 1; index++) {
      const hanger = new THREE.Group();
      hanger.name = `wardrobe hanger ${index + 2}`;
      hanger.position.set(index * Math.min(0.23, width * 0.18), railY - 0.03, depth * 0.12);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 5, 10, Math.PI * 1.35), materials.metal);
      hook.rotation.y = Math.PI * 0.5;
      hook.rotation.z = -Math.PI * 0.18;
      hook.position.y = -0.035;
      const armLength = Math.min(0.22, width * 0.24);
      const leftShoulder = addBox(hanger, 'hanger left shoulder',
        new THREE.Vector3(armLength, 0.016, 0.016),
        new THREE.Vector3(-armLength * 0.46, -0.145, 0), materials.metal);
      leftShoulder.rotation.z = 0.36;
      const rightShoulder = addBox(hanger, 'hanger right shoulder',
        new THREE.Vector3(armLength, 0.016, 0.016),
        new THREE.Vector3(armLength * 0.46, -0.145, 0), materials.metal);
      rightShoulder.rotation.z = -0.36;
      addBox(hanger, 'hanger trouser bar',
        new THREE.Vector3(armLength * 1.75, 0.014, 0.014),
        new THREE.Vector3(0, -0.185, 0), materials.metal);
      hanger.add(hook);
      group.add(hanger);
    }
  } else if (kind === 'sink') {
    const pipeRadius = Math.min(0.065, width * 0.06);
    const downPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(pipeRadius, pipeRadius, height * 0.34, 12), materials.pipe,
    );
    downPipe.name = 'sink waste downpipe';
    downPipe.position.set(0, height * 0.23, -depth * 0.18);
    group.add(downPipe);
    const trap = new THREE.Mesh(
      new THREE.TorusGeometry(pipeRadius * 1.8, pipeRadius, 8, 14, Math.PI), materials.pipe,
    );
    trap.name = 'sink waste trap';
    trap.position.set(0, height * 0.04, -depth * 0.18);
    trap.rotation.y = Math.PI * 0.5;
    group.add(trap);
  } else if (kind === 'cold') {
    addFridgeInterior(group, unit, definition, width, height, depth);
  }
  return frame;
}

function addDrawerTray(
  definition: ClosetEntry,
  frame: CabinetFrame,
  pivot: THREE.Group,
  materials: ReturnType<typeof interiorMaterials>,
): void {
  const tray = new THREE.Group();
  tray.name = `closet-tray:${definition.id}`;
  tray.userData.closetId = definition.id;
  // Build directly from the shared closed-pose collision boxes. Rendering and
  // collision therefore describe the same bottom, sides, and rear wall.
  for (const [index, box] of (CLOSET_DRAWER_BOXES[definition.id] ?? []).entries()) {
    // Partly authored trays keep their original fabric sides; only missing
    // bottom/back panels need generated geometry.
    const authoredName = definition.authoredTrayBounds?.[index]?.name;
    if (authoredName && definition.attachedNames.includes(authoredName)) continue;
    const min = vector(box.min), max = vector(box.max);
    const mesh = addBox(tray, `drawer tray panel ${index + 1}`, max.clone().sub(min),
      min.add(max).multiplyScalar(0.5), materials.drawer);
    mesh.userData.closetCollider = true;
  }
  pivot.parent!.add(tray);
  pivot.parent!.updateWorldMatrix(true, true);
  pivot.updateWorldMatrix(true, false);
  pivot.attach(tray);
}

function addSyntheticGrip(
  definition: ClosetEntry,
  pivot: THREE.Group,
  dynamicRoot: THREE.Group,
  material: THREE.Material,
): void {
  if (definition.handleNames.length) return;
  const frontCenter = centerOf(definition);
  const frontSize = sizeOf(definition);
  const normalAxis: 0 | 2 = Math.abs(definition.outward[0] ?? 0) >= Math.abs(definition.outward[2] ?? 0) ? 0 : 2;
  const tangentAxis: 0 | 2 = normalAxis === 0 ? 2 : 0;
  const sign = Math.sign(definition.outward[normalAxis] ?? 0) || 1;
  const target = definition.targetBoxes[0];
  const targetSize = target ? sizeOf(target) : new THREE.Vector3();
  const targetIsHandleSized = target
    && targetSize.getComponent(tangentAxis) < 0.55
    && targetSize.y < 0.65;
  const center = targetIsHandleSized ? centerOf(target) : frontCenter.clone();
  if (!targetIsHandleSized) {
    const pivotCoordinate = definition.pivot[tangentAxis];
    const low = definition.min[tangentAxis], high = definition.max[tangentAxis];
    center.setComponent(tangentAxis,
      Math.abs(pivotCoordinate - low) < Math.abs(pivotCoordinate - high) ? high - 0.16 : low + 0.16);
  }
  center.setComponent(normalAxis,
    targetIsHandleSized
      ? center.getComponent(normalAxis)
      : (sign > 0 ? definition.max[normalAxis] : definition.min[normalAxis]) + sign * 0.035);
  const size = targetIsHandleSized ? targetSize : new THREE.Vector3(
    0.045, Math.min(0.34, Math.max(0.15, frontSize.y * 0.2)), 0.045,
  );
  if (!targetIsHandleSized) size.setComponent(normalAxis, 0.06);
  const grip = addBox(dynamicRoot, `closet-grip:${definition.id}`, size, center, material);
  grip.userData.closetId = definition.id;
  grip.userData.closetHandleTarget = true;
  dynamicRoot.updateWorldMatrix(true, true);
  pivot.updateWorldMatrix(true, false);
  pivot.attach(grip);
}

function buildNameIndex(source: THREE.Object3D): Map<string, THREE.Object3D[]> {
  const index = new Map<string, THREE.Object3D[]>();
  source.traverse(object => {
    const name = sourceName(object);
    if (!name) return;
    const matches = index.get(name);
    if (matches) matches.push(object);
    else index.set(name, [object]);
  });
  return index;
}

function resolveObjects(index: Map<string, THREE.Object3D[]>, names: readonly string[]): {
  objects: THREE.Object3D[];
  missing: string[];
} {
  const objects: THREE.Object3D[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const found = index.get(name);
    if (!found?.length) missing.push(name);
    else objects.push(...found);
  }
  return { objects, missing };
}

function topLevelSelection(objects: readonly THREE.Object3D[]): THREE.Object3D[] {
  const selected = new Set(objects);
  return objects.filter(object => {
    let parent = object.parent;
    while (parent) {
      if (selected.has(parent)) return false;
      parent = parent.parent;
    }
    return true;
  });
}

/**
 * Architecture materials may have been cloned to FrontSide by the static
 * back-face optimization before closets are detached. A number of authored
 * fronts are only a thin surface, so opening one would otherwise make its
 * cabinet-facing side disappear. Clone the finish again for moving fronts;
 * never mutate the material still used by the batched static house.
 */
function makeMovingFrontDoubleSided(
  object: THREE.Object3D,
  clones: Map<THREE.Material, THREE.Material>,
): void {
  const movingMaterial = (source: THREE.Material): THREE.Material => {
    let clone = clones.get(source);
    if (!clone) {
      clone = source.clone();
      clone.side = THREE.DoubleSide;
      clone.shadowSide = THREE.DoubleSide;
      // clone() keeps userData but drops the compile hook; put the bake back.
      reinstallBakedShader(clone);
      reinstallProbeShader(clone);
      clone.needsUpdate = true;
      clones.set(source, clone);
    }
    return clone;
  };
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map(movingMaterial)
      : movingMaterial(child.material);
  });
}

interface GeometryPartition {
  indices: number[];
  groups: Array<{ start: number; count: number; materialIndex: number }>;
}

function partitionGeometryByWorldBox(
  mesh: THREE.Mesh,
  target: THREE.Box3,
): { selected: GeometryPartition; remainder: GeometryPartition } {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const count = index?.count ?? position.count;
  const sourceGroups = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count, materialIndex: 0 }];
  const selected: GeometryPartition = { indices: [], groups: [] };
  const remainder: GeometryPartition = { indices: [], groups: [] };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

  for (const sourceGroup of sourceGroups) {
    const selectedStart = selected.indices.length;
    const remainderStart = remainder.indices.length;
    const end = Math.min(count, sourceGroup.start + sourceGroup.count);
    for (let offset = sourceGroup.start; offset + 2 < end; offset += 3) {
      const ai = index ? index.getX(offset) : offset;
      const bi = index ? index.getX(offset + 1) : offset + 1;
      const ci = index ? index.getX(offset + 2) : offset + 2;
      a.fromBufferAttribute(position, ai).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, bi).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ci).applyMatrix4(mesh.matrixWorld);
      // Requiring every vertex avoids stealing an adjacent shelf/side triangle
      // merely because its centroid falls in the thin front's bounding box.
      const inside = target.containsPoint(a) && target.containsPoint(b) && target.containsPoint(c);
      (inside ? selected.indices : remainder.indices).push(ai, bi, ci);
    }
    const selectedCount = selected.indices.length - selectedStart;
    const remainderCount = remainder.indices.length - remainderStart;
    if (selectedCount) selected.groups.push({
      start: selectedStart, count: selectedCount, materialIndex: sourceGroup.materialIndex ?? 0,
    });
    if (remainderCount) remainder.groups.push({
      start: remainderStart, count: remainderCount, materialIndex: sourceGroup.materialIndex ?? 0,
    });
  }
  return { selected, remainder };
}

function geometryFromPartition(source: THREE.BufferGeometry, partition: GeometryPartition): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = source.name;
  geometry.userData = { ...source.userData };
  const vertexMap = new Map<number, number>();
  const sourceVertices: number[] = [];
  const indices = partition.indices.map(sourceIndex => {
    let targetIndex = vertexMap.get(sourceIndex);
    if (targetIndex === undefined) {
      targetIndex = sourceVertices.length;
      vertexMap.set(sourceIndex, targetIndex);
      sourceVertices.push(sourceIndex);
    }
    return targetIndex;
  });
  const copyAttribute = (sourceAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const ArrayType = sourceAttribute.array.constructor as new (length: number) => THREE.TypedArray;
    const attribute = new THREE.BufferAttribute(
      new ArrayType(sourceVertices.length * sourceAttribute.itemSize),
      sourceAttribute.itemSize,
      sourceAttribute.normalized,
    );
    attribute.name = sourceAttribute.name;
    if (sourceAttribute instanceof THREE.BufferAttribute) attribute.gpuType = sourceAttribute.gpuType;
    sourceVertices.forEach((sourceIndex, targetIndex) => {
      for (let component = 0; component < sourceAttribute.itemSize; component++) {
        attribute.setComponent(targetIndex, component, sourceAttribute.getComponent(sourceIndex, component));
      }
    });
    return attribute;
  };
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, copyAttribute(attribute));
  }
  for (const [name, attributes] of Object.entries(source.morphAttributes)) {
    (geometry.morphAttributes as Record<string, Array<THREE.BufferAttribute | THREE.InterleavedBufferAttribute>>)[name]
      = attributes.map(copyAttribute);
  }
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  const IndexArray = sourceVertices.length <= 65535 ? Uint16Array : Uint32Array;
  geometry.setIndex(new THREE.BufferAttribute(new IndexArray(indices), 1));
  for (const group of partition.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The color-bake exporter combines some furniture by material. Recover a front
 * from those meshes by its authored world bounds, then leave every other
 * triangle in the static source. Attributes are cloned wholesale so UVs,
 * normals, tangents, and baked-light channels survive the split unchanged.
 */
function extractMergedObject(
  source: THREE.Object3D,
  index: Map<string, THREE.Object3D[]>,
  outputNames: readonly string[],
  bounds: BoundsDefinition,
  candidateNames: readonly string[] = [],
): THREE.Mesh | undefined {
  if (!outputNames.length) return undefined;
  const epsilon = 0.003;
  const target = new THREE.Box3(
    vector(bounds.min).addScalar(-epsilon),
    vector(bounds.max).addScalar(epsilon),
  );
  const candidates: THREE.Mesh[] = [];
  const solidNames = new Set(candidateNames);
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const name = sourceName(object);
    if (!/\/ baked geometry$/i.test(name) && !solidNames.has(name)) return;
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.intersectsBox(target)) candidates.push(object);
  });
  for (const candidate of candidates) {
    const original = candidate.geometry;
    const { selected, remainder } = partitionGeometryByWorldBox(candidate, target);
    if (!selected.indices.length) continue;
    const extracted = new THREE.Mesh(geometryFromPartition(original, selected), candidate.material);
    extracted.name = outputNames[0];
    extracted.userData = { ...candidate.userData, name: outputNames[0], extractedFrom: sourceName(candidate) };
    extracted.position.copy(candidate.position);
    extracted.quaternion.copy(candidate.quaternion);
    extracted.scale.copy(candidate.scale);
    extracted.renderOrder = candidate.renderOrder;
    extracted.visible = candidate.visible;
    candidate.parent?.add(extracted);
    candidate.geometry = geometryFromPartition(original, remainder);
    let sharedUses = 0;
    source.traverse(object => {
      if (object instanceof THREE.Mesh && object.geometry === original) sharedUses += 1;
    });
    if (!sharedUses) original.dispose();
    for (const name of outputNames) index.set(name, [extracted]);
    return extracted;
  }
  return undefined;
}

function carveMergedSolid(source: THREE.Object3D, bounds: BoundsDefinition): number {
  const epsilon = 0.003;
  const target = new THREE.Box3(
    vector(bounds.min).addScalar(-epsilon),
    vector(bounds.max).addScalar(epsilon),
  );
  const candidates: THREE.Mesh[] = [];
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !/\/ baked geometry$/i.test(sourceName(object))) return;
    if (new THREE.Box3().setFromObject(object).intersectsBox(target)) candidates.push(object);
  });
  let triangles = 0;
  for (const candidate of candidates) {
    const original = candidate.geometry;
    const { selected, remainder } = partitionGeometryByWorldBox(candidate, target);
    if (!selected.indices.length) continue;
    triangles += selected.indices.length / 3;
    candidate.geometry = geometryFromPartition(original, remainder);
    let sharedUses = 0;
    source.traverse(object => {
      if (object instanceof THREE.Mesh && object.geometry === original) sharedUses += 1;
    });
    if (!sharedUses) original.dispose();
  }
  return triangles;
}

/**
 * Extract authored fronts and hardware before static architecture batching.
 * The returned root must be added back after batching so these meshes retain
 * their names, pivots, source materials, and independent transforms.
 */
export function prepareClosets(
  source: THREE.Group,
  definitions: readonly ClosetEntry[] = DEFINITIONS,
): THREE.Group {
  source.updateWorldMatrix(true, true);
  const index = buildNameIndex(source);
  const materials = interiorMaterials();
  const dynamicRoot = new THREE.Group();
  dynamicRoot.name = DYNAMIC_ROOT_NAME;
  source.add(dynamicRoot);
  dynamicRoot.updateWorldMatrix(true, false);
  const diagnostics: ClosetPreparationDiagnostics = {
    definitions: definitions.length,
    movingObjects: 0,
    removedObjects: 0,
    generatedShells: 0,
    generatedDrawerTrays: 0,
    missingFronts: [],
    missingAttachments: [],
    missingRemovals: [],
  };
  const moved = new Set<THREE.Object3D>();
  const removed = new Set<THREE.Object3D>();
  const carvedSolidNames = new Set<string>();
  const generatedShells = new Map<string, CabinetFrame>();
  const movingFrontMaterials = new Map<THREE.Material, THREE.Material>();

  for (const definition of definitions) {
    const pivot = new THREE.Group();
    pivot.name = `${PIVOT_PREFIX}${definition.id}`;
    pivot.position.fromArray(definition.pivot);
    pivot.userData.closetId = definition.id;
    pivot.userData.closedPosition = [...definition.pivot];
    pivot.userData.angle = definition.angle;
    pivot.userData.slide = [...definition.slide];
    dynamicRoot.add(pivot);
    pivot.updateWorldMatrix(true, false);

    // A few authored kitchen uppers are single closed solids whose node name is
    // also used as the requested front. Retain that source reference for later
    // removal, and carve only the thin front into the moving pivot.
    const sourceSolids = resolveObjects(index, definition.sourceSolidNames ?? []).objects;
    const sourceSolidNames = new Set(definition.sourceSolidNames ?? []);
    const solidFrontNames = definition.frontNames.filter(name => sourceSolidNames.has(name));
    if (solidFrontNames.length) {
      const extracted = extractMergedObject(
        source, index, solidFrontNames, definition, definition.sourceSolidNames,
      );
      if (!extracted) for (const name of solidFrontNames) index.delete(name);
    }
    let fronts = resolveObjects(index, definition.frontNames);
    if (!solidFrontNames.length && fronts.missing.length) {
      extractMergedObject(source, index, fronts.missing, definition, definition.sourceSolidNames);
      fronts = resolveObjects(index, definition.frontNames);
    }
    const attachmentNames = [
      ...(definition.handleNames ?? []),
      ...(definition.attachedNames ?? []),
    ];
    let attachments = resolveObjects(index, attachmentNames);
    for (const attachment of definition.attachmentBounds ?? []) {
      if (!attachments.missing.includes(attachment.name)) continue;
      extractMergedObject(source, index, [attachment.name], attachment);
    }
    attachments = resolveObjects(index, attachmentNames);
    diagnostics.missingFronts.push(...fronts.missing.map(name => `${definition.id}: ${name}`));
    const generatedAttachment = (name: string) => definition.kind === 'drawer'
      && /(drawer box (?:back|floor|side)|drawer mount|wooden pull)/i.test(name);
    diagnostics.missingAttachments.push(...attachments.missing
      .filter(name => !generatedAttachment(name)).map(name => `${definition.id}: ${name}`));
    for (const object of topLevelSelection(fronts.objects)) {
      makeMovingFrontDoubleSided(object, movingFrontMaterials);
    }
    const handleNames = new Set(definition.handleNames ?? []);
    const selected = topLevelSelection([...fronts.objects, ...attachments.objects]);
    for (const object of selected) {
      if (moved.has(object)) continue;
      object.userData.closetId = definition.id;
      object.userData.closetHandleTarget = handleNames.has(sourceName(object));
      object.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        // The sun's static shadow map is baked after loading. Moving parts must
        // not leave their closed-pose shadow behind when opened.
        child.castShadow = false;
        child.receiveShadow = true;
      });
      pivot.attach(object);
      moved.add(object);
      diagnostics.movingObjects += 1;
    }
    addSyntheticGrip(definition, pivot, dynamicRoot, materials.metal);
    addFridgeDoor(definition, pivot, dynamicRoot);

    const removalNames = [
      ...(definition.removeNames ?? []),
      ...(definition.sourceSolidNames ?? []),
    ];
    const removals = resolveObjects(index, removalNames);
    for (const object of topLevelSelection([...removals.objects, ...sourceSolids])) {
      if (moved.has(object) || removed.has(object)) continue;
      object.removeFromParent();
      removed.add(object);
      diagnostics.removedObjects += 1;
    }

    // Some solid carcasses were merged into a material-bake node. Their exact
    // evaluated bounds let us cut those triangles away before the hollow shell
    // is added, without touching neighbouring furniture in the merged mesh.
    for (const solid of definition.sourceSolidBounds ?? []) {
      if (carvedSolidNames.has(solid.name) || sourceSolids.some(object => sourceName(object) === solid.name)) {
        carvedSolidNames.add(solid.name);
        continue;
      }
      if (carveMergedSolid(source, solid) > 0) carvedSolidNames.add(solid.name);
    }
    diagnostics.missingRemovals.push(...removals.missing
      .filter(name => !generatedAttachment(name))
      .filter(name => !carvedSolidNames.has(name))
      .map(name => `${definition.id}: ${name}`));

    const unit = CLOSET_UNITS.find(candidate => candidate.id === definition.unitId);
    if (!unit) continue;
    const shellKey = unit.id;
    let frame = generatedShells.get(shellKey);
    if (!frame) {
      const interiorDefinition = closetUnitEntry(unit.id) ?? definition;
      const existingBodies = resolveObjects(index, unit.bodyNames ?? []).objects
        .some(object => !removed.has(object));
      frame = addFixedInterior(interiorDefinition, unit, dynamicRoot, materials,
        !existingBodies || (interiorDefinition.sourceSolidNames?.length ?? 0) > 0);
      if (frame) {
        generatedShells.set(shellKey, frame);
        diagnostics.generatedShells += 1;
      }
    }
    if (frame && definition.kind === 'drawer' && !definition.authoredTrayVisual) {
      addDrawerTray(definition, frame, pivot, materials);
      diagnostics.generatedDrawerTrays += 1;
    }
  }

  dynamicRoot.userData.closetDiagnostics = diagnostics;
  dynamicRoot.removeFromParent();
  dynamicRoot.updateMatrixWorld(true);
  if (import.meta.env?.DEV) {
    console.info('Operable closet preparation', diagnostics);
    if (diagnostics.missingFronts.length) {
      console.warn('Operable closets have missing authored fronts', diagnostics.missingFronts);
    }
  }
  return dynamicRoot;
}

/** Rebind a controller to the named pivots in a clone of the cached house. */
export function createClosets(
  parent: THREE.Object3D,
  definitions: readonly ClosetEntry[] = DEFINITIONS,
): {
  update(states: readonly ClosetVisualState[]): void;
  dispose(): void;
  readonly diagnostics?: ClosetPreparationDiagnostics;
} {
  const root = parent.getObjectByName(DYNAMIC_ROOT_NAME);
  const pivots = definitions.map(definition => {
    const pivot = parent.getObjectByName(`${PIVOT_PREFIX}${definition.id}`);
    return pivot instanceof THREE.Group ? pivot : undefined;
  });
  // Snapshots use the unified room-door + closet-door ordering. Resolve by id
  // so this remains correct if either manifest grows or is reordered.
  const stateIndices = definitions.map(definition => DOORS.findIndex(door => door.id === definition.id));
  if (import.meta.env?.DEV) {
    const missing = definitions.filter((_definition, index) => !pivots[index]).map(definition => definition.id);
    if (missing.length) console.warn('Operable closet pivots missing from cloned house', missing);
  }
  return {
    update(states) {
      pivots.forEach((pivot, index) => {
        if (!pivot) return;
        const stateIndex = stateIndices[index];
        const fraction = THREE.MathUtils.clamp(states[stateIndex]?.fraction ?? 0, 0, 1);
        const pose=doorPartPose(stateIndex,fraction);
        pivot.rotation.set(pose.rotationX,pose.rotationY,pose.rotationZ);
        pivot.position.fromArray(pose.position);
      });
    },
    dispose() { root?.removeFromParent(); },
    diagnostics: root?.userData.closetDiagnostics as ClosetPreparationDiagnostics | undefined,
  };
}
