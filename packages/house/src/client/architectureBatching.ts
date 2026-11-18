import * as THREE from 'three';
import { COMIC_STYLE } from './comicStyle';

type SourceAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
type TypedArrayConstructor = new (length: number) => THREE.TypedArray;

interface SourceRange {
  id: number;
  vertexDomain: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrixWorld: THREE.Matrix4;
  normalMatrix: THREE.Matrix3;
  mirrored: boolean;
  orderSensitive: boolean;
  renderOrder: number;
  start: number;
  count: number;
  baseKey: string;
}

interface BatchPlan {
  material: THREE.Material;
  renderOrder: number;
  cell: readonly [number, number, number];
  parts: Map<SourceRange, number[]>;
}

const INITIAL_CELL_SIZE = 4;
const CELL_SIZES = [INITIAL_CELL_SIZE, 6, 9, 13.5] as const;
// `?cells=12` forces one cell size (game units) for batching experiments.
// Comic style has GPU headroom but is CPU-bound on per-object culling and draw
// calls, so it uses large 36-unit cells (measured: −23% CPU, +0.5 ms GPU).
const FORCED_CELL = typeof location === 'undefined' ? 0
  : Number(new URLSearchParams(location.search).get('cells')) || (COMIC_STYLE ? 36 : 0);
const vertexValue = new THREE.Vector3();

function arrayName(attribute: SourceAttribute): string {
  return attribute.array.constructor.name;
}

function geometryLayout(geometry: THREE.BufferGeometry): string {
  return Object.keys(geometry.attributes).sort().map(name => {
    const attribute = geometry.getAttribute(name) as SourceAttribute;
    const gpuType = attribute instanceof THREE.BufferAttribute ? attribute.gpuType : '';
    return `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}:${arrayName(attribute)}:${gpuType}`;
  }).join('|');
}

function prepareGeometry(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('House geometry is missing its position attribute');
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  }
}

function collectSourceRanges(source: THREE.Group): {
  ranges: SourceRange[];
  originals: Set<THREE.BufferGeometry>;
} {
  const ranges: SourceRange[] = [];
  const originals = new Set<THREE.BufferGeometry>();
  let rangeId = 0;
  let vertexDomain = 0;

  source.updateMatrixWorld(true);
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;

    const geometry = object.geometry;
    originals.add(geometry);
    prepareGeometry(geometry);
    const layout = geometryLayout(geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const elementCount = geometry.index?.count ?? geometry.getAttribute('position').count;
    const drawStart = Math.max(0, geometry.drawRange.start);
    const drawEnd = Math.min(elementCount, Number.isFinite(geometry.drawRange.count)
      ? drawStart + geometry.drawRange.count : elementCount);
    const materialRanges = geometry.groups.length && materials.length > 1
      ? geometry.groups
      : [{ start: 0, count: elementCount, materialIndex: 0 }];
    const matrixWorld = object.matrixWorld.clone();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);
    const mirrored = matrixWorld.determinant() < 0;
    const domain = vertexDomain++;

    for (const group of materialRanges) {
      const material = materials[group.materialIndex ?? 0];
      if (!material) continue;
      const start = Math.max(group.start, drawStart);
      const end = Math.min(group.start + group.count, drawEnd);
      const count = Math.floor(Math.max(0, end - start) / 3) * 3;
      if (!count) continue;

      // Transparent and transmissive source ranges stay independent and whole.
      // Combining or spatially splitting them changes the renderer's depth
      // sorting unit and can reorder layered glass or decals.
      const orderSensitive = material.transparent
        || (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0);
      const transparentKey = orderSensitive ? `|transparent:${rangeId}` : '';
      ranges.push({
        id: rangeId,
        vertexDomain: domain,
        geometry,
        material,
        matrixWorld,
        normalMatrix,
        mirrored,
        orderSensitive,
        renderOrder: object.renderOrder,
        start,
        count,
        baseKey: `${material.uuid}|${layout}|order:${object.renderOrder}${transparentKey}`,
      });
      rangeId += 1;
    }
  });

  return { ranges, originals };
}

function forEachTriangle(
  range: SourceRange,
  visit: (a: number, b: number, c: number, cellX: number, cellY: number, cellZ: number) => boolean | void,
  cellSize: number,
): void {
  const index = range.geometry.index;
  const position = range.geometry.getAttribute('position') as SourceAttribute;
  const aPosition = new THREE.Vector3();
  const bPosition = new THREE.Vector3();
  const cPosition = new THREE.Vector3();
  const end = range.start + range.count;

  for (let offset = range.start; offset < end; offset += 3) {
    const a = index ? index.getX(offset) : offset;
    let b = index ? index.getX(offset + 1) : offset + 1;
    let c = index ? index.getX(offset + 2) : offset + 2;
    if (cellSize <= 0) {
      if (range.mirrored) [b, c] = [c, b];
      if (visit(a, b, c, 0, 0, 0) === false) break;
      continue;
    }
    aPosition.fromBufferAttribute(position, a).applyMatrix4(range.matrixWorld);
    bPosition.fromBufferAttribute(position, b).applyMatrix4(range.matrixWorld);
    cPosition.fromBufferAttribute(position, c).applyMatrix4(range.matrixWorld);

    // Assign the complete triangle by the center of its actual world-space AABB.
    // The triangle itself is never clipped; final geometry bounds include all of
    // its vertices and therefore remain conservative when it crosses a cell edge.
    const centerX = (Math.min(aPosition.x, bPosition.x, cPosition.x)
      + Math.max(aPosition.x, bPosition.x, cPosition.x)) * 0.5;
    const centerY = (Math.min(aPosition.y, bPosition.y, cPosition.y)
      + Math.max(aPosition.y, bPosition.y, cPosition.y)) * 0.5;
    const centerZ = (Math.min(aPosition.z, bPosition.z, cPosition.z)
      + Math.max(aPosition.z, bPosition.z, cPosition.z)) * 0.5;
    if (range.mirrored) [b, c] = [c, b];
    if (visit(
      a,
      b,
      c,
      Math.floor(centerX / cellSize),
      Math.floor(centerY / cellSize),
      Math.floor(centerZ / cellSize),
    ) === false) break;
  }
}

function batchCount(ranges: SourceRange[], cellSize: number, stopAfter: number): number {
  const keys = new Set<string>();
  for (const range of ranges) {
    if (range.orderSensitive) {
      keys.add(`${range.baseKey}|cell:0,0,0`);
      if (keys.size > stopAfter) return keys.size;
      continue;
    }
    forEachTriangle(range, (_a, _b, _c, x, y, z) => {
      keys.add(`${range.baseKey}|cell:${x},${y},${z}`);
      return keys.size <= stopAfter;
    }, cellSize);
    if (keys.size > stopAfter) return keys.size;
  }
  return keys.size;
}

function chooseCellSize(ranges: SourceRange[]): number {
  if (FORCED_CELL > 0) return FORCED_CELL;
  const baseKeys = new Set(ranges.map(range => range.baseKey));
  // Permit spatial detail in proportion to the irreducible material/layout
  // count, while bounding the amount of tiny GPU objects in highly varied files.
  const batchLimit = Math.max(baseKeys.size, Math.min(640, Math.max(256, baseKeys.size * 5)));
  for (const size of CELL_SIZES) {
    if (batchCount(ranges, size, batchLimit) <= batchLimit) return size;
  }
  return CELL_SIZES[CELL_SIZES.length - 1];
}

function partitionTriangles(ranges: SourceRange[], cellSize: number): Map<string, BatchPlan> {
  const batches = new Map<string, BatchPlan>();
  for (const range of ranges) {
    forEachTriangle(range, (a, b, c, x, y, z) => {
      const cell: readonly [number, number, number] = range.orderSensitive ? [0, 0, 0] : [x, y, z];
      const key = `${range.baseKey}|cell:${cell.join(',')}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { material: range.material, renderOrder: range.renderOrder, cell, parts: new Map() };
        batches.set(key, batch);
      }
      let indices = batch.parts.get(range);
      if (!indices) {
        indices = [];
        batch.parts.set(range, indices);
      }
      indices.push(a, b, c);
    }, range.orderSensitive ? 0 : cellSize);
  }
  return batches;
}

function makeAttribute(attribute: SourceAttribute, count: number, transformed: boolean): THREE.BufferAttribute {
  const array = transformed
    ? new Float32Array(count * attribute.itemSize)
    : new (attribute.array.constructor as TypedArrayConstructor)(count * attribute.itemSize);
  const result = new THREE.BufferAttribute(array, attribute.itemSize, transformed ? false : attribute.normalized);
  if (!transformed && attribute instanceof THREE.BufferAttribute) result.gpuType = attribute.gpuType;
  return result;
}

function copyVertex(
  name: string,
  source: SourceAttribute,
  sourceIndex: number,
  target: THREE.BufferAttribute,
  targetIndex: number,
  range: SourceRange,
): void {
  for (let component = 0; component < source.itemSize; component += 1) {
    target.setComponent(targetIndex, component, source.getComponent(sourceIndex, component));
  }

  if (name === 'position') {
    vertexValue.fromBufferAttribute(source, sourceIndex).applyMatrix4(range.matrixWorld);
    target.setXYZ(targetIndex, vertexValue.x, vertexValue.y, vertexValue.z);
  } else if (name === 'normal') {
    vertexValue.fromBufferAttribute(source, sourceIndex).applyNormalMatrix(range.normalMatrix);
    target.setXYZ(targetIndex, vertexValue.x, vertexValue.y, vertexValue.z);
  } else if (name === 'tangent') {
    vertexValue.fromBufferAttribute(source, sourceIndex).transformDirection(range.matrixWorld);
    target.setXYZ(targetIndex, vertexValue.x, vertexValue.y, vertexValue.z);
    if (source.itemSize > 3 && range.mirrored) target.setW(targetIndex, -source.getComponent(sourceIndex, 3));
  }
}

function buildGeometry(batch: BatchPlan): THREE.BufferGeometry {
  const domainMaps = new Map<number, Map<number, number>>();
  const domainSources = new Map<number, SourceRange>();
  let vertexCount = 0;
  let indexCount = 0;

  for (const [range, indices] of batch.parts) {
    let vertices = domainMaps.get(range.vertexDomain);
    if (!vertices) {
      vertices = new Map();
      domainMaps.set(range.vertexDomain, vertices);
      domainSources.set(range.vertexDomain, range);
    }
    for (const sourceIndex of indices) {
      if (!vertices.has(sourceIndex)) vertices.set(sourceIndex, vertexCount++);
    }
    indexCount += indices.length;
  }

  const firstRange = batch.parts.keys().next().value as SourceRange | undefined;
  if (!firstRange) throw new Error('Unable to prepare empty house geometry batch');
  const geometry = new THREE.BufferGeometry();
  const attributeNames = Object.keys(firstRange.geometry.attributes);
  for (const name of attributeNames) {
    const source = firstRange.geometry.getAttribute(name) as SourceAttribute;
    geometry.setAttribute(name, makeAttribute(source, vertexCount, name === 'position' || name === 'normal' || name === 'tangent'));
  }

  for (const [domain, vertices] of domainMaps) {
    const range = domainSources.get(domain)!;
    for (const [sourceIndex, targetIndex] of vertices) {
      for (const name of attributeNames) {
        copyVertex(
          name,
          range.geometry.getAttribute(name) as SourceAttribute,
          sourceIndex,
          geometry.getAttribute(name) as THREE.BufferAttribute,
          targetIndex,
          range,
        );
      }
    }
  }

  const outputIndices = vertexCount <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
  let indexOffset = 0;
  for (const [range, indices] of batch.parts) {
    const vertices = domainMaps.get(range.vertexDomain)!;
    for (const sourceIndex of indices) outputIndices[indexOffset++] = vertices.get(sourceIndex)!;
  }
  geometry.setIndex(new THREE.BufferAttribute(outputIndices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function freezeTransform(object: THREE.Object3D): void {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
  object.matrixWorldAutoUpdate = false;
  object.matrixWorldNeedsUpdate = false;
}

/**
 * Bake the authored house into compact, spatially local material batches.
 * Materials and their texture objects remain shared with the loaded GLTF.
 */
export function batchArchitecture(source: THREE.Group): THREE.Group {
  const { ranges, originals } = collectSourceRanges(source);
  const cellSize = chooseCellSize(ranges);
  const batches = partitionTriangles(ranges, cellSize);
  const result = new THREE.Group();
  result.name = 'Oude Terelststraat 15';

  try {
    for (const batch of batches.values()) {
      const geometry = buildGeometry(batch);
      const mesh = new THREE.Mesh(geometry, batch.material);
      mesh.name = `architecture ${batch.cell.join(',')}`;
      mesh.renderOrder = batch.renderOrder;
      mesh.castShadow = !batch.material.transparent
        && !(batch.material instanceof THREE.MeshPhysicalMaterial && batch.material.transmission > 0);
      mesh.receiveShadow = true;
      freezeTransform(mesh);
      result.add(mesh);
      batch.parts.clear();
    }
  } catch (error) {
    for (const child of result.children) {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    throw error;
  }

  // All output attributes are independent compact buffers. The GLTF source
  // buffers can be released now; cached result clones share only these outputs.
  for (const geometry of originals) geometry.dispose();
  result.updateMatrixWorld(true);
  freezeTransform(result);

  if (import.meta.env.DEV) {
    console.info(`Blender house: ${originals.size} source meshes prepared as ${result.children.length} static material batches (${cellSize}-unit cells).`);
  }
  return result;
}
